const Saraf = require('../models/sarafModel');
const APIFeatures = require('../utils/apiFeatures');

// @desc    Create saraf
// @route   POST /api/sarafs
// @access  Private
const createSaraf = async (req, res) => {
  try {
    const { name, mobileNo, code, description } = req.body;

    if (!req.user || !req.user._id) {
      return res.status(401).json({
        status: 'fail',
        message: 'User not authenticated',
      });
    }

    const saraf = await Saraf.create({
      name,
      mobileNo,
      code,
      description,
      user: req.user._id,
    });

    const populatedSaraf = await Saraf.findById(saraf._id)
      .populate('user', 'name email')
      .select('-__v');

    res.status(201).json({
      status: 'success',
      message: 'Saraf created successfully',
      data: {
        saraf: populatedSaraf,
      },
    });
  } catch (error) {
    console.error('Error creating saraf:', error);

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

// @desc    Get all saraf records
// @route   GET /api/sarafs
// @access  Private
const getSarafs = async (req, res) => {
  try {
    const features = new APIFeatures(Saraf.find(), req.query)
      .filter()
      .sort()
      .limitFields()
      .paginate();

    const sarafs = await features.query
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .select('-__v');

    const queryObj = { ...req.query };
    const excludedFields = ['page', 'sort', 'limit', 'fields'];
    excludedFields.forEach((el) => delete queryObj[el]);
    let queryStr = JSON.stringify(queryObj);
    queryStr = queryStr.replace(/\b(gte|gt|lte|lt)\b/g, (match) => `$${match}`);
    const filterQuery = queryStr ? JSON.parse(queryStr) : {};

    const totalSarafs = await Saraf.countDocuments(filterQuery);

    res.status(200).json({
      status: 'success',
      results: sarafs.length,
      totalSarafs,
      data: {
        sarafs,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get saraf by ID
// @route   GET /api/sarafs/:id
// @access  Private
const getSarafById = async (req, res) => {
  try {
    const saraf = await Saraf.findById(req.params.id)
      .populate('user', 'name email')
      .select('-__v');

    if (!saraf) {
      return res.status(404).json({
        status: 'fail',
        message: 'Saraf not found',
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        saraf,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Update saraf
// @route   PUT /api/sarafs/:id
// @access  Private
const updateSaraf = async (req, res) => {
  try {
    const saraf = await Saraf.findById(req.params.id);

    if (!saraf) {
      return res.status(404).json({
        status: 'fail',
        message: 'Saraf not found',
      });
    }

    const { name, mobileNo, code, description, isActive } = req.body;

    if (name !== undefined) saraf.name = name;
    if (mobileNo !== undefined) saraf.mobileNo = mobileNo;
    if (code !== undefined) saraf.code = code;
    if (description !== undefined) saraf.description = description;
    if (isActive !== undefined) saraf.isActive = isActive;

    await saraf.save();

    const populatedSaraf = await Saraf.findById(saraf._id)
      .populate('user', 'name email')
      .select('-__v');

    res.status(200).json({
      status: 'success',
      message: 'Saraf updated successfully',
      data: {
        saraf: populatedSaraf,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Delete saraf
// @route   DELETE /api/sarafs/:id
// @access  Private
const deleteSaraf = async (req, res) => {
  try {
    const saraf = await Saraf.findById(req.params.id);

    if (!saraf) {
      return res.status(404).json({
        status: 'fail',
        message: 'Saraf not found',
      });
    }

    await Saraf.findByIdAndDelete(req.params.id);

    res.status(200).json({
      status: 'success',
      message: 'Saraf deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

module.exports = {
  createSaraf,
  getSarafs,
  getSarafById,
  updateSaraf,
  deleteSaraf,
};
