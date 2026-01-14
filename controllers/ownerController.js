const Owner = require('../models/ownerModel');
const APIFeatures = require('../utils/apiFeatures');

// @desc    Create a new owner
// @route   POST /api/owners
// @access  Private
const createOwner = async (req, res) => {
  try {
    const { name, phoneNumber, address } = req.body;

    const owner = await Owner.create({
      name,
      phoneNumber,
      address,
    });

    res.status(201).json({
      status: 'success',
      message: 'Owner created successfully',
      data: { owner },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get all owners
// @route   GET /api/owners
// @access  Private
const getOwners = async (req, res) => {
  try {
    const features = new APIFeatures(Owner.find(), req.query)
      .filter()
      .sort()
      .limitFields()
      .paginate();

    const owners = await features.query.select('-__v');

    res.status(200).json({
      status: 'success',
      results: owners.length,
      data: { owners },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get owner by ID
// @route   GET /api/owners/:id
// @access  Private
const getOwnerById = async (req, res) => {
  try {
    const owner = await Owner.findById(req.params.id).select('-__v');

    if (!owner) {
      return res.status(404).json({
        status: 'fail',
        message: 'Owner not found',
      });
    }

    res.status(200).json({
      status: 'success',
      data: { owner },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Update owner
// @route   PUT /api/owners/:id
// @access  Private
const updateOwner = async (req, res) => {
  try {
    const owner = await Owner.findById(req.params.id);

    if (!owner) {
      return res.status(404).json({
        status: 'fail',
        message: 'Owner not found',
      });
    }

    const { name, phoneNumber, address, isActive } = req.body;

    if (name !== undefined) owner.name = name;
    if (phoneNumber !== undefined) owner.phoneNumber = phoneNumber;
    if (address !== undefined) owner.address = address;
    if (isActive !== undefined) owner.isActive = isActive;

    const updatedOwner = await owner.save();

    res.status(200).json({
      status: 'success',
      message: 'Owner updated successfully',
      data: { owner: updatedOwner },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Delete owner
// @route   DELETE /api/owners/:id
// @access  Private
const deleteOwner = async (req, res) => {
  try {
    const owner = await Owner.findById(req.params.id);

    if (!owner) {
      return res.status(404).json({
        status: 'fail',
        message: 'Owner not found',
      });
    }

    await Owner.findByIdAndDelete(req.params.id);

    res.status(200).json({
      status: 'success',
      message: 'Owner deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

module.exports = {
  createOwner,
  getOwners,
  getOwnerById,
  updateOwner,
  deleteOwner,
};