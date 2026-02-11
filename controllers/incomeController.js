const Income = require('../models/incomeModel');
const APIFeatures = require('../utils/apiFeatures');

// @desc    Create a new income
// @route   POST /api/incomes
// @access  Private
const createIncome = async (req, res) => {
  try {
    const { name, mobileNo, code, description } = req.body;

    if (!req.user || !req.user._id) {
      return res.status(401).json({
        status: 'fail',
        message: 'User not authenticated',
      });
    }

    const income = await Income.create({
      name,
      mobileNo,
      code,
      description,
      user: req.user._id,
    });

    const populatedIncome = await Income.findById(income._id)
      .populate('user', 'name email')
      .select('-__v');

    res.status(201).json({
      status: 'success',
      message: 'Income created successfully',
      data: { income: populatedIncome },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get all incomes
// @route   GET /api/incomes
// @access  Private
const getIncomes = async (req, res) => {
  try {
    const features = new APIFeatures(Income.find(), req.query)
      .filter()
      .sort()
      .limitFields()
      .paginate();

    const incomes = await features.query
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .select('-__v');

    const queryObj = { ...req.query };
    const excludedFields = ['page', 'sort', 'limit', 'fields'];
    excludedFields.forEach((el) => delete queryObj[el]);
    let queryStr = JSON.stringify(queryObj);
    queryStr = queryStr.replace(/\b(gte|gt|lte|lt)\b/g, (match) => `$${match}`);
    const filterQuery = queryStr ? JSON.parse(queryStr) : {};

    const totalIncomes = await Income.countDocuments(filterQuery);

    res.status(200).json({
      status: 'success',
      results: incomes.length,
      totalIncomes,
      data: { incomes },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get income by ID
// @route   GET /api/incomes/:id
// @access  Private
const getIncomeById = async (req, res) => {
  try {
    const income = await Income.findById(req.params.id)
      .populate('user', 'name email')
      .select('-__v');

    if (!income) {
      return res.status(404).json({
        status: 'fail',
        message: 'Income not found',
      });
    }

    res.status(200).json({
      status: 'success',
      data: { income },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Update income
// @route   PUT /api/incomes/:id
// @access  Private
const updateIncome = async (req, res) => {
  try {
    const income = await Income.findById(req.params.id);

    if (!income) {
      return res.status(404).json({
        status: 'fail',
        message: 'Income not found',
      });
    }

    const { name, mobileNo, code, description, isActive } = req.body;

    if (name !== undefined) income.name = name;
    if (mobileNo !== undefined) income.mobileNo = mobileNo;
    if (code !== undefined) income.code = code;
    if (description !== undefined) income.description = description;
    if (isActive !== undefined) income.isActive = isActive;

    const updatedIncome = await income.save();

    const populatedIncome = await Income.findById(updatedIncome._id)
      .populate('user', 'name email')
      .select('-__v');

    res.status(200).json({
      status: 'success',
      message: 'Income updated successfully',
      data: { income: populatedIncome },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Delete income
// @route   DELETE /api/incomes/:id
// @access  Private
const deleteIncome = async (req, res) => {
  try {
    const income = await Income.findById(req.params.id);

    if (!income) {
      return res.status(404).json({
        status: 'fail',
        message: 'Income not found',
      });
    }

    await Income.findByIdAndDelete(req.params.id);

    res.status(200).json({
      status: 'success',
      message: 'Income deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

module.exports = {
  createIncome,
  getIncomes,
  getIncomeById,
  updateIncome,
  deleteIncome,
};

