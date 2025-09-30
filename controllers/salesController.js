const Sales = require('../models/salesModel');
const Product = require('../models/productModel');
const SalesJourney = require('../models/salesJourneyModel');
const StockTransfer = require('../models/stockTransferModel');
const mongoose = require('mongoose');

// Helper: compute available quantity of a product at a specific warehouse
async function getAvailableQuantityInWarehouse(productId, warehouseId) {
  // Base: if the product was originally in this warehouse, start with its current countInStock
  const product = await Product.findById(productId).lean();
  if (!product) return 0;

  let available = 0;
  if (product.warehouse && product.warehouse.toString() === warehouseId.toString()) {
    available += Number(product.countInStock || 0);
  }

  // Incoming transfers to this warehouse for this product
  const incoming = await StockTransfer.aggregate([
    { $match: { destinationType: 'warehouse', destinationId: new mongoose.Types.ObjectId(warehouseId) } },
    { $unwind: '$items' },
    { $match: { 'items.product': new mongoose.Types.ObjectId(productId) } },
    { $group: { _id: null, qty: { $sum: '$items.quantity' } } }
  ]);
  available += incoming.length > 0 ? Number(incoming[0].qty || 0) : 0;

  // Outgoing transfers from this warehouse for this product
  const outgoing = await StockTransfer.aggregate([
    { $match: { sourceType: 'warehouse', sourceId: new mongoose.Types.ObjectId(warehouseId) } },
    { $unwind: '$items' },
    { $match: { 'items.product': new mongoose.Types.ObjectId(productId) } },
    { $group: { _id: null, qty: { $sum: '$items.quantity' } } }
  ]);
  available -= outgoing.length > 0 ? Number(outgoing[0].qty || 0) : 0;

  return available;
}

// Helper: compute available quantity of a product at a specific shop
async function getAvailableQuantityInShop(productId, shopId) {
  let available = 0;

  // Incoming transfers to this shop for this product
  const incoming = await StockTransfer.aggregate([
    { $match: { destinationType: 'shop', destinationId: new mongoose.Types.ObjectId(shopId) } },
    { $unwind: '$items' },
    { $match: { 'items.product': new mongoose.Types.ObjectId(productId) } },
    { $group: { _id: null, qty: { $sum: '$items.quantity' } } }
  ]);
  available += incoming.length > 0 ? Number(incoming[0].qty || 0) : 0;

  // Outgoing transfers from this shop for this product
  const outgoing = await StockTransfer.aggregate([
    { $match: { sourceType: 'shop', sourceId: new mongoose.Types.ObjectId(shopId) } },
    { $unwind: '$items' },
    { $match: { 'items.product': new mongoose.Types.ObjectId(productId) } },
    { $group: { _id: null, qty: { $sum: '$items.quantity' } } }
  ]);
  available -= outgoing.length > 0 ? Number(outgoing[0].qty || 0) : 0;

  // Subtract already sold quantities at this shop
  const Sales = require('../models/salesModel');
  const sold = await Sales.aggregate([
    { $match: { shop: new mongoose.Types.ObjectId(shopId) } },
    { $unwind: '$items' },
    { $match: { 'items.product': new mongoose.Types.ObjectId(productId) } },
    { $group: { _id: null, qty: { $sum: '$items.quantity' } } }
  ]);
  available -= sold.length > 0 ? Number(sold[0].qty || 0) : 0;

  return available;
}

