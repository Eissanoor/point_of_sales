const Liability = require('../models/liabilityModel');
const APIFeatures = require('../utils/apiFeatures');

// @desc    Create a new liability
// @route   POST /api/liabilities
// @access  Private
const createLiability = async (req, res) => {
  try {
    const { name, mobileNo, code, description } = req.body;

    const liability = await Liability.create({
      name,
      mobileNo,
      code,
      description,
    });

    res.status(201).json({
      status: 'success',
      message: 'Liability created successfully',
      data: { liability },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get all liabilities
// @route   GET /api/liabilities
// @access  Private
const getLiabilities = async (req, res) => {
  try {
    const features = new APIFeatures(Liability.find(), req.query)
      .filter()
      .sort()
      .limitFields()
      .paginate();

    const liabilities = await features.query.select('-__v');

    res.status(200).json({
      status: 'success',
      results: liabilities.length,
      data: { liabilities },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get liability by ID
// @route   GET /api/liabilities/:id
// @access  Private
const getLiabilityById = async (req, res) => {
  try {
    const liability = await Liability.findById(req.params.id).select('-__v');

    if (!liability) {
      return res.status(404).json({
        status: 'fail',
        message: 'Liability not found',
      });
    }

    res.status(200).json({
      status: 'success',
      data: { liability },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Update liability
// @route   PUT /api/liabilities/:id
// @access  Private
const updateLiability = async (req, res) => {
  try {
    const liability = await Liability.findById(req.params.id);

    if (!liability) {
      return res.status(404).json({
        status: 'fail',
        message: 'Liability not found',
      });
    }

    const { name, mobileNo, code, description, isActive } = req.body;

    if (name !== undefined) liability.name = name;
    if (mobileNo !== undefined) liability.mobileNo = mobileNo;
    if (code !== undefined) liability.code = code;
    if (description !== undefined) liability.description = description;
    if (isActive !== undefined) liability.isActive = isActive;

    const updatedLiability = await liability.save();

    res.status(200).json({
      status: 'success',
      message: 'Liability updated successfully',
      data: { liability: updatedLiability },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Delete liability
// @route   DELETE /api/liabilities/:id
// @access  Private
const deleteLiability = async (req, res) => {
  try {
    const liability = await Liability.findById(req.params.id);

    if (!liability) {
      return res.status(404).json({
        status: 'fail',
        message: 'Liability not found',
      });
    }

    await Liability.findByIdAndDelete(req.params.id);

    res.status(200).json({
      status: 'success',
      message: 'Liability deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

module.exports = {
  createLiability,
  getLiabilities,
  getLiabilityById,
  updateLiability,
  deleteLiability,
};

