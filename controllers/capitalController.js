const Capital = require('../models/capitalModel');
const APIFeatures = require('../utils/apiFeatures');

// @desc    Create a new capital entry
// @route   POST /api/capitals
// @access  Private
const createCapital = async (req, res) => {
  try {
    const { name, mobileNo, code, description } = req.body;

    // Validate user is authenticated
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        status: 'fail',
        message: 'User not authenticated',
      });
    }

    const capital = await Capital.create({
      name,
      mobileNo,
      code,
      description,
      user: req.user._id,
    });

    // Populate before sending response
    const populatedCapital = await Capital.findById(capital._id)
      .populate('user', 'name email')
      .select('-__v');

    res.status(201).json({
      status: 'success',
      message: 'Capital entry created successfully',
      data: {
        capital: populatedCapital,
      },
    });
  } catch (error) {
    console.error('Error creating capital entry:', error);

    if (error.name === 'ValidationError') {
      const validationErrors = Object.keys(error.errors).map((key) => ({
        field: key,
        message: error.errors[key].message,
      }));

      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: validationErrors,
      });
    }

    if (error.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern)[0];
      return res.status(400).json({
        status: 'error',
        message: `${duplicateField} already exists`,
        field: duplicateField,
      });
    }

    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get all capital entries with filtering and pagination
// @route   GET /api/capitals
// @access  Private
const getCapitals = async (req, res) => {
  try {
    const features = new APIFeatures(Capital.find(), req.query)
      .filter()
      .sort()
      .limitFields()
      .paginate();

    const capitals = await features.query
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .select('-__v');

    // Build filter query for count
    const queryObj = { ...req.query };
    const excludedFields = ['page', 'sort', 'limit', 'fields'];
    excludedFields.forEach((el) => delete queryObj[el]);
    let queryStr = JSON.stringify(queryObj);
    queryStr = queryStr.replace(/\b(gte|gt|lte|lt)\b/g, (match) => `$${match}`);
    const filterQuery = queryStr ? JSON.parse(queryStr) : {};

    const totalCapitals = await Capital.countDocuments(filterQuery);

    res.status(200).json({
      status: 'success',
      results: capitals.length,
      totalCapitals,
      data: {
        capitals,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get capital entry by ID
// @route   GET /api/capitals/:id
// @access  Private
const getCapitalById = async (req, res) => {
  try {
    const capital = await Capital.findById(req.params.id)
      .populate('user', 'name email')
      .select('-__v');

    if (!capital) {
      return res.status(404).json({
        status: 'fail',
        message: 'Capital entry not found',
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        capital,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Update capital entry
// @route   PUT /api/capitals/:id
// @access  Private
const updateCapital = async (req, res) => {
  try {
    const capital = await Capital.findById(req.params.id);

    if (!capital) {
      return res.status(404).json({
        status: 'fail',
        message: 'Capital entry not found',
      });
    }

    const { name, mobileNo, code, description, isActive } = req.body;

    // Update fields
    if (name !== undefined) capital.name = name;
    if (mobileNo !== undefined) capital.mobileNo = mobileNo;
    if (code !== undefined) capital.code = code;
    if (description !== undefined) capital.description = description;
    if (isActive !== undefined) capital.isActive = isActive;

    const updatedCapital = await capital.save();

    // Populate before sending response
    const populatedCapital = await Capital.findById(updatedCapital._id)
      .populate('user', 'name email')
      .select('-__v');

    res.status(200).json({
      status: 'success',
      message: 'Capital entry updated successfully',
      data: {
        capital: populatedCapital,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Delete capital entry
// @route   DELETE /api/capitals/:id
// @access  Private
const deleteCapital = async (req, res) => {
  try {
    const capital = await Capital.findById(req.params.id);

    if (!capital) {
      return res.status(404).json({
        status: 'fail',
        message: 'Capital entry not found',
      });
    }

    await Capital.findByIdAndDelete(req.params.id);

    res.status(200).json({
      status: 'success',
      message: 'Capital entry deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

module.exports = {
  createCapital,
  getCapitals,
  getCapitalById,
  updateCapital,
  deleteCapital,
};

