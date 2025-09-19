const BankAccount = require('../models/bankAccountModel');
const APIFeatures = require('../utils/apiFeatures');

// @desc    Fetch all bank accounts
// @route   GET /api/bank-accounts
// @access  Private
const getBankAccounts = async (req, res) => {
  try {
    const features = new APIFeatures(BankAccount.find(), req.query)
      .filter()
      .sort()
      .limitFields()
      .paginate();

    const bankAccounts = await features.query
      .populate('currency', 'name code symbol')
      .select('-__v');

    res.status(200).json({
      status: 'success',
      results: bankAccounts.length,
      data: {
        bankAccounts
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// @desc    Fetch single bank account
// @route   GET /api/bank-accounts/:id
// @access  Private
const getBankAccountById = async (req, res) => {
  try {
    const bankAccount = await BankAccount.findById(req.params.id)
      .populate('currency', 'name code symbol')
      .select('-__v');

    if (!bankAccount) {
      return res.status(404).json({
        status: 'fail',
        message: 'Bank account not found'
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        bankAccount
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// @desc    Create bank account
// @route   POST /api/bank-accounts
// @access  Private/Admin
const createBankAccount = async (req, res) => {
  try {
    const {
      accountName,
      accountNumber,
      bankName,
      branchName,
      branchCode,
      accountType,
      currency,
      openingBalance,
      swiftCode,
      iban,
      contactPerson,
      contactNumber,
      isActive = true
    } = req.body;

    // Check if account number already exists
    const existingAccount = await BankAccount.findOne({ accountNumber });
    if (existingAccount) {
      return res.status(400).json({
        status: 'fail',
        message: 'Account number already exists'
      });
    }

    const bankAccount = new BankAccount({
      accountName,
      accountNumber,
      bankName,
      branchName,
      branchCode,
      accountType,
      currency,
      balance: openingBalance || 0,
      openingBalance: openingBalance || 0,
      swiftCode,
      iban,
      contactPerson,
      contactNumber,
      isActive
    });

    const savedAccount = await bankAccount.save();
    const populatedAccount = await BankAccount.findById(savedAccount._id)
      .populate('currency', 'name code symbol')
      .select('-__v');

    res.status(201).json({
      status: 'success',
      data: {
        bankAccount: populatedAccount
      },
      message: 'Bank account created successfully'
    });
  } catch (error) {
    res.status(400).json({
      status: 'fail',
      message: error.message
    });
  }
};

// @desc    Update bank account
// @route   PUT /api/bank-accounts/:id
// @access  Private/Admin
const updateBankAccount = async (req, res) => {
  try {
    const bankAccount = await BankAccount.findById(req.params.id);
    
    if (!bankAccount) {
      return res.status(404).json({
        status: 'fail',
        message: 'Bank account not found'
      });
    }

    // Prevent updating account number if it's being changed
    if (req.body.accountNumber && req.body.accountNumber !== bankAccount.accountNumber) {
      const existingAccount = await BankAccount.findOne({ accountNumber: req.body.accountNumber });
      if (existingAccount) {
        return res.status(400).json({
          status: 'fail',
          message: 'Account number already exists'
        });
      }
    }

    // Update fields
    const updatableFields = [
      'accountName', 'bankName', 'branchName', 'branchCode',
      'accountType', 'currency', 'swiftCode', 'iban',
      'contactPerson', 'contactNumber', 'isActive'
    ];

    updatableFields.forEach(field => {
      if (req.body[field] !== undefined) {
        bankAccount[field] = req.body[field];
      }
    });

    const updatedAccount = await bankAccount.save();
    const populatedAccount = await BankAccount.findById(updatedAccount._id)
      .populate('currency', 'name code symbol')
      .select('-__v');

    res.status(200).json({
      status: 'success',
      data: {
        bankAccount: populatedAccount
      },
      message: 'Bank account updated successfully'
    });
  } catch (error) {
    res.status(400).json({
      status: 'fail',
      message: error.message
    });
  }
};

// @desc    Delete bank account (soft delete)
// @route   DELETE /api/bank-accounts/:id
// @access  Private/Admin
const deleteBankAccount = async (req, res) => {
  try {
    const bankAccount = await BankAccount.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!bankAccount) {
      return res.status(404).json({
        status: 'fail',
        message: 'Bank account not found'
      });
    }

    res.status(200).json({
      status: 'success',
      data: null,
      message: 'Bank account deactivated successfully'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// @desc    Get bank account balance
// @route   GET /api/bank-accounts/:id/balance
// @access  Private
const getAccountBalance = async (req, res) => {
  try {
    const bankAccount = await BankAccount.findById(req.params.id)
      .select('accountName accountNumber balance currency')
      .populate('currency', 'name code symbol');

    if (!bankAccount) {
      return res.status(404).json({
        status: 'fail',
        message: 'Bank account not found'
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        account: bankAccount.accountName,
        accountNumber: bankAccount.accountNumber,
        balance: bankAccount.balance,
        currency: bankAccount.currency
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

module.exports = {
  getBankAccounts,
  getBankAccountById,
  createBankAccount,
  updateBankAccount,
  deleteBankAccount,
  getAccountBalance
};
