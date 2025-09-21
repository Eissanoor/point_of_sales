const asyncHandler = require('express-async-handler');
const OperationalExpense = require('../models/operationalExpenseModel');
const APIFeatures = require('../utils/apiFeatures');

// @desc    Create a new operational expense
// @route   POST /api/expenses/operational
// @access  Private
const createOperationalExpense = asyncHandler(async (req, res) => {
  const {
    expenseSubType,
    employeeSalaries,
    officeRent,
    utilities,
    officeSupplies,
    stationery,
    softwareExpenses,
    equipmentCost,
    insuranceCost,
    currency,
    exchangeRate,
    paymentMethod,
    expenseDate,
    notes
  } = req.body;

  const operationalExpense = await OperationalExpense.create({
    expenseSubType,
    employeeSalaries,
    officeRent,
    utilities: utilities || { electricity: 0, internet: 0, phone: 0, water: 0 },
    officeSupplies,
    stationery,
    softwareExpenses,
    equipmentCost,
    insuranceCost,
    currency,
    exchangeRate,
    paymentMethod,
    expenseDate,
    notes
  });

  res.status(201).json({
    success: true,
    data: operationalExpense
  });
});

// @desc    Get all operational expenses
// @route   GET /api/expenses/operational
// @access  Private
const getOperationalExpenses = asyncHandler(async (req, res) => {
  const features = new APIFeatures(OperationalExpense.find(), req.query)
    .filter()
    .sort()
    .limitFields()
    .paginate();

  const operationalExpenses = await features.query
    .populate('currency', 'code symbol');

  res.status(200).json({
    success: true,
    count: operationalExpenses.length,
    data: operationalExpenses
  });
});

// @desc    Get single operational expense
// @route   GET /api/expenses/operational/:id
// @access  Private
const getOperationalExpense = asyncHandler(async (req, res) => {
  const operationalExpense = await OperationalExpense.findById(req.params.id)
    .populate('currency', 'code symbol');

  if (!operationalExpense) {
    res.status(404);
    throw new Error('Operational expense not found');
  }

  res.status(200).json({
    success: true,
    data: operationalExpense
  });
});

// @desc    Update operational expense
// @route   PUT /api/expenses/operational/:id
// @access  Private
const updateOperationalExpense = asyncHandler(async (req, res) => {
  let operationalExpense = await OperationalExpense.findById(req.params.id);

  if (!operationalExpense) {
    res.status(404);
    throw new Error('Operational expense not found');
  }

  const fieldsToUpdate = {
    expenseSubType: req.body.expenseSubType,
    employeeSalaries: req.body.employeeSalaries,
    officeRent: req.body.officeRent,
    utilities: req.body.utilities || operationalExpense.utilities,
    officeSupplies: req.body.officeSupplies,
    stationery: req.body.stationery,
    softwareExpenses: req.body.softwareExpenses,
    equipmentCost: req.body.equipmentCost,
    insuranceCost: req.body.insuranceCost,
    currency: req.body.currency,
    exchangeRate: req.body.exchangeRate,
    paymentMethod: req.body.paymentMethod,
    expenseDate: req.body.expenseDate,
    notes: req.body.notes,
    isActive: req.body.isActive !== undefined ? req.body.isActive : operationalExpense.isActive,
  };

  // Remove undefined fields
  Object.keys(fieldsToUpdate).forEach(key => 
    fieldsToUpdate[key] === undefined && delete fieldsToUpdate[key]
  );

  operationalExpense = await OperationalExpense.findByIdAndUpdate(
    req.params.id,
    { $set: fieldsToUpdate },
    { new: true, runValidators: true }
  )
    .populate('currency', 'code symbol');

  res.status(200).json({
    success: true,
    data: operationalExpense
  });
});

// @desc    Delete operational expense
// @route   DELETE /api/expenses/operational/:id
// @access  Private
const deleteOperationalExpense = asyncHandler(async (req, res) => {
  const operationalExpense = await OperationalExpense.findById(req.params.id);

  if (!operationalExpense) {
    res.status(404);
    throw new Error('Operational expense not found');
  }

  await operationalExpense.remove();

  res.status(200).json({
    success: true,
    data: {}
  });
});

// @desc    Get operational expenses summary
// @route   GET /api/expenses/operational/summary
// @access  Private
const getOperationalExpensesSummary = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;
  
  const match = {};
  
  if (startDate || endDate) {
    match.expenseDate = {};
    if (startDate) match.expenseDate.$gte = new Date(startDate);
    if (endDate) match.expenseDate.$lte = new Date(endDate);
  }

  const summary = await OperationalExpense.aggregate([
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
  createOperationalExpense,
  getOperationalExpenses,
  getOperationalExpense,
  updateOperationalExpense,
  deleteOperationalExpense,
  getOperationalExpensesSummary
};
