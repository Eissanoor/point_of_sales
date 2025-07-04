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
      paymentStatus,
      paidAmount,
      notes,
      user: req.user._id, // Assuming req.user is set by auth middleware
    });

    // Update product quantities
    for (const item of items) {
      await Product.findByIdAndUpdate(
        item.product,
        {
          $inc: { 
            countInStock: -item.quantity,
            soldOutQuantity: item.quantity
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
      
      if (paidAmount && paidAmount !== sale.paidAmount) {
        changes.push({
          field: 'paidAmount',
          oldValue: sale.paidAmount,
          newValue: paidAmount
        });
        paymentDetails.previousAmount = sale.paidAmount;
        paymentDetails.newAmount = paidAmount;
      }
      
      if (notes && notes !== sale.notes) {
        changes.push({
          field: 'notes',
          oldValue: sale.notes,
          newValue: notes
        });
      }

      // Only allow updating payment information and notes
      sale.paymentStatus = paymentStatus || sale.paymentStatus;
      sale.paidAmount = paidAmount || sale.paidAmount;
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
        await Product.findByIdAndUpdate(
          item.product,
          {
            $inc: { 
              countInStock: item.quantity,
              soldOutQuantity: -item.quantity
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

module.exports = {
  createSale,
  getSales,
  getSaleById,
  updateSale,
  deleteSale,
}; 