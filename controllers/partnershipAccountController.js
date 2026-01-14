const PartnershipAccount = require('../models/partnershipAccountModel');
const APIFeatures = require('../utils/apiFeatures');

// @desc    Create a new partnership account
// @route   POST /api/partnership-accounts
// @access  Private
const createPartnershipAccount = async (req, res) => {
  try {
    const { partnerName, phoneNumber, sharePercentage, openingBalance } =
      req.body;

    const partnershipAccount = await PartnershipAccount.create({
      partnerName,
      phoneNumber,
      sharePercentage:
        typeof sharePercentage === 'string'
          ? parseFloat(sharePercentage)
          : sharePercentage,
      openingBalance:
        typeof openingBalance === 'string'
          ? parseFloat(openingBalance)
          : openingBalance,
    });

    res.status(201).json({
      status: 'success',
      message: 'Partnership account created successfully',
      data: { partnershipAccount },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get all partnership accounts
// @route   GET /api/partnership-accounts
// @access  Private
const getPartnershipAccounts = async (req, res) => {
  try {
    const features = new APIFeatures(PartnershipAccount.find(), req.query)
      .filter()
      .sort()
      .limitFields()
      .paginate();

    const partnershipAccounts = await features.query.select('-__v');

    res.status(200).json({
      status: 'success',
      results: partnershipAccounts.length,
      data: { partnershipAccounts },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get partnership account by ID
// @route   GET /api/partnership-accounts/:id
// @access  Private
const getPartnershipAccountById = async (req, res) => {
  try {
    const partnershipAccount = await PartnershipAccount.findById(
      req.params.id
    ).select('-__v');

    if (!partnershipAccount) {
      return res.status(404).json({
        status: 'fail',
        message: 'Partnership account not found',
      });
    }

    res.status(200).json({
      status: 'success',
      data: { partnershipAccount },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Update partnership account
// @route   PUT /api/partnership-accounts/:id
// @access  Private
const updatePartnershipAccount = async (req, res) => {
  try {
    const partnershipAccount = await PartnershipAccount.findById(
      req.params.id
    );

    if (!partnershipAccount) {
      return res.status(404).json({
        status: 'fail',
        message: 'Partnership account not found',
      });
    }

    const { partnerName, phoneNumber, sharePercentage, openingBalance, isActive } =
      req.body;

    if (partnerName !== undefined) partnershipAccount.partnerName = partnerName;
    if (phoneNumber !== undefined) partnershipAccount.phoneNumber = phoneNumber;
    if (sharePercentage !== undefined) {
      partnershipAccount.sharePercentage =
        typeof sharePercentage === 'string'
          ? parseFloat(sharePercentage)
          : sharePercentage;
    }
    if (openingBalance !== undefined) {
      partnershipAccount.openingBalance =
        typeof openingBalance === 'string'
          ? parseFloat(openingBalance)
          : openingBalance;
    }
    if (isActive !== undefined) partnershipAccount.isActive = isActive;

    const updatedPartnershipAccount = await partnershipAccount.save();

    res.status(200).json({
      status: 'success',
      message: 'Partnership account updated successfully',
      data: { partnershipAccount: updatedPartnershipAccount },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Delete partnership account
// @route   DELETE /api/partnership-accounts/:id
// @access  Private
const deletePartnershipAccount = async (req, res) => {
  try {
    const partnershipAccount = await PartnershipAccount.findById(
      req.params.id
    );

    if (!partnershipAccount) {
      return res.status(404).json({
        status: 'fail',
        message: 'Partnership account not found',
      });
    }

    await PartnershipAccount.findByIdAndDelete(req.params.id);

    res.status(200).json({
      status: 'success',
      message: 'Partnership account deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

module.exports = {
  createPartnershipAccount,
  getPartnershipAccounts,
  getPartnershipAccountById,
  updatePartnershipAccount,
  deletePartnershipAccount,
};

