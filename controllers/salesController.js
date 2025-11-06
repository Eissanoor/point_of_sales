const Sales = require('../models/salesModel');
const Product = require('../models/productModel');
const SalesJourney = require('../models/salesJourneyModel');
const StockTransfer = require('../models/stockTransferModel');

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
    { $match: { destinationType: 'warehouse', destinationId: product.warehouse ? { $exists: true } : { $exists: true } } },
    { $match: { destinationType: 'warehouse', destinationId: new (require('mongoose').Types.ObjectId)(warehouseId) } },
    { $unwind: '$items' },
    { $match: { 'items.product': new (require('mongoose').Types.ObjectId)(productId) } },
    { $group: { _id: null, qty: { $sum: '$items.quantity' } } }
  ]);
  available += incoming.length > 0 ? Number(incoming[0].qty || 0) : 0;

  // Outgoing transfers from this warehouse for this product
  const outgoing = await StockTransfer.aggregate([
    { $match: { sourceType: 'warehouse', sourceId: new (require('mongoose').Types.ObjectId)(warehouseId) } },
    { $unwind: '$items' },
    { $match: { 'items.product': new (require('mongoose').Types.ObjectId)(productId) } },
    { $group: { _id: null, qty: { $sum: '$items.quantity' } } }
  ]);
  available -= outgoing.length > 0 ? Number(outgoing[0].qty || 0) : 0;

  return available;
}

