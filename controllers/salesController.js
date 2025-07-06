const Sales = require('../models/salesModel');
const Product = require('../models/productModel');
const SalesJourney = require('../models/salesJourneyModel');

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
      paymentMethod, 
      paymentStatus, 
      paidAmount,
      notes 
    } = req.body;

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

    // Calculate due amount if paid amount is less than grand total
    const actualPaidAmount = paidAmount || 0;
    const dueAmount = grandTotal - actualPaidAmount;
    
    // Automatically set payment status based on paid amount
    let autoPaymentStatus = paymentStatus;
    if (!autoPaymentStatus) {
      if (dueAmount <= 0) {
        autoPaymentStatus = 'paid';
      } else if (actualPaidAmount > 0) {
        autoPaymentStatus = 'partial';
      } else {
        autoPaymentStatus = 'unpaid';
      }
    }

    // Create new sale
    const sale = await Sales.create({
      invoiceNumber,
      customer,
      items,
      totalAmount,
      discount,
      tax,
      grandTotal,
      paymentMethod,
      paymentStatus: autoPaymentStatus,
      paidAmount: actualPaidAmount,
      dueAmount,
      notes,
      user: req.user._id, // Assuming req.user is set by auth middleware
    });

    // Update product quantities
    for (const item of items) {
      const product = await Product.findById(item.product);
      
      // Initialize soldOutQuantity to 0 if it's null
      const currentSoldOutQuantity = product.soldOutQuantity || 0;
      
      await Product.findByIdAndUpdate(
        item.product,
        {
          $set: { 
            countInStock: product.countInStock - item.quantity,
            soldOutQuantity: currentSoldOutQuantity + item.quantity
          }
        }
      );
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
      paymentStatus,
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

    // Filter by payment status
    if (paymentStatus) {
      query.paymentStatus = paymentStatus;
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
      res.json({
        status: 'success',
        data: sale,
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
    const { 
      paymentStatus, 
      paidAmount,
      notes 
    } = req.body;

    const sale = await Sales.findById(req.params.id);

    if (sale) {
      // Track changes for sales journey
      const changes = [];
      const paymentDetails = {};
      
      if (paymentStatus && paymentStatus !== sale.paymentStatus) {
        changes.push({
          field: 'paymentStatus',
          oldValue: sale.paymentStatus,
          newValue: paymentStatus
        });
        paymentDetails.previousStatus = sale.paymentStatus;
        paymentDetails.newStatus = paymentStatus;
      }
      
      if (paidAmount !== undefined && paidAmount !== sale.paidAmount) {
        changes.push({
          field: 'paidAmount',
          oldValue: sale.paidAmount,
          newValue: paidAmount
        });
        paymentDetails.previousAmount = sale.paidAmount;
        paymentDetails.newAmount = paidAmount;
        
        // Calculate new due amount
        const newDueAmount = sale.grandTotal - paidAmount;
        changes.push({
          field: 'dueAmount',
          oldValue: sale.dueAmount,
          newValue: newDueAmount
        });
        paymentDetails.previousDueAmount = sale.dueAmount;
        paymentDetails.newDueAmount = newDueAmount;
        
        // Auto-update payment status based on paid amount
        let autoPaymentStatus = paymentStatus;
        if (!autoPaymentStatus) {
          if (newDueAmount <= 0) {
            autoPaymentStatus = 'paid';
          } else if (paidAmount > 0) {
            autoPaymentStatus = 'partial';
          } else {
            autoPaymentStatus = 'unpaid';
          }
          
          if (autoPaymentStatus !== sale.paymentStatus) {
            changes.push({
              field: 'paymentStatus',
              oldValue: sale.paymentStatus,
              newValue: autoPaymentStatus
            });
            paymentDetails.previousStatus = sale.paymentStatus;
            paymentDetails.newStatus = autoPaymentStatus;
          }
        }
      }
      
      if (notes && notes !== sale.notes) {
        changes.push({
          field: 'notes',
          oldValue: sale.notes,
          newValue: notes
        });
      }

      // Update payment information and notes
      if (paidAmount !== undefined) {
        sale.paidAmount = paidAmount;
        sale.dueAmount = sale.grandTotal - paidAmount;
        
        // Auto-update payment status if not explicitly provided
        if (!paymentStatus) {
          if (sale.dueAmount <= 0) {
            sale.paymentStatus = 'paid';
          } else if (paidAmount > 0) {
            sale.paymentStatus = 'partial';
          } else {
            sale.paymentStatus = 'unpaid';
          }
        } else {
          sale.paymentStatus = paymentStatus;
        }
      } else if (paymentStatus) {
        sale.paymentStatus = paymentStatus;
      }
      
      sale.notes = notes || sale.notes;

      const updatedSale = await sale.save();

      // Create sales journey record if there are changes
      if (changes.length > 0) {
        await SalesJourney.create({
          sale: sale._id,
          user: req.user._id,
          action: 'payment_updated',
          changes,
          paymentDetails,
          notes: 'Payment information updated',
        });
      }

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
        
        await Product.findByIdAndUpdate(
          item.product,
          {
            $set: { 
              countInStock: product.countInStock + item.quantity,
              soldOutQuantity: newSoldOutQuantity
            }
          }
        );
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
    const { startDate, endDate } = req.query;
    
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

    // Aggregate sales by customer
    const customerSales = await Sales.aggregate([
      // Match based on date filter if provided
      { $match: dateFilter },
      
      // Group by customer
      {
        $group: {
          _id: "$customer",
          totalSales: { $sum: 1 },
          totalAmount: { $sum: "$totalAmount" },
          totalPaid: { $sum: "$paidAmount" },
          totalDue: { $sum: "$dueAmount" },
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
          }
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
          totalPaid: 1,
          totalDue: 1,
          lastPurchaseDate: 1,
          lastInvoice: 1
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

module.exports = {
  createSale,
  getSales,
  getSaleById,
  updateSale,
  deleteSale,
  getSalesByCustomer,
}; 