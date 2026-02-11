const PropertyAccount = require('../models/propertyAccountModel');
const APIFeatures = require('../utils/apiFeatures');

// @desc    Create a new property account
// @route   POST /api/property-accounts
// @access  Private
const createPropertyAccount = async (req, res) => {
  try {
    const { name, mobileNo, code, description } = req.body;

    const propertyAccount = await PropertyAccount.create({
      name,
      mobileNo,
      code,
      description,
    });

    res.status(201).json({
      status: 'success',
      message: 'Property account created successfully',
      data: { propertyAccount },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get all property accounts
// @route   GET /api/property-accounts
// @access  Private
const getPropertyAccounts = async (req, res) => {
  try {
    const features = new APIFeatures(PropertyAccount.find(), req.query)
      .filter()
      .sort()
      .limitFields()
      .paginate();

    const propertyAccounts = await features.query.select('-__v');

    res.status(200).json({
      status: 'success',
      results: propertyAccounts.length,
      data: { propertyAccounts },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get property account by ID
// @route   GET /api/property-accounts/:id
// @access  Private
const getPropertyAccountById = async (req, res) => {
  try {
    const propertyAccount = await PropertyAccount.findById(req.params.id).select(
      '-__v'
    );

    if (!propertyAccount) {
      return res.status(404).json({
        status: 'fail',
        message: 'Property account not found',
      });
    }

    res.status(200).json({
      status: 'success',
      data: { propertyAccount },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Update property account
// @route   PUT /api/property-accounts/:id
// @access  Private
const updatePropertyAccount = async (req, res) => {
  try {
    const propertyAccount = await PropertyAccount.findById(req.params.id);

    if (!propertyAccount) {
      return res.status(404).json({
        status: 'fail',
        message: 'Property account not found',
      });
    }

    const { name, mobileNo, code, description, isActive } = req.body;

    if (name !== undefined) propertyAccount.name = name;
    if (mobileNo !== undefined) propertyAccount.mobileNo = mobileNo;
    if (code !== undefined) propertyAccount.code = code;
    if (description !== undefined) propertyAccount.description = description;
    if (isActive !== undefined) propertyAccount.isActive = isActive;

    const updatedPropertyAccount = await propertyAccount.save();

    res.status(200).json({
      status: 'success',
      message: 'Property account updated successfully',
      data: { propertyAccount: updatedPropertyAccount },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Delete property account
// @route   DELETE /api/property-accounts/:id
// @access  Private
const deletePropertyAccount = async (req, res) => {
  try {
    const propertyAccount = await PropertyAccount.findById(req.params.id);

    if (!propertyAccount) {
      return res.status(404).json({
        status: 'fail',
        message: 'Property account not found',
      });
    }

    await PropertyAccount.findByIdAndDelete(req.params.id);

    res.status(200).json({
      status: 'success',
      message: 'Property account deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

module.exports = {
  createPropertyAccount,
  getPropertyAccounts,
  getPropertyAccountById,
  updatePropertyAccount,
  deletePropertyAccount,
};

