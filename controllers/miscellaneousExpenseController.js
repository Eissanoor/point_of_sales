const asyncHandler = require('express-async-handler');
const MiscellaneousExpense = require('../models/miscellaneousExpenseModel');
const APIFeatures = require('../utils/apiFeatures');

// @desc    Create a new miscellaneous expense
// @route   POST /api/expenses/miscellaneous
// @access  Private
const createMiscellaneousExpense = asyncHandler(async (req, res) => {
  const {
    expenseSubType,
    marketingCost,
    promotionCost,
    entertainmentCost,
    hospitalityCost,
    unexpectedCosts,
    adjustments,
    legalFees,
    consultingFees,
    description,
    currency,
    exchangeRate,
    paymentMethod,
    expenseDate,
    notes,
    isRecurring
  } = req.body;

  const miscellaneousExpense = await MiscellaneousExpense.create({
    expenseSubType,
    marketingCost,
    promotionCost,
    entertainmentCost,
    hospitalityCost,
    unexpectedCosts,
    adjustments,
    legalFees,
    consultingFees,
    description,
    currency,
    exchangeRate,
    paymentMethod,
    expenseDate,
    notes,
    isRecurring: isRecurring || false
  });

  res.status(201).json({
    success: true,
    data: miscellaneousExpense
  });
});

// @desc    Get all miscellaneous expenses
// @route   GET /api/expenses/miscellaneous
// @access  Private
const getMiscellaneousExpenses = asyncHandler(async (req, res) => {
  const features = new APIFeatures(MiscellaneousExpense.find(), req.query)
    .filter()
    .sort()
    .limitFields()
    .paginate();

  const miscellaneousExpenses = await features.query
    .populate('currency', 'code symbol');

  res.status(200).json({
    success: true,
    count: miscellaneousExpenses.length,
    data: miscellaneousExpenses
  });
});

// @desc    Get single miscellaneous expense
// @route   GET /api/expenses/miscellaneous/:id
// @access  Private
const getMiscellaneousExpense = asyncHandler(async (req, res) => {
  const miscellaneousExpense = await MiscellaneousExpense.findById(req.params.id)
    .populate('currency', 'code symbol');

  if (!miscellaneousExpense) {
    res.status(404);
    throw new Error('Miscellaneous expense not found');
  }

  res.status(200).json({
    success: true,
    data: miscellaneousExpense
  });
});

// @desc    Update miscellaneous expense
// @route   PUT /api/expenses/miscellaneous/:id
// @access  Private
const updateMiscellaneousExpense = asyncHandler(async (req, res) => {
  let miscellaneousExpense = await MiscellaneousExpense.findById(req.params.id);

  if (!miscellaneousExpense) {
    res.status(404);
    throw new Error('Miscellaneous expense not found');
  }

  const fieldsToUpdate = {
    expenseSubType: req.body.expenseSubType,
    marketingCost: req.body.marketingCost,
    promotionCost: req.body.promotionCost,
    entertainmentCost: req.body.entertainmentCost,
    hospitalityCost: req.body.hospitalityCost,
    unexpectedCosts: req.body.unexpectedCosts,
    adjustments: req.body.adjustments,
    legalFees: req.body.legalFees,
    consultingFees: req.body.consultingFees,
    description: req.body.description,
    currency: req.body.currency,
    exchangeRate: req.body.exchangeRate,
    paymentMethod: req.body.paymentMethod,
    expenseDate: req.body.expenseDate,
    notes: req.body.notes,
    isRecurring: req.body.isRecurring,
    isActive: req.body.isActive
  };

  // Remove undefined fields
  Object.keys(fieldsToUpdate).forEach(key => 
    fieldsToUpdate[key] === undefined && delete fieldsToUpdate[key]
  );

  miscellaneousExpense = await MiscellaneousExpense.findByIdAndUpdate(
    req.params.id,
    { $set: fieldsToUpdate },
    { new: true, runValidators: true }
  )
    .populate('currency', 'code symbol');

  res.status(200).json({
    success: true,
    data: miscellaneousExpense
  });
});

// @desc    Delete miscellaneous expense
// @route   DELETE /api/expenses/miscellaneous/:id
// @access  Private
const deleteMiscellaneousExpense = asyncHandler(async (req, res) => {
  const miscellaneousExpense = await MiscellaneousExpense.findById(req.params.id);

  if (!miscellaneousExpense) {
    res.status(404);
    throw new Error('Miscellaneous expense not found');
  }

  await miscellaneousExpense.remove();

  res.status(200).json({
    success: true,
    data: {}
  });
});

// @desc    Get miscellaneous expenses summary
// @route   GET /api/expenses/miscellaneous/summary
// @access  Private
const getMiscellaneousExpensesSummary = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;
  
  const match = {};
  
  if (startDate || endDate) {
    match.expenseDate = {};
    if (startDate) match.expenseDate.$gte = new Date(startDate);
    if (endDate) match.expenseDate.$lte = new Date(endDate);
  }

  const summary = await MiscellaneousExpense.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$expenseSubType',
        totalAmount: { $sum: '$totalCost' },
        count: { $sum: 1 },
        avgAmount: { $avg: '$totalCost' }
      }
    },
    { $sort: { totalAmount: -1 } }
  ]);

  res.status(200).json({
    success: true,
    data: summary
  });
});

module.exports = {
  createMiscellaneousExpense,
  getMiscellaneousExpenses,
  getMiscellaneousExpense,
  updateMiscellaneousExpense,
  deleteMiscellaneousExpense,
  getMiscellaneousExpensesSummary
};
