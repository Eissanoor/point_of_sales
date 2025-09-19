const asyncHandler = require('express-async-handler');
const WarehouseExpense = require('../models/warehouseExpenseModel');
const APIFeatures = require('../utils/apiFeatures');

// @desc    Create a new warehouse expense
// @route   POST /api/warehouse-expenses
// @access  Private
const createWarehouseExpense = asyncHandler(async (req, res) => {
  const {
    warehouse,
    expenseSubType,
    rentAmount,
    staffSalaries,
    securityCost,
    utilities,
    repairsCost,
    maintenanceCost,
    currency,
    exchangeRate,
    storageDuration,
    linkedStock,
    linkedBatch,
    paymentMethod,
    expensePeriod,
    notes
  } = req.body;

  // Create warehouse expense
  const warehouseExpense = await WarehouseExpense.create({
    warehouse,
    expenseSubType,
    rentAmount,
    staffSalaries,
    securityCost,
    utilities: utilities || { electricity: 0, water: 0, gas: 0, internet: 0 },
    repairsCost,
    maintenanceCost,
    currency,
    exchangeRate,
    storageDuration,
    linkedStock,
    linkedBatch,
    paymentMethod,
    expensePeriod,
    notes,
    createdBy: req.user.id
  });

  res.status(201).json({
    success: true,
    data: warehouseExpense
  });
});

// @desc    Get all warehouse expenses
// @route   GET /api/warehouse-expenses
// @access  Private
const getWarehouseExpenses = asyncHandler(async (req, res) => {
  const features = new APIFeatures(WarehouseExpense.find(), req.query)
    .filter()
    .sort()
    .limitFields()
    .paginate();

  const warehouseExpenses = await features.query
    .populate('warehouse', 'name code')
    .populate('currency', 'code symbol')
    .populate('linkedStock', 'name code');

  res.status(200).json({
    success: true,
    count: warehouseExpenses.length,
    data: warehouseExpenses
  });
});

// @desc    Get single warehouse expense
// @route   GET /api/warehouse-expenses/:id
// @access  Private
const getWarehouseExpense = asyncHandler(async (req, res) => {
  const warehouseExpense = await WarehouseExpense.findById(req.params.id)
    .populate('warehouse', 'name code')
    .populate('currency', 'code symbol')
    .populate('linkedStock', 'name code');

  if (!warehouseExpense) {
    res.status(404);
    throw new Error('Warehouse expense not found');
  }

  res.status(200).json({
    success: true,
    data: warehouseExpense
  });
});

// @desc    Update warehouse expense
// @route   PUT /api/warehouse-expenses/:id
// @access  Private
const updateWarehouseExpense = asyncHandler(async (req, res) => {
  let warehouseExpense = await WarehouseExpense.findById(req.params.id);

  if (!warehouseExpense) {
    res.status(404);
    throw new Error('Warehouse expense not found');
  }

  // Update fields
  const fieldsToUpdate = {
    warehouse: req.body.warehouse,
    expenseSubType: req.body.expenseSubType,
    rentAmount: req.body.rentAmount,
    staffSalaries: req.body.staffSalaries,
    securityCost: req.body.securityCost,
    utilities: req.body.utilities || warehouseExpense.utilities,
    repairsCost: req.body.repairsCost,
    maintenanceCost: req.body.maintenanceCost,
    currency: req.body.currency,
    exchangeRate: req.body.exchangeRate,
    storageDuration: req.body.storageDuration,
    linkedStock: req.body.linkedStock,
    linkedBatch: req.body.linkedBatch,
    paymentMethod: req.body.paymentMethod,
    expensePeriod: req.body.expensePeriod || warehouseExpense.expensePeriod,
    notes: req.body.notes,
    isActive: req.body.isActive !== undefined ? req.body.isActive : warehouseExpense.isActive,
    updatedBy: req.user.id
  };

  // Remove undefined fields
  Object.keys(fieldsToUpdate).forEach(key => 
    fieldsToUpdate[key] === undefined && delete fieldsToUpdate[key]
  );

  warehouseExpense = await WarehouseExpense.findByIdAndUpdate(
    req.params.id,
    { $set: fieldsToUpdate },
    { new: true, runValidators: true }
  )
    .populate('warehouse', 'name code')
    .populate('currency', 'code symbol')
    .populate('linkedStock', 'name code');

  res.status(200).json({
    success: true,
    data: warehouseExpense
  });
});

// @desc    Delete warehouse expense
// @route   DELETE /api/warehouse-expenses/:id
// @access  Private
const deleteWarehouseExpense = asyncHandler(async (req, res) => {
  const warehouseExpense = await WarehouseExpense.findById(req.params.id);

  if (!warehouseExpense) {
    res.status(404);
    throw new Error('Warehouse expense not found');
  }

  await warehouseExpense.remove();

  res.status(200).json({
    success: true,
    data: {}
  });
});

// @desc    Get warehouse expenses summary
// @route   GET /api/warehouse-expenses/summary
// @access  Private
const getWarehouseExpensesSummary = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;
  
  const match = {};
  
  if (startDate || endDate) {
    match.createdAt = {};
    if (startDate) match.createdAt.$gte = new Date(startDate);
    if (endDate) match.createdAt.$lte = new Date(endDate);
  }

  const summary = await WarehouseExpense.aggregate([
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
  createWarehouseExpense,
  getWarehouseExpenses,
  getWarehouseExpense,
  updateWarehouseExpense,
  deleteWarehouseExpense,
  getWarehouseExpensesSummary
};
