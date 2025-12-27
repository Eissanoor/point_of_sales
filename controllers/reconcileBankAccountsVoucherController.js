const mongoose = require('mongoose');
const ReconcileBankAccountsVoucher = require('../models/reconcileBankAccountsVoucherModel');
const BankAccount = require('../models/bankAccountModel');
const APIFeatures = require('../utils/apiFeatures');
const cloudinary = require('cloudinary').v2;

// @desc    Get all reconcile bank accounts vouchers with filtering and pagination
// @route   GET /api/reconcile-bank-accounts-vouchers
// @access  Private
const getReconcileBankAccountsVouchers = async (req, res) => {
  try {
    const features = new APIFeatures(ReconcileBankAccountsVoucher.find(), req.query)
      .filter()
      .sort()
      .limitFields()
      .paginate();

    const vouchers = await features.query
      .populate('bankAccount', 'accountName accountNumber bankName')
      .populate('currency', 'name code symbol')
      .populate('entries.matchedTransaction')
      .populate('user', 'name email')
      .populate('reconciledBy', 'name email')
      .populate('approvalStatus.approvedBy', 'name')
      .sort({ statementDate: -1, voucherDate: -1 })
      .select('-__v');

    // Build filter query for count
    const queryObj = { ...req.query };
    const excludedFields = ['page', 'sort', 'limit', 'fields'];
    excludedFields.forEach(el => delete queryObj[el]);
    let queryStr = JSON.stringify(queryObj);
    queryStr = queryStr.replace(/\b(gte|gt|lte|lt)\b/g, match => `$${match}`);
    const filterQuery = queryStr ? JSON.parse(queryStr) : {};
    
    const totalVouchers = await ReconcileBankAccountsVoucher.countDocuments(filterQuery);

    res.status(200).json({
      status: 'success',
      results: vouchers.length,
      totalVouchers,
      data: {
        vouchers,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get reconcile bank accounts voucher by ID
// @route   GET /api/reconcile-bank-accounts-vouchers/:id
// @access  Private
const getReconcileBankAccountsVoucherById = async (req, res) => {
  try {
    const voucher = await ReconcileBankAccountsVoucher.findById(req.params.id)
      .populate('bankAccount', 'accountName accountNumber bankName branchName branchCode balance')
      .populate('currency', 'name code symbol')
      .populate('entries.matchedTransaction')
      .populate('user', 'name email')
      .populate('reconciledBy', 'name email')
      .populate('approvalStatus.approvedBy', 'name email')
      .select('-__v');

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Reconcile bank accounts voucher not found',
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        voucher,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Create new reconcile bank accounts voucher
// @route   POST /api/reconcile-bank-accounts-vouchers
// @access  Private
const createReconcileBankAccountsVoucher = async (req, res) => {
  try {
    const {
      voucherDate,
      bankAccount,
      statementDate,
      statementNumber,
      openingBalance,
      closingBalance,
      bookBalance,
      statementBalance,
      entries,
      outstandingDeposits,
      outstandingWithdrawals,
      outstandingChecks,
      bankCharges,
      interestEarned,
      errors,
      currency,
      currencyExchangeRate,
      referenceNumber,
      transactionId,
      description,
      notes,
      status,
      attachments,
    } = req.body;
    
    console.log('req.file:', req.file);
    console.log('attachments from req.body:', attachments);
    console.log('entries from req.body:', entries);
    
    // Validate bank account exists
    const bankAccountExists = await BankAccount.findById(bankAccount);
    if (!bankAccountExists) {
      return res.status(404).json({
        status: 'fail',
        message: 'Bank account not found',
      });
    }

    // Parse entries if it comes as a string (from form-data)
    let parsedEntries = entries || [];
    
    if (typeof entries === 'string') {
      try {
        let cleanString = entries.trim();
        if ((cleanString.startsWith('"') && cleanString.endsWith('"')) || 
            (cleanString.startsWith("'") && cleanString.endsWith("'"))) {
          cleanString = cleanString.slice(1, -1);
        }
        cleanString = cleanString
          .replace(/\\n/g, '')
          .replace(/\\r/g, '')
          .replace(/\\t/g, '')
          .replace(/\\'/g, "'")
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\');
        
        const parsed = JSON.parse(cleanString);
        if (Array.isArray(parsed)) {
          parsedEntries = parsed;
        }
      } catch (parseError) {
        console.error('Error parsing entries string:', parseError);
        parsedEntries = [];
      }
    }
    
    // Handle form-data array notation
    if (!Array.isArray(parsedEntries) && typeof parsedEntries === 'object' && parsedEntries !== null) {
      const keys = Object.keys(parsedEntries);
      const numericKeys = keys.filter(key => /^\d+$/.test(key));
      if (numericKeys.length > 0) {
        parsedEntries = numericKeys
          .sort((a, b) => parseInt(a) - parseInt(b))
          .map(key => {
            const entryValue = parsedEntries[key];
            if (typeof entryValue === 'string') {
              try {
                return JSON.parse(entryValue);
              } catch (e) {
                return entryValue;
              }
            }
            return entryValue;
          });
      }
    }

    // Handle file uploads for attachments
    let uploadedAttachments = [];
    
    const parseAttachmentsString = (attachmentsStr) => {
      if (!attachmentsStr || typeof attachmentsStr !== 'string') {
        return [];
      }
      
      try {
        let cleanString = attachmentsStr.trim();
        if ((cleanString.startsWith('"') && cleanString.endsWith('"')) || 
            (cleanString.startsWith("'") && cleanString.endsWith("'"))) {
          cleanString = cleanString.slice(1, -1);
        }
        cleanString = cleanString
          .replace(/\\n/g, '')
          .replace(/\\r/g, '')
          .replace(/\\t/g, '')
          .replace(/\\'/g, "'")
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\');
        
        const parsed = JSON.parse(cleanString);
        if (Array.isArray(parsed)) {
          return parsed;
        } else if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return [parsed];
        }
        return [];
      } catch (parseError) {
        console.error('Error parsing attachments string:', parseError.message);
        return [];
      }
    };
    
    if (req.file) {
      try {
        const uploadResult = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder: 'reconcile-bank-accounts-vouchers' },
            (error, result) => {
              if (error) return reject(error);
              resolve(result);
            }
          );
          stream.end(req.file.buffer);
        });
        
        uploadedAttachments.push({
          url: String(uploadResult.secure_url || ''),
          name: String(req.file.originalname || ''),
          type: String(req.file.mimetype || '')
        });
      } catch (uploadError) {
        console.error('Error uploading file:', uploadError);
      }
    }
    
    if (attachments !== undefined && attachments !== null) {
      let parsedAttachments = [];
      
      if (Array.isArray(attachments)) {
        parsedAttachments = attachments;
      } else if (typeof attachments === 'string') {
        parsedAttachments = parseAttachmentsString(attachments);
      } else if (typeof attachments === 'object' && !Array.isArray(attachments)) {
        parsedAttachments = [attachments];
      }
      
      const normalizedAttachments = parsedAttachments
        .filter(att => {
          if (!att || Array.isArray(att)) return false;
          if (typeof att !== 'object') return false;
          return att.url || att.name;
        })
        .map(att => ({
          url: String(att.url || ''),
          name: String(att.name || ''),
          type: String(att.type || att.mimetype || '')
        }));
      
      if (req.file && uploadedAttachments.length > 0) {
        uploadedAttachments = [...uploadedAttachments, ...normalizedAttachments];
      } else {
        uploadedAttachments = normalizedAttachments;
      }
    }

    if (!req.user || !req.user._id) {
      return res.status(401).json({
        status: 'fail',
        message: 'User not authenticated',
      });
    }

    // Normalize entries
    const normalizedEntries = (parsedEntries || []).map(entry => ({
      statementDate: entry.statementDate ? new Date(entry.statementDate) : new Date(),
      statementDescription: entry.statementDescription || '',
      statementAmount: typeof entry.statementAmount === 'string' ? parseFloat(entry.statementAmount) : (entry.statementAmount || 0),
      statementType: entry.statementType || 'debit',
      statementReference: entry.statementReference || '',
      matchedTransaction: entry.matchedTransaction || null,
      matchedTransactionModel: entry.matchedTransactionModel || null,
      matchedTransactionNumber: entry.matchedTransactionNumber || '',
      status: entry.status || 'unmatched',
      adjustment: entry.adjustment || null,
      notes: entry.notes || '',
    }));

    // Create voucher
    const voucherData = {
      bankAccount,
      statementDate: statementDate ? new Date(statementDate) : new Date(),
      statementNumber,
      openingBalance: typeof openingBalance === 'string' ? parseFloat(openingBalance) : (openingBalance || 0),
      closingBalance: typeof closingBalance === 'string' ? parseFloat(closingBalance) : (closingBalance || 0),
      bookBalance: typeof bookBalance === 'string' ? parseFloat(bookBalance) : (bookBalance || 0),
      statementBalance: typeof statementBalance === 'string' ? parseFloat(statementBalance) : (statementBalance || 0),
      entries: normalizedEntries,
      outstandingDeposits: typeof outstandingDeposits === 'string' ? parseFloat(outstandingDeposits) : (outstandingDeposits || 0),
      outstandingWithdrawals: typeof outstandingWithdrawals === 'string' ? parseFloat(outstandingWithdrawals) : (outstandingWithdrawals || 0),
      outstandingChecks: typeof outstandingChecks === 'string' ? parseFloat(outstandingChecks) : (outstandingChecks || 0),
      bankCharges: typeof bankCharges === 'string' ? parseFloat(bankCharges) : (bankCharges || 0),
      interestEarned: typeof interestEarned === 'string' ? parseFloat(interestEarned) : (interestEarned || 0),
      errors: typeof errors === 'string' ? parseFloat(errors) : (errors || 0),
      currency,
      currencyExchangeRate: currencyExchangeRate ? (typeof currencyExchangeRate === 'string' ? parseFloat(currencyExchangeRate) : currencyExchangeRate) : 1,
      referenceNumber,
      transactionId,
      description,
      notes,
      status: status || 'draft',
      reconciliationStatus: 'pending',
      attachments: uploadedAttachments,
      user: req.user._id,
    };

    if (voucherDate) {
      const parsedDate = new Date(voucherDate);
      if (!isNaN(parsedDate.getTime())) {
        voucherData.voucherDate = parsedDate;
      }
    }

    if (req.body.voucherNumber) {
      voucherData.voucherNumber = req.body.voucherNumber;
    }

    if (!Array.isArray(voucherData.attachments)) {
      voucherData.attachments = [];
    } else {
      voucherData.attachments = voucherData.attachments
        .filter(att => att && typeof att === 'object' && !Array.isArray(att))
        .map(att => ({
          url: String(att.url || ''),
          name: String(att.name || ''),
          type: String(att.type || '')
        }));
    }

    const voucher = await ReconcileBankAccountsVoucher.create(voucherData);

    const populatedVoucher = await ReconcileBankAccountsVoucher.findById(voucher._id)
      .populate('bankAccount', 'accountName accountNumber bankName')
      .populate('currency', 'name code symbol')
      .populate('user', 'name email')
      .select('-__v');

    res.status(201).json({
      status: 'success',
      message: 'Reconcile bank accounts voucher created successfully',
      data: {
        voucher: populatedVoucher,
      },
    });
  } catch (error) {
    console.error('Error creating reconcile bank accounts voucher:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    
    if (error.name === 'ValidationError') {
      console.error('Validation errors:', error.errors);
      const validationErrors = Object.keys(error.errors).map(key => ({
        field: key,
        message: error.errors[key].message,
        value: error.errors[key].value
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
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
};

// @desc    Update reconcile bank accounts voucher
// @route   PUT /api/reconcile-bank-accounts-vouchers/:id
// @access  Private
const updateReconcileBankAccountsVoucher = async (req, res) => {
  try {
    const voucher = await ReconcileBankAccountsVoucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Reconcile bank accounts voucher not found',
      });
    }

    if (voucher.status === 'completed' || voucher.status === 'cancelled') {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot update completed or cancelled voucher',
      });
    }

    const {
      voucherDate,
      bankAccount,
      statementDate,
      statementNumber,
      openingBalance,
      closingBalance,
      bookBalance,
      statementBalance,
      entries,
      outstandingDeposits,
      outstandingWithdrawals,
      outstandingChecks,
      bankCharges,
      interestEarned,
      errors,
      currency,
      currencyExchangeRate,
      referenceNumber,
      transactionId,
      description,
      notes,
      status,
      reconciliationStatus,
      attachments,
    } = req.body;

    // Validate bank account if provided
    if (bankAccount !== undefined) {
      const bankAccountExists = await BankAccount.findById(bankAccount);
      if (!bankAccountExists) {
        return res.status(404).json({
          status: 'fail',
          message: 'Bank account not found',
        });
      }
      voucher.bankAccount = bankAccount;
    }

    // Handle entries if provided
    if (entries !== undefined) {
      let parsedEntries = entries;
      
      if (typeof entries === 'string') {
        try {
          let cleanString = entries.trim();
          if ((cleanString.startsWith('"') && cleanString.endsWith('"')) || 
              (cleanString.startsWith("'") && cleanString.endsWith("'"))) {
            cleanString = cleanString.slice(1, -1);
          }
          cleanString = cleanString
            .replace(/\\n/g, '')
            .replace(/\\r/g, '')
            .replace(/\\t/g, '')
            .replace(/\\'/g, "'")
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\');
          
          const parsed = JSON.parse(cleanString);
          if (Array.isArray(parsed)) {
            parsedEntries = parsed;
          }
        } catch (parseError) {
          parsedEntries = [];
        }
      }
      
      if (!Array.isArray(parsedEntries) && typeof parsedEntries === 'object' && parsedEntries !== null) {
        const keys = Object.keys(parsedEntries);
        const numericKeys = keys.filter(key => /^\d+$/.test(key));
        if (numericKeys.length > 0) {
          parsedEntries = numericKeys
            .sort((a, b) => parseInt(a) - parseInt(b))
            .map(key => {
              const entryValue = parsedEntries[key];
              if (typeof entryValue === 'string') {
                try {
                  return JSON.parse(entryValue);
                } catch (e) {
                  return entryValue;
                }
              }
              return entryValue;
            });
        }
      }

      const normalizedEntries = (parsedEntries || []).map(entry => ({
        statementDate: entry.statementDate ? new Date(entry.statementDate) : new Date(),
        statementDescription: entry.statementDescription || '',
        statementAmount: typeof entry.statementAmount === 'string' ? parseFloat(entry.statementAmount) : (entry.statementAmount || 0),
        statementType: entry.statementType || 'debit',
        statementReference: entry.statementReference || '',
        matchedTransaction: entry.matchedTransaction || null,
        matchedTransactionModel: entry.matchedTransactionModel || null,
        matchedTransactionNumber: entry.matchedTransactionNumber || '',
        status: entry.status || 'unmatched',
        adjustment: entry.adjustment || null,
        notes: entry.notes || '',
      }));

      voucher.entries = normalizedEntries;
    }

    // Handle attachments
    if (attachments !== undefined || req.file) {
      let uploadedAttachments = voucher.attachments || [];
      
      if (req.file) {
        if (voucher.attachments && voucher.attachments.length > 0) {
          for (const attachment of voucher.attachments) {
            if (attachment.url) {
              try {
                const publicId = attachment.url.split('/').slice(-2).join('/').split('.')[0];
                await cloudinary.uploader.destroy(`reconcile-bank-accounts-vouchers/${publicId}`);
              } catch (error) {
                console.error('Error deleting old attachment:', error);
              }
            }
          }
        }

        uploadedAttachments = [];
        try {
          const uploadResult = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
              { folder: 'reconcile-bank-accounts-vouchers' },
              (error, result) => {
                if (error) return reject(error);
                resolve(result);
              }
            );
            stream.end(req.file.buffer);
          });
          
          uploadedAttachments.push({
            url: String(uploadResult.secure_url || ''),
            name: String(req.file.originalname || ''),
            type: String(req.file.mimetype || '')
          });
        } catch (uploadError) {
          uploadedAttachments = voucher.attachments || [];
        }
      }
      
      if (attachments !== undefined) {
        if (attachments === null) {
          uploadedAttachments = [];
        } else {
          let parsedAttachments = [];
          if (Array.isArray(attachments)) {
            parsedAttachments = attachments;
          } else if (typeof attachments === 'string') {
            try {
              const parsed = JSON.parse(attachments);
              parsedAttachments = Array.isArray(parsed) ? parsed : [parsed];
            } catch (e) {
              parsedAttachments = [];
            }
          }
          
          const normalizedAttachments = parsedAttachments
            .filter(att => att && typeof att === 'object' && !Array.isArray(att))
            .map(att => ({
              url: String(att.url || ''),
              name: String(att.name || ''),
              type: String(att.type || '')
            }));
          
          if (req.file && uploadedAttachments.length > 0) {
            uploadedAttachments = [...uploadedAttachments, ...normalizedAttachments];
          } else {
            uploadedAttachments = normalizedAttachments;
          }
        }
      }

      voucher.attachments = uploadedAttachments
        .filter(att => att && typeof att === 'object' && !Array.isArray(att))
        .map(att => ({
          url: String(att.url || ''),
          name: String(att.name || ''),
          type: String(att.type || '')
        }));
    }

    // Update fields
    if (voucherDate !== undefined) {
      const parsedDate = new Date(voucherDate);
      if (!isNaN(parsedDate.getTime())) {
        voucher.voucherDate = parsedDate;
      }
    }
    if (statementDate !== undefined) voucher.statementDate = new Date(statementDate);
    if (statementNumber !== undefined) voucher.statementNumber = statementNumber;
    if (openingBalance !== undefined) voucher.openingBalance = typeof openingBalance === 'string' ? parseFloat(openingBalance) : openingBalance;
    if (closingBalance !== undefined) voucher.closingBalance = typeof closingBalance === 'string' ? parseFloat(closingBalance) : closingBalance;
    if (bookBalance !== undefined) voucher.bookBalance = typeof bookBalance === 'string' ? parseFloat(bookBalance) : bookBalance;
    if (statementBalance !== undefined) voucher.statementBalance = typeof statementBalance === 'string' ? parseFloat(statementBalance) : statementBalance;
    if (outstandingDeposits !== undefined) voucher.outstandingDeposits = typeof outstandingDeposits === 'string' ? parseFloat(outstandingDeposits) : outstandingDeposits;
    if (outstandingWithdrawals !== undefined) voucher.outstandingWithdrawals = typeof outstandingWithdrawals === 'string' ? parseFloat(outstandingWithdrawals) : outstandingWithdrawals;
    if (outstandingChecks !== undefined) voucher.outstandingChecks = typeof outstandingChecks === 'string' ? parseFloat(outstandingChecks) : outstandingChecks;
    if (bankCharges !== undefined) voucher.bankCharges = typeof bankCharges === 'string' ? parseFloat(bankCharges) : bankCharges;
    if (interestEarned !== undefined) voucher.interestEarned = typeof interestEarned === 'string' ? parseFloat(interestEarned) : interestEarned;
    if (errors !== undefined) voucher.errors = typeof errors === 'string' ? parseFloat(errors) : errors;
    if (currency !== undefined) voucher.currency = currency;
    if (currencyExchangeRate !== undefined) voucher.currencyExchangeRate = typeof currencyExchangeRate === 'string' ? parseFloat(currencyExchangeRate) : currencyExchangeRate;
    if (referenceNumber !== undefined) voucher.referenceNumber = referenceNumber;
    if (transactionId !== undefined) voucher.transactionId = transactionId;
    if (description !== undefined) voucher.description = description;
    if (notes !== undefined) voucher.notes = notes;
    if (status !== undefined) voucher.status = status;
    if (reconciliationStatus !== undefined) voucher.reconciliationStatus = reconciliationStatus;

    const updatedVoucher = await voucher.save();

    const populatedVoucher = await ReconcileBankAccountsVoucher.findById(updatedVoucher._id)
      .populate('bankAccount', 'accountName accountNumber bankName')
      .populate('currency', 'name code symbol')
      .populate('user', 'name email')
      .select('-__v');

    res.status(200).json({
      status: 'success',
      message: 'Reconcile bank accounts voucher updated successfully',
      data: {
        voucher: populatedVoucher,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Reconcile bank accounts voucher (mark as reconciled)
// @route   PUT /api/reconcile-bank-accounts-vouchers/:id/reconcile
// @access  Private
const reconcileBankAccountsVoucher = async (req, res) => {
  try {
    const voucher = await ReconcileBankAccountsVoucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Reconcile bank accounts voucher not found',
      });
    }

    if (voucher.reconciliationStatus === 'reconciled') {
      return res.status(400).json({
        status: 'fail',
        message: 'Voucher is already reconciled',
      });
    }

    // Calculate if balances match
    const adjustedBalance = (voucher.bookBalance || 0) + 
                           (voucher.outstandingDeposits || 0) - 
                           (voucher.outstandingWithdrawals || 0) - 
                           (voucher.outstandingChecks || 0) + 
                           (voucher.interestEarned || 0) - 
                           (voucher.bankCharges || 0) - 
                           (voucher.errors || 0);
    
    const difference = Math.abs((voucher.statementBalance || 0) - adjustedBalance);

    voucher.reconciliationStatus = difference < 0.01 ? 'reconciled' : 'discrepancy';
    voucher.reconciledAt = new Date();
    voucher.reconciledBy = req.user._id;
    voucher.adjustedBalance = adjustedBalance;
    voucher.difference = difference;

    // If reconciled, mark status as completed
    if (voucher.reconciliationStatus === 'reconciled') {
      voucher.status = 'completed';
    }

    const updatedVoucher = await voucher.save();

    const populatedVoucher = await ReconcileBankAccountsVoucher.findById(updatedVoucher._id)
      .populate('bankAccount', 'accountName accountNumber bankName')
      .populate('currency', 'name code symbol')
      .populate('reconciledBy', 'name email')
      .select('-__v');

    res.status(200).json({
      status: 'success',
      message: difference < 0.01 
        ? 'Bank account reconciled successfully' 
        : 'Reconciliation completed with discrepancy',
      data: {
        voucher: populatedVoucher,
        difference,
        adjustedBalance,
        statementBalance: voucher.statementBalance,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Approve reconcile bank accounts voucher
// @route   PUT /api/reconcile-bank-accounts-vouchers/:id/approve
// @access  Private
const approveReconcileBankAccountsVoucher = async (req, res) => {
  try {
    const voucher = await ReconcileBankAccountsVoucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Reconcile bank accounts voucher not found',
      });
    }

    if (voucher.status === 'completed' || voucher.status === 'cancelled') {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot approve completed or cancelled voucher',
      });
    }

    voucher.status = 'approved';
    voucher.approvalStatus = {
      approvedBy: req.user._id,
      approvedAt: new Date(),
    };

    const updatedVoucher = await voucher.save();

    const populatedVoucher = await ReconcileBankAccountsVoucher.findById(updatedVoucher._id)
      .populate('bankAccount', 'accountName accountNumber bankName')
      .populate('currency', 'name code symbol')
      .populate('user', 'name email')
      .populate('approvalStatus.approvedBy', 'name email')
      .select('-__v');

    res.status(200).json({
      status: 'success',
      message: 'Reconcile bank accounts voucher approved successfully',
      data: {
        voucher: populatedVoucher,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Reject reconcile bank accounts voucher
// @route   PUT /api/reconcile-bank-accounts-vouchers/:id/reject
// @access  Private
const rejectReconcileBankAccountsVoucher = async (req, res) => {
  try {
    const { rejectionReason } = req.body;

    const voucher = await ReconcileBankAccountsVoucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Reconcile bank accounts voucher not found',
      });
    }

    if (voucher.status === 'completed' || voucher.status === 'cancelled') {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot reject completed or cancelled voucher',
      });
    }

    voucher.status = 'rejected';
    voucher.approvalStatus = {
      approvedBy: req.user._id,
      approvedAt: new Date(),
      rejectionReason: rejectionReason || 'No reason provided',
    };

    const updatedVoucher = await voucher.save();

    const populatedVoucher = await ReconcileBankAccountsVoucher.findById(updatedVoucher._id)
      .populate('bankAccount', 'accountName accountNumber bankName')
      .populate('currency', 'name code symbol')
      .populate('user', 'name email')
      .populate('approvalStatus.approvedBy', 'name email')
      .select('-__v');

    res.status(200).json({
      status: 'success',
      message: 'Reconcile bank accounts voucher rejected',
      data: {
        voucher: populatedVoucher,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Complete reconcile bank accounts voucher
// @route   PUT /api/reconcile-bank-accounts-vouchers/:id/complete
// @access  Private
const completeReconcileBankAccountsVoucher = async (req, res) => {
  try {
    const voucher = await ReconcileBankAccountsVoucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Reconcile bank accounts voucher not found',
      });
    }

    if (voucher.status === 'completed') {
      return res.status(400).json({
        status: 'fail',
        message: 'Voucher is already completed',
      });
    }

    if (voucher.status === 'cancelled' || voucher.status === 'rejected') {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot complete cancelled or rejected voucher',
      });
    }

    voucher.status = 'completed';

    const updatedVoucher = await voucher.save();

    const populatedVoucher = await ReconcileBankAccountsVoucher.findById(updatedVoucher._id)
      .populate('bankAccount', 'accountName accountNumber bankName')
      .populate('currency', 'name code symbol')
      .populate('user', 'name email')
      .populate('approvalStatus.approvedBy', 'name email')
      .select('-__v');

    res.status(200).json({
      status: 'success',
      message: 'Reconcile bank accounts voucher completed successfully',
      data: {
        voucher: populatedVoucher,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Cancel reconcile bank accounts voucher
// @route   PUT /api/reconcile-bank-accounts-vouchers/:id/cancel
// @access  Private
const cancelReconcileBankAccountsVoucher = async (req, res) => {
  try {
    const voucher = await ReconcileBankAccountsVoucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Reconcile bank accounts voucher not found',
      });
    }

    if (voucher.status === 'completed') {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot cancel completed voucher',
      });
    }

    if (voucher.status === 'cancelled') {
      return res.status(400).json({
        status: 'fail',
        message: 'Voucher is already cancelled',
      });
    }

    voucher.status = 'cancelled';
    voucher.reconciliationStatus = 'cancelled';

    const updatedVoucher = await voucher.save();

    const populatedVoucher = await ReconcileBankAccountsVoucher.findById(updatedVoucher._id)
      .populate('bankAccount', 'accountName accountNumber bankName')
      .populate('currency', 'name code symbol')
      .populate('user', 'name email')
      .select('-__v');

    res.status(200).json({
      status: 'success',
      message: 'Reconcile bank accounts voucher cancelled successfully',
      data: {
        voucher: populatedVoucher,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Delete reconcile bank accounts voucher
// @route   DELETE /api/reconcile-bank-accounts-vouchers/:id
// @access  Private
const deleteReconcileBankAccountsVoucher = async (req, res) => {
  try {
    const voucher = await ReconcileBankAccountsVoucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Reconcile bank accounts voucher not found',
      });
    }

    if (voucher.status === 'completed') {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot delete completed voucher',
      });
    }

    await ReconcileBankAccountsVoucher.findByIdAndDelete(req.params.id);

    res.status(200).json({
      status: 'success',
      message: 'Reconcile bank accounts voucher deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get reconcile vouchers by bank account
// @route   GET /api/reconcile-bank-accounts-vouchers/bank-account/:bankAccountId
// @access  Private
const getVouchersByBankAccount = async (req, res) => {
  try {
    const { bankAccountId } = req.params;
    const { page = 1, limit = 10, startDate, endDate, status, reconciliationStatus } = req.query;

    if (!mongoose.Types.ObjectId.isValid(bankAccountId)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid bank account ID format',
      });
    }

    const bankAccount = await BankAccount.findById(bankAccountId);
    if (!bankAccount) {
      return res.status(404).json({
        status: 'fail',
        message: 'Bank account not found',
      });
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    let query = { bankAccount: bankAccountId };

    if (status) {
      query.status = status;
    }

    if (reconciliationStatus) {
      query.reconciliationStatus = reconciliationStatus;
    }

    if (startDate && endDate) {
      query.statementDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const totalVouchers = await ReconcileBankAccountsVoucher.countDocuments(query);

    const vouchers = await ReconcileBankAccountsVoucher.find(query)
      .populate('currency', 'name code symbol')
      .populate('reconciledBy', 'name email')
      .populate('user', 'name email')
      .sort({ statementDate: -1 })
      .skip(skip)
      .limit(limitNum)
      .select('-__v');

    res.status(200).json({
      status: 'success',
      results: vouchers.length,
      totalPages: Math.ceil(totalVouchers / limitNum),
      currentPage: pageNum,
      totalVouchers,
      bankAccount: {
        _id: bankAccount._id,
        accountName: bankAccount.accountName,
        accountNumber: bankAccount.accountNumber,
        bankName: bankAccount.bankName,
      },
      data: {
        vouchers,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

module.exports = {
  getReconcileBankAccountsVouchers,
  getReconcileBankAccountsVoucherById,
  createReconcileBankAccountsVoucher,
  updateReconcileBankAccountsVoucher,
  reconcileBankAccountsVoucher,
  approveReconcileBankAccountsVoucher,
  rejectReconcileBankAccountsVoucher,
  completeReconcileBankAccountsVoucher,
  cancelReconcileBankAccountsVoucher,
  deleteReconcileBankAccountsVoucher,
  getVouchersByBankAccount,
};

