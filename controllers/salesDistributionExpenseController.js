const SalesDistributionExpense = require('../models/salesDistributionExpenseModel');
const Currency = require('../models/currencyModel');

// @desc    Fetch all sales distribution expenses
// @route   GET /api/sales-distribution-expenses
// @access  Private
const getSalesDistributionExpenses = async (req, res) => {
  try {
    const { page = 1, limit = 10, expenseType, salesperson, customer, search } = req.query;
    
    let query = { isActive: true };
    
    // Filter by expense type
    if (expenseType) {
      query.expenseType = expenseType;
    }
    
    // Filter by salesperson
    if (salesperson) {
      query.salesperson = salesperson;
    }
    
    // Filter by customer
    if (customer) {
      query.customer = customer;
    }
    
    // Search functionality
    if (search) {
      query.$or = [
        { salesTeam: { $regex: search, $options: 'i' } },
        { notes: { $regex: search, $options: 'i' } }
      ];
    }
    
    const expenses = await SalesDistributionExpense.find(query)
      .populate('salesperson', 'name email')
      .populate('customer', 'name email contactPerson')
      .populate('currency', 'name code symbol')
      .populate('linkedSalesInvoice', 'invoiceNumber totalAmount')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await SalesDistributionExpense.countDocuments(query);
    
    res.json({
      status: 'success',
      results: expenses.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      data: expenses
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// @desc    Fetch single sales distribution expense
// @route   GET /api/sales-distribution-expenses/:id
// @access  Private
const getSalesDistributionExpenseById = async (req, res) => {
  try {
    const expense = await SalesDistributionExpense.findById(req.params.id)
      .populate('salesperson', 'name email phoneNumber')
      .populate('customer', 'name email contactPerson phoneNumber address')
      .populate('currency', 'name code symbol exchangeRate')
      .populate('linkedSalesInvoice', 'invoiceNumber totalAmount saleDate');
    
    if (!expense) {
      return res.status(404).json({
        status: 'fail',
        message: 'Sales distribution expense not found'
      });
    }
    
    res.json({
      status: 'success',
      data: expense
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// @desc    Create sales distribution expense
// @route   POST /api/sales-distribution-expenses
// @access  Private
const createSalesDistributionExpense = async (req, res) => {
  try {
    const {
      salesperson,
      salesTeam,
      commissionAmount,
      commissionRate,
      customerDiscounts,
      creditLoss,
      badDebts,
      promotionalCost,
      marketingCost,
      currency,
      exchangeRate,
      linkedSalesInvoice,
      customer,
      salesAmount,
      paymentMethod,
      expenseType,
      salesPeriod,
      
      notes
    } = req.body;
    
    // Validate required fields
    if (!salesperson || !currency || !paymentMethod || !expenseType) {
      return res.status(400).json({
        status: 'fail',
        message: 'Required fields: salesperson, currency, paymentMethod, expenseType'
      });
    }
    
    // Get exchange rate if not provided
    let finalExchangeRate = exchangeRate;
    if (!finalExchangeRate && currency) {
      const currencyDoc = await Currency.findById(currency);
      if (currencyDoc) {
        finalExchangeRate = currencyDoc.exchangeRate;
      }
    }
    
    const expense = new SalesDistributionExpense({
      salesperson,
      salesTeam,
      commissionAmount,
      commissionRate,
      customerDiscounts,
      creditLoss,
      badDebts,
      promotionalCost,
      marketingCost,
      currency,
      exchangeRate: finalExchangeRate,
      linkedSalesInvoice,
      customer,
      salesAmount,
      paymentMethod,
      expenseType,
      salesPeriod,
      notes
    });
    
    const savedExpense = await expense.save();
    
    // Populate the saved expense for response
    const populatedExpense = await SalesDistributionExpense.findById(savedExpense._id)
      .populate('salesperson', 'name email')
      .populate('customer', 'name email')
      .populate('currency', 'name code symbol');
    
    res.status(201).json({
      status: 'success',
      data: populatedExpense,
      message: 'Sales distribution expense created successfully'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// @desc    Update sales distribution expense
// @route   PUT /api/sales-distribution-expenses/:id
// @access  Private
const updateSalesDistributionExpense = async (req, res) => {
  try {
    const expense = await SalesDistributionExpense.findById(req.params.id);
    
    if (!expense) {
      return res.status(404).json({
        status: 'fail',
        message: 'Sales distribution expense not found'
      });
    }
    
    // Update fields
    Object.keys(req.body).forEach(key => {
      if (req.body[key] !== undefined) {
        expense[key] = req.body[key];
      }
    });
    
    const updatedExpense = await expense.save();
    
    // Populate the updated expense for response
    const populatedExpense = await SalesDistributionExpense.findById(updatedExpense._id)
      .populate('salesperson', 'name email')
      .populate('customer', 'name email')
      .populate('currency', 'name code symbol');
    
    res.json({
      status: 'success',
      data: populatedExpense,
      message: 'Sales distribution expense updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// @desc    Delete sales distribution expense
// @route   DELETE /api/sales-distribution-expenses/:id
// @access  Private
const deleteSalesDistributionExpense = async (req, res) => {
  try {
    const expense = await SalesDistributionExpense.findById(req.params.id);
    
    if (!expense) {
      return res.status(404).json({
        status: 'fail',
        message: 'Sales distribution expense not found'
      });
    }
    
    // Soft delete - mark as inactive
    expense.isActive = false;
    await expense.save();
    
    res.json({
      status: 'success',
      message: 'Sales distribution expense deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// @desc    Get sales distribution expense analytics
// @route   GET /api/sales-distribution-expenses/analytics
// @access  Private
const getSalesDistributionExpenseAnalytics = async (req, res) => {
  try {
    const { dateFrom, dateTo, salesperson } = req.query;
    
    let matchQuery = { isActive: true };
    
    if (dateFrom || dateTo) {
      matchQuery.createdAt = {};
      if (dateFrom) matchQuery.createdAt.$gte = new Date(dateFrom);
      if (dateTo) matchQuery.createdAt.$lte = new Date(dateTo);
    }
    
    if (salesperson) {
      matchQuery.salesperson = mongoose.Types.ObjectId(salesperson);
    }
    
    // Expense type breakdown
    const expenseTypeAnalytics = await SalesDistributionExpense.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$expenseType',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amountInPKR' },
          avgAmount: { $avg: '$amountInPKR' }
        }
      },
      { $sort: { totalAmount: -1 } }
    ]);
    
    // Salesperson breakdown
    const salespersonAnalytics = await SalesDistributionExpense.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$salesperson',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amountInPKR' },
          totalCommission: { $sum: '$commissionAmount' }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'salespersonInfo'
        }
      },
      {
        $project: {
          count: 1,
          totalAmount: 1,
          totalCommission: 1,
          salespersonName: { $arrayElemAt: ['$salespersonInfo.name', 0] }
        }
      },
      { $sort: { totalAmount: -1 } }
    ]);
    
    // Total statistics
    const totalStats = await SalesDistributionExpense.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalExpenses: { $sum: 1 },
          totalAmount: { $sum: '$amountInPKR' },
          avgAmount: { $avg: '$amountInPKR' },
          totalCommissions: { $sum: '$commissionAmount' },
          totalDiscounts: { $sum: '$customerDiscounts' },
          totalPromotionalCost: { $sum: '$promotionalCost' }
        }
      }
    ]);
    
    res.json({
      status: 'success',
      data: {
        byExpenseType: expenseTypeAnalytics,
        bySalesperson: salespersonAnalytics,
        total: totalStats[0] || { 
          totalExpenses: 0, 
          totalAmount: 0, 
          avgAmount: 0,
          totalCommissions: 0,
          totalDiscounts: 0,
          totalPromotionalCost: 0
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

module.exports = {
  getSalesDistributionExpenses,
  getSalesDistributionExpenseById,
  createSalesDistributionExpense,
  updateSalesDistributionExpense,
  deleteSalesDistributionExpense,
  getSalesDistributionExpenseAnalytics
};
