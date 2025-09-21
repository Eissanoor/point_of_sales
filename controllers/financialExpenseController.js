const FinancialExpense = require('../models/financialExpenseModel');
const APIFeatures = require('../utils/apiFeatures');

// @desc    Fetch all financial expenses
// @route   GET /api/expenses/financial
// @access  Private
const getFinancialExpenses = async (req, res) => {
  try {
    const features = new APIFeatures(FinancialExpense.find(), req.query)
      .filter()
      .sort()
      .limitFields()
      .paginate();

    const expenses = await features.query
      .populate('currency', 'name code symbol')
      .populate('linkedBankAccount', 'accountName accountNumber');

    res.status(200).json({
      status: 'success',
      results: expenses.length,
      data: {
        expenses
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// @desc    Fetch single financial expense
// @route   GET /api/expenses/financial/:id
// @access  Private
const getFinancialExpenseById = async (req, res) => {
  try {
    const expense = await FinancialExpense.findById(req.params.id)
      .populate('currency', 'name code symbol')
      .populate('linkedBankAccount', 'accountName accountNumber');

    if (!expense) {
      return res.status(404).json({
        status: 'fail',
        message: 'Financial expense not found'
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        expense
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// @desc    Create financial expense
// @route   POST /api/expenses/financial
// @access  Private
const createFinancialExpense = async (req, res) => {
  try {
    const {
      expenseSubType,
      bankCharges,
      exchangeGainLoss,
      loanInterest,
      financeCharges,
      transactionFees,
      currency,
      exchangeRate,
      linkedBankAccount,
      paymentMethod,
      transactionDate,
      notes
    } = req.body;

    // Calculate total cost
    const totalCost = (bankCharges || 0) + 
                     (exchangeGainLoss || 0) + 
                     (loanInterest || 0) + 
                     (financeCharges || 0) + 
                     (transactionFees || 0);

    const financialExpense = new FinancialExpense({
      expenseSubType,
      bankCharges: bankCharges || 0,
      exchangeGainLoss: exchangeGainLoss || 0,
      loanInterest: loanInterest || 0,
      financeCharges: financeCharges || 0,
      transactionFees: transactionFees || 0,
      totalCost,
      currency,
      exchangeRate: exchangeRate || 1,
      amountInPKR: totalCost * (exchangeRate || 1),
      linkedBankAccount,
      paymentMethod: paymentMethod || 'bank',
      transactionDate: transactionDate || Date.now(),
      notes
    });

    const savedExpense = await financialExpense.save();
    const populatedExpense = await FinancialExpense.findById(savedExpense._id)
      .populate('currency', 'name code symbol')
      .populate('linkedBankAccount', 'accountName accountNumber');

    res.status(201).json({
      status: 'success',
      data: {
        expense: populatedExpense
      }
    });
  } catch (error) {
    res.status(400).json({
      status: 'fail',
      message: error.message
    });
  }
};

// @desc    Update financial expense
// @route   PUT /api/expenses/financial/:id
// @access  Private
const updateFinancialExpense = async (req, res) => {
  try {
    const expense = await FinancialExpense.findById(req.params.id);
    
    if (!expense) {
      return res.status(404).json({
        status: 'fail',
        message: 'Financial expense not found'
      });
    }

    // Update fields
    const updatableFields = [
      'expenseSubType',
      'bankCharges', 'exchangeGainLoss', 'loanInterest', 'financeCharges', 'transactionFees',
      'currency', 'exchangeRate', 'linkedBankAccount', 'paymentMethod',
      'transactionDate', 'notes', 'isActive'
    ];

    updatableFields.forEach(field => {
      if (req.body[field] !== undefined) {
        expense[field] = req.body[field];
      }
    });

    // Recalculate total cost
    expense.totalCost = (expense.bankCharges || 0) + 
                       (expense.exchangeGainLoss || 0) + 
                       (expense.loanInterest || 0) + 
                       (expense.financeCharges || 0) + 
                       (expense.transactionFees || 0);

    // Recalculate amount in PKR
    if (expense.currency && expense.exchangeRate) {
      expense.amountInPKR = expense.totalCost * expense.exchangeRate;
    }

    const updatedExpense = await expense.save();
    const populatedExpense = await FinancialExpense.findById(updatedExpense._id)
      .populate('currency', 'name code symbol')
      .populate('linkedBankAccount', 'accountName accountNumber');

    res.status(200).json({
      status: 'success',
      data: {
        expense: populatedExpense
      }
    });
  } catch (error) {
    res.status(400).json({
      status: 'fail',
      message: error.message
    });
  }
};

// @desc    Delete financial expense
// @route   DELETE /api/expenses/financial/:id
// @access  Private
const deleteFinancialExpense = async (req, res) => {
  try {
    const expense = await FinancialExpense.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!expense) {
      return res.status(404).json({
        status: 'fail',
        message: 'Financial expense not found'
      });
    }

    res.status(204).json({
      status: 'success',
      data: null
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

module.exports = {
  getFinancialExpenses,
  getFinancialExpenseById,
  createFinancialExpense,
  updateFinancialExpense,
  deleteFinancialExpense
};