// @desc    Create a new sale
// @route   POST /api/sales
// @access  Private
const createSale = async (req, res) => {
  try {
    const { 
      customer, 
      items, 
      totalAmount, 
      discount, 
      tax, 
      grandTotal,
      shop,
      warehouse
    } = req.body;

    // Check product inventory availability for all items
    for (const item of items) {
      // Check if product exists
      const product = await Product.findById(item.product);
      if (!product) {
        return res.status(404).json({
          status: 'fail',
          message: 'Product not found',
        });
      }

      // Determine location to check (shop has priority if provided)
      if (shop) {
        const availableInShop = await getAvailableQuantityInShop(product._id, shop);
        if (availableInShop < item.quantity) {
          return res.status(400).json({
            status: 'fail',
            message: `Insufficient inventory for product ${product.name} in selected shop. Available: ${availableInShop}, Requested: ${item.quantity}`,
            product: product.name,
            availableQuantity: availableInShop,
            requestedQuantity: item.quantity
          });
        }
      } else {
        const targetWarehouse = item.warehouse || warehouse || product.warehouse;
        if (!targetWarehouse) {
          return res.status(400).json({
            status: 'fail',
            message: `No warehouse specified for product ${product.name}`,
            product: product.name
          });
        }
        const availableInWarehouse = await getAvailableQuantityInWarehouse(product._id, targetWarehouse);
        if (availableInWarehouse < item.quantity) {
          return res.status(400).json({
            status: 'fail',
            message: `Insufficient inventory for product ${product.name} in selected warehouse. Available: ${availableInWarehouse}, Requested: ${item.quantity}`,
            product: product.name,
            availableQuantity: availableInWarehouse,
            requestedQuantity: item.quantity
          });
        }
      }
    }

    // Generate invoice number (you can customize this logic)
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    
    // Get count of sales for today to generate sequential number
    const salesCount = await Sales.countDocuments({
      createdAt: {
        $gte: new Date(date.setHours(0, 0, 0, 0)),
        $lt: new Date(date.setHours(23, 59, 59, 999)),
      },
    });
    
    const invoiceNumber = `INV-${year}${month}${day}-${(salesCount + 1).toString().padStart(3, '0')}`;

    // Create new sale
    const sale = await Sales.create({
      invoiceNumber,
      customer,
      items,
      totalAmount,
      discount,
      tax,
      grandTotal,
      paymentStatus: 'unpaid',
      dueDate: req.body.dueDate || new Date(), // Use provided dueDate or default
      user: req.user._id, // Assuming req.user is set by auth middleware
      shop, // Add shop reference
      warehouse // Add warehouse reference
    });

    // Do not reduce global countInStock here; stock is tracked per location via transfers and sales.
    // Optionally, update soldOutQuantity as a global metric.
    for (const item of items) {
      const product = await Product.findById(item.product);
      product.soldOutQuantity = (product.soldOutQuantity || 0) + item.quantity;
      await product.save();
    }

    // Create sales journey record for the new sale
    await SalesJourney.create({
      sale: sale._id,
      user: req.user._id,
      action: 'created',
      changes: [],
      notes: 'Sale created',
    });

    if (sale) {
      res.status(201).json({
        status: 'success',
        data: sale,
      });
    } else {
      res.status(400).json({
        status: 'fail',
        message: 'Invalid sale data',
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get all sales with pagination and filtering
// @route   GET /api/sales
// @access  Private
const getSales = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      startDate, 
      endDate, 
      customer, 
      invoiceNumber 
    } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    let query = {};

    // Filter by date range
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate), //how i provide the date in the query which is in the format of 2025-07-04
        $lte: new Date(endDate),
      };
    }

    // Filter by customer
    if (customer) {
      query.customer = customer;
    }

    // Filter by invoice number
    if (invoiceNumber) {
      query.invoiceNumber = { $regex: invoiceNumber, $options: 'i' };
    }

    // Count total documents for pagination info
    const totalSales = await Sales.countDocuments(query);

    // Find sales based on query with pagination
    const sales = await Sales.find(query)
      .populate('customer', 'name email phoneNumber')
      .populate('items.product', 'name image')
      .limit(limitNum)
      .skip(skip)
      .sort({ createdAt: -1 });
    
    res.json({
      status: 'success',
      results: sales.length,
      totalPages: Math.ceil(totalSales / limitNum),
      currentPage: pageNum,
      totalSales,
      data: sales,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get sale by ID
// @route   GET /api/sales/:id
// @access  Private
const getSaleById = async (req, res) => {
  try {
    const sale = await Sales.findById(req.params.id)
      .populate('customer', 'name email phoneNumber address')
      .populate('items.product', 'name image barcode')
      .populate('user', 'name');

    if (sale) {
      // Get payment information for this sale
      const Payment = require('../models/paymentModel');
      const payments = await Payment.find({ sale: req.params.id })
        .sort({ paymentDate: -1 })
        .populate('user', 'name')
        .populate('currency', 'name code symbol');
      
      // Calculate payment summary
      const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
      const remainingBalance = sale.grandTotal - totalPaid;
      
      res.json({
        status: 'success',
        data: {
          ...sale._doc,
          payments: {
            records: payments,
            summary: {
              totalPaid,
              remainingBalance,
              paymentPercentage: (totalPaid / sale.grandTotal * 100).toFixed(2)
            }
          }
        },
      });
    } else {
      res.status(404).json({
        status: 'fail',
        message: 'Sale not found',
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Update sale by ID
// @route   PUT /api/sales/:id
// @access  Private
const updateSale = async (req, res) => {
  try {
    const sale = await Sales.findById(req.params.id);

    if (sale) {
      // Create sales journey record
      await SalesJourney.create({
        sale: sale._id,
        user: req.user._id,
        action: 'updated',
        changes: [],
        notes: 'Sale updated',
      });

      const updatedSale = await sale.save();

      res.json({
        status: 'success',
        data: updatedSale,
      });
    } else {
      res.status(404).json({
        status: 'fail',
        message: 'Sale not found',
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Delete sale
// @route   DELETE /api/sales/:id
// @access  Private
const deleteSale = async (req, res) => {
  try {
    const sale = await Sales.findById(req.params.id);

    if (sale) {
      // Restore product quantities
      for (const item of sale.items) {
        const product = await Product.findById(item.product);
        
        // Initialize soldOutQuantity to 0 if it's null
        const currentSoldOutQuantity = product.soldOutQuantity || 0;
        const newSoldOutQuantity = Math.max(0, currentSoldOutQuantity - item.quantity);
        
        // Restore global counts
        product.countInStock += item.quantity;
        product.soldOutQuantity = newSoldOutQuantity;
        
        await product.save();
      }

      // Create sales journey record before deleting the sale
      await SalesJourney.create({
        sale: sale._id,
        user: req.user._id,
        action: 'deleted',
        changes: [],
        notes: `Sale with invoice ${sale.invoiceNumber} deleted`,
      });

      await Sales.deleteOne({ _id: req.params.id });
      
      res.json({
        status: 'success',
        message: 'Sale removed',
      });
    } else {
      res.status(404).json({
        status: 'fail',
        message: 'Sale not found',
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get sales grouped by customer with aggregated payment info
// @route   GET /api/sales/by-customer
// @access  Private
const getSalesByCustomer = async (req, res) => {
  try {
    const { 
      startDate, 
      endDate, 
      minTotalAmount,
      maxTotalAmount,
      customer,
      invoiceNumber
    } = req.query;
    
    // Build date filter if provided
    let dateFilter = {};
    if (startDate && endDate) {
      dateFilter = {
        createdAt: {
          $gte: new Date(startDate),
          $lte: new Date(endDate),
        }
      };
    }

    // Add customer filter if provided
    if (customer) {
      dateFilter.customer = require('mongoose').Types.ObjectId(customer);
    }

    // Add invoice number filter if provided
    if (invoiceNumber) {
      dateFilter.invoiceNumber = { $regex: invoiceNumber, $options: 'i' };
    }

    // Aggregate sales by customer
    const customerSales = await Sales.aggregate([
      // Match based on date filter if provided
      { $match: dateFilter },
      
      // Group by customer
      {
        $group: {
          _id: "$customer",
          totalSales: { $sum: 1 },
          totalAmount: { $sum: "$grandTotal" },
          lastPurchaseDate: { $max: "$createdAt" },
          // Get the most recent invoice
          lastInvoice: { 
            $last: {
              $cond: { 
                if: { $eq: [{ $arrayElemAt: [{ $objectToArray: "$$ROOT" }, 0] }, null] }, 
                then: null,
                else: "$invoiceNumber" 
              }
            }
          },
          // Collect invoice numbers to filter by them later
          invoiceNumbers: { $addToSet: "$invoiceNumber" }
        }
      },
      
      // Lookup customer details
      {
        $lookup: {
          from: "customers",
          localField: "_id",
          foreignField: "_id",
          as: "customerDetails"
        }
      },
      
      // Unwind the customerDetails array
      {
        $unwind: {
          path: "$customerDetails",
          preserveNullAndEmptyArrays: true
        }
      },
      
      // Project the final output format
      {
        $project: {
          _id: 1,
          customerId: "$_id",
          customerName: "$customerDetails.name",
          customerEmail: "$customerDetails.email",
          customerPhone: "$customerDetails.phoneNumber",
          totalSales: 1,
          totalAmount: 1,
          lastPurchaseDate: 1,
          lastInvoice: 1,
          invoiceNumbers: 1
        }
      },
      
      // Apply additional filters
      {
        $match: {
          ...(minTotalAmount ? { totalAmount: { $gte: parseFloat(minTotalAmount) } } : {}),
          ...(maxTotalAmount ? { totalAmount: { $lte: parseFloat(maxTotalAmount) } } : {})
        }
      },
      
      // Remove the temporary fields from the final output
      {
        $project: {
          invoiceNumbers: 0
        }
      },
      
      // Sort by total amount in descending order
      { $sort: { totalAmount: -1 } }
    ]);

    res.json({
      status: 'success',
      results: customerSales.length,
      data: customerSales,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get all sales for a specific customer
// @route   GET /api/sales/customer/:customerId
// @access  Private
const getSalesByCustomerId = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { page = 1, limit = 10, startDate, endDate } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    // Build query with customer ID filter
    let query = { customer: customerId };
    
    // Add date range filter if provided
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }
    
    // Get customer details
    const customer = await require('../models/customerModel').findById(customerId);
    if (!customer) {
      return res.status(404).json({
        status: 'fail',
        message: 'Customer not found',
      });
    }
    
    // Count total documents for pagination info
    const totalSales = await Sales.countDocuments(query);
    
    // Find sales for the specific customer with pagination
    const sales = await Sales.find(query)
      .populate('customer', 'name email phoneNumber address')
      .populate({
        path: 'items.product',
        select: 'name image price barcode category',
        populate: {
          path: 'category',
          select: 'name'
        }
      })
      .populate('user', 'name email')
      .limit(limitNum)
      .skip(skip)
      .sort({ createdAt: -1 });
    
    // Calculate aggregated values
    const aggregatedData = await Sales.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$totalAmount" },
          totalDiscount: { $sum: "$discount" },
          totalTax: { $sum: "$tax" },
          totalGrandTotal: { $sum: "$grandTotal" },
          totalSales: { $sum: 1 },
          firstPurchaseDate: { $min: "$createdAt" },
          lastPurchaseDate: { $max: "$createdAt" },
          avgPurchaseAmount: { $avg: "$grandTotal" }
        }
      }
    ]);
    
    // Get top purchased products
    const topProducts = await Sales.aggregate([
      { $match: query },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.product",
          totalQuantity: { $sum: "$items.quantity" },
          totalAmount: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
          count: { $sum: 1 }
        }
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: "products",
          localField: "_id",
          foreignField: "_id",
          as: "productDetails"
        }
      },
      { $unwind: "$productDetails" },
      {
        $project: {
          _id: 1,
          name: "$productDetails.name",
          totalQuantity: 1,
          totalAmount: 1,
          count: 1
        }
      }
    ]);
    
    // Get purchase frequency by month (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    const purchasesByMonth = await Sales.aggregate([
      { 
        $match: { 
          ...query,
          createdAt: { $gte: sixMonthsAgo }
        } 
      },
      {
        $group: {
          _id: { 
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" }
          },
          count: { $sum: 1 },
          totalAmount: { $sum: "$grandTotal" }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } }
    ]);
    
    const summary = aggregatedData.length > 0 ? aggregatedData[0] : {
      totalAmount: 0,
      totalDiscount: 0,
      totalTax: 0,
      totalGrandTotal: 0,
      totalSales: 0,
      firstPurchaseDate: null,
      lastPurchaseDate: null,
      avgPurchaseAmount: 0
    };
    
    // Calculate days since first purchase and last purchase
    const daysSinceFirstPurchase = summary.firstPurchaseDate 
      ? Math.floor((new Date() - new Date(summary.firstPurchaseDate)) / (1000 * 60 * 60 * 24)) 
      : 0;
      
    const daysSinceLastPurchase = summary.lastPurchaseDate 
      ? Math.floor((new Date() - new Date(summary.lastPurchaseDate)) / (1000 * 60 * 60 * 24)) 
      : 0;
    
    // Format purchase frequency data for easier frontend use
    const purchaseFrequency = purchasesByMonth.map(item => ({
      period: `${item._id.year}-${String(item._id.month).padStart(2, '0')}`,
      count: item.count,
      amount: item.totalAmount
    }));
    
    res.json({
      status: 'success',
      results: sales.length,
      totalPages: Math.ceil(totalSales / limitNum),
      currentPage: pageNum,
      totalSales,
      customerInfo: {
        _id: customer._id,
        name: customer.name,
        email: customer.email,
        phoneNumber: customer.phoneNumber,
        address: customer.address
      },
      summary: {
        totalAmount: summary.totalAmount,
        totalDiscount: summary.totalDiscount,
        totalTax: summary.totalTax,
        totalGrandTotal: summary.totalGrandTotal,
        totalSales: summary.totalSales,
        firstPurchaseDate: summary.firstPurchaseDate,
        lastPurchaseDate: summary.lastPurchaseDate,
        daysSinceFirstPurchase,
        daysSinceLastPurchase,
        avgPurchaseAmount: summary.avgPurchaseAmount,
        purchaseFrequency: totalSales > 0 ? (totalSales / (daysSinceFirstPurchase || 1) * 30).toFixed(2) : 0 // Average purchases per month
      },
      analytics: {
        topProducts,
        purchasesByMonth: purchaseFrequency
      },
      data: sales,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

module.exports = {
  createSale,
  getSales,
  getSaleById,
  updateSale,
  deleteSale,
  getSalesByCustomer,
  getSalesByCustomerId,
}; 