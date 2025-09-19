const Expense = require('../models/expenseModel');
const ProcurementExpense = require('../models/procurementExpenseModel');
const LogisticsExpense = require('../models/logisticsExpenseModel');
const WarehouseExpense = require('../models/warehouseExpenseModel');
const SalesDistributionExpense = require('../models/salesDistributionExpenseModel');
const FinancialExpense = require('../models/financialExpenseModel');
const OperationalExpense = require('../models/operationalExpenseModel');
const MiscellaneousExpense = require('../models/miscellaneousExpenseModel');
const Currency = require('../models/currencyModel');

// Helper function to get expense model based on type
const getExpenseModel = (expenseType) => {
  const models = {
    procurement: ProcurementExpense,
    logistics: LogisticsExpense,
    warehouse: WarehouseExpense,
    sales_distribution: SalesDistributionExpense,
    financial: FinancialExpense,
    operational: OperationalExpense,
    miscellaneous: MiscellaneousExpense
  };
  return models[expenseType];
};

// @desc    Fetch all expenses
// @route   GET /api/expenses
// @access  Private
const getExpenses = async (req, res) => {
  try {
    const { expenseType, status, dateFrom, dateTo, page = 1, limit = 10 } = req.query;
    
    let query = { isActive: true };
    
    // Filter by expense type
    if (expenseType) {
      query.expenseType = expenseType;
    }
    
    // Filter by status
    if (status) {
      query.status = status;
    }
    
    // Filter by date range
    if (dateFrom || dateTo) {
      query.expenseDate = {};
      if (dateFrom) query.expenseDate.$gte = new Date(dateFrom);
      if (dateTo) query.expenseDate.$lte = new Date(dateTo);
    }
    
    const expenses = await Expense.find(query)
      .populate('currency', 'name code symbol')
      .populate('createdBy', 'name email')
      .populate('approvedBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await Expense.countDocuments(query);
    
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

// @desc    Fetch single expense with details
// @route   GET /api/expenses/:id
// @access  Private
const getExpenseById = async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id)
      .populate('currency', 'name code symbol')
      .populate('createdBy', 'name email')
      .populate('approvedBy', 'name email');
    
    if (!expense) {
      return res.status(404).json({
        status: 'fail',
        message: 'Expense not found'
      });
    }
    
    // Get detailed expense information based on type
    const ExpenseModel = getExpenseModel(expense.expenseType);
    const detailedExpense = await ExpenseModel.findById(expense.referenceId)
      .populate('supplier', 'name email')
      .populate('transporter', 'name contactPerson')
      .populate('warehouse', 'name location')
      .populate('customer', 'name email')
      .populate('linkedBankAccount', 'accountName bankName');
    
    res.json({
      status: 'success',
      data: {
        expense,
        details: detailedExpense
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// @desc    Create a new expense
// @route   POST /api/expenses
// @access  Private
const createExpense = async (req, res) => {
  try {
    const { expenseType, expenseData } = req.body;
    
    if (!expenseType || !expenseData) {
      return res.status(400).json({
        status: 'fail',
        message: 'Expense type and expense data are required'
      });
    }
    
    // Get the appropriate expense model
    const ExpenseModel = getExpenseModel(expenseType);
    if (!ExpenseModel) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid expense type'
      });
    }
    
    // Get exchange rate if not provided
    let exchangeRate = expenseData.exchangeRate;
    if (!exchangeRate && expenseData.currency) {
      const currency = await Currency.findById(expenseData.currency);
      if (currency) {
        exchangeRate = currency.exchangeRate;
      }
    }
    
    // Create the detailed expense record
    const detailedExpense = new ExpenseModel({
      ...expenseData,
      exchangeRate
    });
    
    const savedDetailedExpense = await detailedExpense.save();
    
    // Create the main expense record
    const expense = new Expense({
      expenseType,
      referenceId: savedDetailedExpense._id,
      totalAmount: savedDetailedExpense.totalCost,
      currency: savedDetailedExpense.currency,
      exchangeRate: savedDetailedExpense.exchangeRate,
      amountInPKR: savedDetailedExpense.amountInPKR,
      paymentMethod: savedDetailedExpense.paymentMethod,
      expenseDate: expenseData.expenseDate || new Date(),
      description: expenseData.description,
      notes: expenseData.notes,
      createdBy: req.user._id
    });
    
    const savedExpense = await expense.save();
    
    res.status(201).json({
      status: 'success',
      data: savedExpense,
      message: 'Expense created successfully'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// @desc    Update an expense
// @route   PUT /api/expenses/:id
// @access  Private
const updateExpense = async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    
    if (!expense) {
      return res.status(404).json({
        status: 'fail',
        message: 'Expense not found'
      });
    }
    
    const { expenseData } = req.body;
    
    // Update the detailed expense record
    const ExpenseModel = getExpenseModel(expense.expenseType);
    const detailedExpense = await ExpenseModel.findById(expense.referenceId);
    
    if (detailedExpense) {
      Object.keys(expenseData).forEach(key => {
        if (expenseData[key] !== undefined) {
          detailedExpense[key] = expenseData[key];
        }
      });
      
      await detailedExpense.save();
      
      // Update main expense record
      expense.totalAmount = detailedExpense.totalCost;
      expense.amountInPKR = detailedExpense.amountInPKR;
      expense.paymentMethod = detailedExpense.paymentMethod;
      
      if (expenseData.description) expense.description = expenseData.description;
      if (expenseData.notes) expense.notes = expenseData.notes;
      
      await expense.save();
    }
    
    res.json({
      status: 'success',
      data: expense,
      message: 'Expense updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// @desc    Delete an expense
// @route   DELETE /api/expenses/:id
// @access  Private
const deleteExpense = async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    
    if (!expense) {
      return res.status(404).json({
        status: 'fail',
        message: 'Expense not found'
      });
    }
    
    // Soft delete - mark as inactive
    expense.isActive = false;
    await expense.save();
    
    // Also mark detailed expense as inactive
    const ExpenseModel = getExpenseModel(expense.expenseType);
    await ExpenseModel.findByIdAndUpdate(expense.referenceId, { isActive: false });
    
    res.json({
      status: 'success',
      message: 'Expense deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// @desc    Approve an expense
// @route   PUT /api/expenses/:id/approve
// @access  Private/Admin
const approveExpense = async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    
    if (!expense) {
      return res.status(404).json({
        status: 'fail',
        message: 'Expense not found'
      });
    }
    
    expense.status = 'approved';
    expense.approvedBy = req.user._id;
    expense.approvedDate = new Date();
    
    await expense.save();
    
    res.json({
      status: 'success',
      data: expense,
      message: 'Expense approved successfully'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// @desc    Get expense summary/analytics
// @route   GET /api/expenses/analytics
// @access  Private
const getExpenseAnalytics = async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    
    let matchQuery = { isActive: true };
    
    if (dateFrom || dateTo) {
      matchQuery.expenseDate = {};
      if (dateFrom) matchQuery.expenseDate.$gte = new Date(dateFrom);
      if (dateTo) matchQuery.expenseDate.$lte = new Date(dateTo);
    }
    
    const analytics = await Expense.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$expenseType',
          totalAmount: { $sum: '$amountInPKR' },
          count: { $sum: 1 },
          avgAmount: { $avg: '$amountInPKR' }
        }
      },
      { $sort: { totalAmount: -1 } }
    ]);
    
    const totalExpenses = await Expense.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          total: { $sum: '$amountInPKR' },
          count: { $sum: 1 }
        }
      }
    ]);
    
    const statusBreakdown = await Expense.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amountInPKR' }
        }
      }
    ]);
    
    res.json({
      status: 'success',
      data: {
        byType: analytics,
        total: totalExpenses[0] || { total: 0, count: 0 },
        byStatus: statusBreakdown
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
  getExpenses,
  getExpenseById,
  createExpense,
  updateExpense,
  deleteExpense,
  approveExpense,
  getExpenseAnalytics
};
