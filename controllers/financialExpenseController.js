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
      .populate('linkedAccount', 'accountName accountNumber')
      .populate('createdBy', 'name email');

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
      .populate('linkedAccount', 'accountName accountNumber')
      .populate('createdBy', 'name email');

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
      bankCharges,
      interestPayments,
      loanFees,
      taxPayments,
      auditFees,
      accountingFees,
      legalFees,
      insurancePayments,
      currency,
      exchangeRate,
      linkedAccount,
      paymentMethod,
      expenseDate,
      notes
    } = req.body;

    // Calculate total cost
    const totalCost = (bankCharges || 0) + 
                     (interestPayments || 0) + 
                     (loanFees || 0) + 
                     (taxPayments || 0) + 
                     (auditFees || 0) + 
                     (accountingFees || 0) + 
                     (legalFees || 0) + 
                     (insurancePayments || 0);

    const financialExpense = new FinancialExpense({
      bankCharges: bankCharges || 0,
      interestPayments: interestPayments || 0,
      loanFees: loanFees || 0,
      taxPayments: taxPayments || 0,
      auditFees: auditFees || 0,
      accountingFees: accountingFees || 0,
      legalFees: legalFees || 0,
      insurancePayments: insurancePayments || 0,
      totalCost,
      currency,
      exchangeRate: exchangeRate || 1,
      amountInPKR: totalCost * (exchangeRate || 1),
      linkedAccount,
      paymentMethod: paymentMethod || 'bank',
      expenseDate: expenseDate || Date.now(),
      notes,
      createdBy: req.user._id
    });

    const savedExpense = await financialExpense.save();
    const populatedExpense = await FinancialExpense.findById(savedExpense._id)
      .populate('currency', 'name code symbol')
      .populate('linkedAccount', 'accountName accountNumber')
      .populate('createdBy', 'name email');

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
      'bankCharges', 'interestPayments', 'loanFees', 'taxPayments',
      'auditFees', 'accountingFees', 'legalFees', 'insurancePayments',
      'currency', 'exchangeRate', 'linkedAccount', 'paymentMethod',
      'expenseDate', 'notes', 'isActive'
    ];

    updatableFields.forEach(field => {
      if (req.body[field] !== undefined) {
        expense[field] = req.body[field];
      }
    });

    // Recalculate total cost
    expense.totalCost = (expense.bankCharges || 0) + 
                       (expense.interestPayments || 0) + 
                       (expense.loanFees || 0) + 
                       (expense.taxPayments || 0) + 
                       (expense.auditFees || 0) + 
                       (expense.accountingFees || 0) + 
                       (expense.legalFees || 0) + 
                       (expense.insurancePayments || 0);

    // Recalculate amount in PKR
    if (expense.currency && expense.exchangeRate) {
      expense.amountInPKR = expense.totalCost * expense.exchangeRate;
    }

    const updatedExpense = await expense.save();
    const populatedExpense = await FinancialExpense.findById(updatedExpense._id)
      .populate('currency', 'name code symbol')
      .populate('linkedAccount', 'accountName accountNumber')
      .populate('createdBy', 'name email');

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
