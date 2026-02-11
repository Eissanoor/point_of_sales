const Asset = require('../models/assetModel');
const APIFeatures = require('../utils/apiFeatures');

// @desc    Create a new asset
// @route   POST /api/assets
// @access  Private
const createAsset = async (req, res) => {
  try {
    const { name, mobileNo, code, description } = req.body;

    // Validate user is authenticated
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        status: 'fail',
        message: 'User not authenticated',
      });
    }

    const asset = await Asset.create({
      name,
      mobileNo,
      code,
      description,
      user: req.user._id,
    });

    // Populate before sending response
    const populatedAsset = await Asset.findById(asset._id)
      .populate('user', 'name email')
      .select('-__v');

    res.status(201).json({
      status: 'success',
      message: 'Asset created successfully',
      data: {
        asset: populatedAsset,
      },
    });
  } catch (error) {
    console.error('Error creating asset:', error);

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

// @desc    Get all assets with filtering and pagination
// @route   GET /api/assets
// @access  Private
const getAssets = async (req, res) => {
  try {
    const features = new APIFeatures(Asset.find(), req.query)
      .filter()
      .sort()
      .limitFields()
      .paginate();

    const assets = await features.query
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

    const totalAssets = await Asset.countDocuments(filterQuery);

    res.status(200).json({
      status: 'success',
      results: assets.length,
      totalAssets,
      data: {
        assets,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get asset by ID
// @route   GET /api/assets/:id
// @access  Private
const getAssetById = async (req, res) => {
  try {
    const asset = await Asset.findById(req.params.id)
      .populate('user', 'name email')
      .select('-__v');

    if (!asset) {
      return res.status(404).json({
        status: 'fail',
        message: 'Asset not found',
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        asset,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Update asset
// @route   PUT /api/assets/:id
// @access  Private
const updateAsset = async (req, res) => {
  try {
    const asset = await Asset.findById(req.params.id);

    if (!asset) {
      return res.status(404).json({
        status: 'fail',
        message: 'Asset not found',
      });
    }

    const { name, mobileNo, code, description, isActive } = req.body;

    // Update fields
    if (name !== undefined) asset.name = name;
    if (mobileNo !== undefined) asset.mobileNo = mobileNo;
    if (code !== undefined) asset.code = code;
    if (description !== undefined) asset.description = description;
    if (isActive !== undefined) asset.isActive = isActive;

    const updatedAsset = await asset.save();

    // Populate before sending response
    const populatedAsset = await Asset.findById(updatedAsset._id)
      .populate('user', 'name email')
      .select('-__v');

    res.status(200).json({
      status: 'success',
      message: 'Asset updated successfully',
      data: {
        asset: populatedAsset,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Delete asset
// @route   DELETE /api/assets/:id
// @access  Private
const deleteAsset = async (req, res) => {
  try {
    const asset = await Asset.findById(req.params.id);

    if (!asset) {
      return res.status(404).json({
        status: 'fail',
        message: 'Asset not found',
      });
    }

    await Asset.findByIdAndDelete(req.params.id);

    res.status(200).json({
      status: 'success',
      message: 'Asset deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

module.exports = {
  createAsset,
  getAssets,
  getAssetById,
  updateAsset,
  deleteAsset,
};