// Helper: compute available quantity of a product at a specific shop
async function getAvailableQuantityInShop(productId, shopId) {
  const productObjectId = new (require('mongoose').Types.ObjectId)(productId);
  const shopObjectId = new (require('mongoose').Types.ObjectId)(shopId);

  let available = 0;

  // Incoming transfers to this shop for this product
  const incoming = await StockTransfer.aggregate([
    { $match: { destinationType: 'shop', destinationId: shopObjectId } },
    { $unwind: '$items' },
    { $match: { 'items.product': productObjectId } },
    { $group: { _id: null, qty: { $sum: '$items.quantity' } } }
  ]);
  available += incoming.length > 0 ? Number(incoming[0].qty || 0) : 0;

  // Outgoing transfers from this shop for this product
  const outgoing = await StockTransfer.aggregate([
    { $match: { sourceType: 'shop', sourceId: shopObjectId } },
    { $unwind: '$items' },
    { $match: { 'items.product': productObjectId } },
    { $group: { _id: null, qty: { $sum: '$items.quantity' } } }
  ]);
  available -= outgoing.length > 0 ? Number(outgoing[0].qty || 0) : 0;

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

      // If a shop is provided, validate availability in the shop based on transfers
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
      }

      // Determine warehouse to check
      const targetWarehouse = item.warehouse || warehouse || product.warehouse;
      if (!targetWarehouse) {
        return res.status(400).json({
          status: 'fail',
          message: `No warehouse specified for product ${product.name}`,
          product: product.name
        });
      }

      // Compute available quantity at target warehouse based on transfers and base stock
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

    // Update product quantities
    for (const item of items) {
      // Get the product
      const product = await Product.findById(item.product);
      const currentSoldOutQuantity = product.soldOutQuantity || 0;
      
      // Update global counts
      product.countInStock -= item.quantity;
      product.soldOutQuantity = currentSoldOutQuantity + item.quantity;
      
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

    if (!sale) {
      return res.status(404).json({
        status: 'fail',
        message: 'Sale not found',
      });
    }

    const originalItems = Array.isArray(sale.items)
      ? sale.items.map(it => ({ product: it.product, quantity: it.quantity }))
      : [];

    // Collect changes for journey
    const changes = [];

    // Fields that may be updated directly on the sale
    const updatableFields = [
      'customer', 'totalAmount', 'discount', 'tax', 'grandTotal',
      'paymentStatus', 'dueDate', 'shop', 'warehouse', 'invoiceNumber', 'notes'
    ];
    for (const key of updatableFields) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) {
        if (String(sale[key] ?? '') !== String(req.body[key] ?? '')) {
          changes.push({ field: key, oldValue: sale[key], newValue: req.body[key] });
          sale[key] = req.body[key];
        }
      }
    }

    // Handle complete replacement of items (supports JSON string via multipart)
    if (typeof req.body.items !== 'undefined') {
      let nextItems = req.body.items;
      if (typeof nextItems === 'string') {
        try {
          nextItems = JSON.parse(nextItems);
        } catch (e) {
          return res.status(400).json({ status: 'fail', message: 'Invalid items format. Must be a JSON array.' });
        }
      }
      if (!Array.isArray(nextItems)) {
        return res.status(400).json({ status: 'fail', message: 'Items must be an array.' });
      }

      // Validate items
      for (const item of nextItems) {
        if (!item.product || !item.quantity || !item.price) {
          return res.status(400).json({
            status: 'fail',
            message: 'Each item must have: product, quantity, price',
          });
        }
      }

      // Check products exist
      const productIds = nextItems.map(i => i.product);
      const products = await Product.find({ _id: { $in: productIds } });
      if (products.length !== productIds.length) {
        return res.status(400).json({ status: 'fail', message: 'One or more products not found' });
      }

      // Revert stock/sold counts for original items
      for (const old of originalItems) {
        const product = await Product.findById(old.product);
        if (!product) continue;
        const currentSold = product.soldOutQuantity || 0;
        product.countInStock += Number(old.quantity || 0);
        product.soldOutQuantity = Math.max(0, currentSold - Number(old.quantity || 0));
        await product.save();
      }

      // Apply new items to sale with computed line totals
      const replacedItems = nextItems.map(it => ({
        ...it,
        total: Number(it.price || 0) * Number(it.quantity || 0)
      }));
      sale.items = replacedItems;

      // Apply stock/sold updates for new items
      for (const item of replacedItems) {
        const product = await Product.findById(item.product);
        if (!product) continue;
        const currentSold = product.soldOutQuantity || 0;
        product.countInStock -= Number(item.quantity || 0);
        product.soldOutQuantity = currentSold + Number(item.quantity || 0);
        await product.save();
      }

      // If header totals not explicitly provided, recompute from items
      if (!Object.prototype.hasOwnProperty.call(req.body, 'totalAmount')) {
        const sum = sale.items.reduce((s, it) => s + Number(it.total || 0), 0);
        sale.totalAmount = sum;
      }
      if (!Object.prototype.hasOwnProperty.call(req.body, 'grandTotal')) {
        const sum = Number(sale.totalAmount || 0) - Number(sale.discount || 0) + Number(sale.tax || 0);
        sale.grandTotal = sum;
      }
    }

    // Handle delta adjustments (add or subtract products/quantities)
    // itemsAdjust: [{ product, quantity, price }], where quantity > 0 adds to sale, quantity < 0 subtracts from sale
    if (typeof req.body.itemsAdjust !== 'undefined') {
      let adjustments = req.body.itemsAdjust;
      if (typeof adjustments === 'string') {
        try {
          adjustments = JSON.parse(adjustments);
        } catch (e) {
          return res.status(400).json({ status: 'fail', message: 'Invalid itemsAdjust format. Must be a JSON array.' });
        }
      }
      if (!Array.isArray(adjustments)) {
        return res.status(400).json({ status: 'fail', message: 'itemsAdjust must be an array.' });
      }

      // Normalize product id strings
      const toIdString = (v) => (v && v.toString ? v.toString() : String(v));
      const currentItems = Array.isArray(sale.items) ? sale.items : [];

      // Build quick lookup for current quantities and indices
      const productIdToIndex = new Map();
      for (let i = 0; i < currentItems.length; i++) {
        productIdToIndex.set(toIdString(currentItems[i].product), i);
      }

      // First pass: validate availability for positive adds
      for (const adj of adjustments) {
        if (!adj.product || typeof adj.quantity !== 'number') {
          return res.status(400).json({ status: 'fail', message: 'Each itemsAdjust entry must include product and numeric quantity' });
        }
        if (adj.quantity > 0) {
          // Ensure enough stock exists to add this quantity
          const product = await Product.findById(adj.product);
          if (!product) return res.status(404).json({ status: 'fail', message: 'Product not found in itemsAdjust' });
          if (Number(product.countInStock || 0) < adj.quantity) {
            return res.status(400).json({
              status: 'fail',
              message: `Insufficient inventory for product ${product.name}. Available: ${product.countInStock || 0}, Requested add: ${adj.quantity}`,
            });
          }
        }
      }

      // Second pass: apply adjustments and update product inventory
      for (const adj of adjustments) {
        const pid = toIdString(adj.product);
        const qty = Number(adj.quantity || 0);
        const idx = productIdToIndex.has(pid) ? productIdToIndex.get(pid) : -1;

        // Fetch product for inventory updates
        const product = await Product.findById(pid);
        if (!product) continue;
        const currentSold = product.soldOutQuantity || 0;

        if (qty > 0) {
          // Add quantity to sale
          if (idx >= 0) {
            currentItems[idx].quantity = Number(currentItems[idx].quantity || 0) + qty;
            // If price provided, update price
            if (typeof adj.price !== 'undefined') currentItems[idx].price = adj.price;
            // Update line total
            currentItems[idx].total = Number(currentItems[idx].price || 0) * Number(currentItems[idx].quantity || 0);
          } else {
            // Need price to add a new line
            if (typeof adj.price === 'undefined') {
              return res.status(400).json({ status: 'fail', message: 'itemsAdjust requires price when adding a new product' });
            }
            currentItems.push({ product: pid, quantity: qty, price: adj.price, total: Number(adj.price || 0) * qty });
            productIdToIndex.set(pid, currentItems.length - 1);
          }
          // Update inventory
          product.countInStock -= qty;
          product.soldOutQuantity = currentSold + qty;
          await product.save();
        } else if (qty < 0) {
          // Subtract quantity from sale
          if (idx < 0) {
            return res.status(400).json({ status: 'fail', message: 'Cannot subtract product not present in sale' });
          }
          const removeQty = Math.min(Math.abs(qty), Number(currentItems[idx].quantity || 0));
          currentItems[idx].quantity = Number(currentItems[idx].quantity || 0) - removeQty;
          // Update or remove line total
          if (currentItems[idx] && currentItems[idx].quantity > 0) {
            currentItems[idx].total = Number(currentItems[idx].price || 0) * Number(currentItems[idx].quantity || 0);
          }
          // If line hits zero, remove it
          if (currentItems[idx].quantity <= 0) {
            currentItems.splice(idx, 1);
            productIdToIndex.delete(pid);
            // Re-index remaining items for correctness
            for (let i = 0; i < currentItems.length; i++) {
              productIdToIndex.set(toIdString(currentItems[i].product), i);
            }
          }
          // Restore inventory
          product.countInStock += removeQty;
          product.soldOutQuantity = Math.max(0, currentSold - removeQty);
          await product.save();
        } else {
          // qty === 0: no-op, but allow price update if provided
          if (idx >= 0 && typeof adj.price !== 'undefined') {
            currentItems[idx].price = adj.price;
            currentItems[idx].total = Number(currentItems[idx].price || 0) * Number(currentItems[idx].quantity || 0);
          }
        }
      }

      // Assign adjusted items back
      sale.items = currentItems;

      // If header totals not explicitly provided, recompute from items
      if (!Object.prototype.hasOwnProperty.call(req.body, 'totalAmount')) {
        const sum = sale.items.reduce((s, it) => s + Number(it.total || 0), 0);
        sale.totalAmount = sum;
      }
      if (!Object.prototype.hasOwnProperty.call(req.body, 'grandTotal')) {
        const sum = Number(sale.totalAmount || 0) - Number(sale.discount || 0) + Number(sale.tax || 0);
        sale.grandTotal = sum;
      }
    }

    // Save updated sale
    const updatedSale = await sale.save();

    // Record journey
    await SalesJourney.create({
      sale: sale._id,
      user: req.user._id,
      action: 'updated',
      changes,
      notes: 'Sale updated',
    });

    res.json({
      status: 'success',
      data: updatedSale,
    });
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