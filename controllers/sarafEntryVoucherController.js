const mongoose = require('mongoose');
const SarafEntryVoucher = require('../models/sarafEntryVoucherModel');
const Currency = require('../models/currencyModel');
const BankAccount = require('../models/bankAccountModel');
const APIFeatures = require('../utils/apiFeatures');
const cloudinary = require('cloudinary').v2;

// @desc    Get all saraf entry vouchers with filtering and pagination
// @route   GET /api/saraf-entry-vouchers
// @access  Private
const getSarafEntryVouchers = async (req, res) => {
  try {
    const features = new APIFeatures(SarafEntryVoucher.find(), req.query)
      .filter()
      .sort()
      .limitFields()
      .paginate();

    const vouchers = await features.query
      .populate('fromCurrency', 'name code symbol')
      .populate('toCurrency', 'name code symbol')
      .populate('fromBankAccount', 'accountName accountNumber bankName')
      .populate('toBankAccount', 'accountName accountNumber bankName')
      .populate('user', 'name email')
      .populate('approvalStatus.approvedBy', 'name')
      .populate('completedBy', 'name email')
      .populate('relatedPurchase', 'invoiceNumber')
      .populate('relatedSale', 'invoiceNumber')
      .sort({ voucherDate: -1 })
      .select('-__v');

    // Build filter query for count
    const queryObj = { ...req.query };
    const excludedFields = ['page', 'sort', 'limit', 'fields'];
    excludedFields.forEach(el => delete queryObj[el]);
    let queryStr = JSON.stringify(queryObj);
    queryStr = queryStr.replace(/\b(gte|gt|lte|lt)\b/g, match => `$${match}`);
    const filterQuery = queryStr ? JSON.parse(queryStr) : {};
    
    const totalVouchers = await SarafEntryVoucher.countDocuments(filterQuery);

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

// @desc    Get saraf entry voucher by ID
// @route   GET /api/saraf-entry-vouchers/:id
// @access  Private
const getSarafEntryVoucherById = async (req, res) => {
  try {
    const voucher = await SarafEntryVoucher.findById(req.params.id)
      .populate('fromCurrency', 'name code symbol')
      .populate('toCurrency', 'name code symbol')
      .populate('fromBankAccount', 'accountName accountNumber bankName')
      .populate('toBankAccount', 'accountName accountNumber bankName')
      .populate('fromCashAccount')
      .populate('toCashAccount')
      .populate('user', 'name email')
      .populate('approvalStatus.approvedBy', 'name email')
      .populate('completedBy', 'name email')
      .populate('relatedPurchase', 'invoiceNumber totalAmount')
      .populate('relatedSale', 'invoiceNumber grandTotal')
      .populate('relatedPayment', 'paymentNumber amount')
      .populate('relatedSupplierPayment', 'paymentNumber amount')
      .populate('relatedBankPaymentVoucher', 'voucherNumber amount')
      .populate('relatedCashPaymentVoucher', 'voucherNumber amount')
      .select('-__v');

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Saraf entry voucher not found',
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

// @desc    Create new saraf entry voucher
// @route   POST /api/saraf-entry-vouchers
// @access  Private
const createSarafEntryVoucher = async (req, res) => {
  try {
    const {
      voucherDate,
      exchangeType,
      fromCurrency,
      fromAmount,
      toCurrency,
      toAmount,
      exchangeRate,
      marketRate,
      commission,
      commissionPercentage,
      fromBankAccount,
      toBankAccount,
      fromCashAccount,
      toCashAccount,
      referenceNumber,
      transactionId,
      bankTransactionId,
      sarafName,
      sarafContact,
      purpose,
      description,
      notes,
      status,
      relatedPurchase,
      relatedSale,
      relatedPayment,
      relatedSupplierPayment,
      relatedBankPaymentVoucher,
      relatedCashPaymentVoucher,
      attachments,
    } = req.body;
    
    console.log('req.file:', req.file);
    console.log('attachments from req.body:', attachments);
    
    // Validate currencies exist
    const fromCurrencyExists = await Currency.findById(fromCurrency);
    if (!fromCurrencyExists) {
      return res.status(404).json({
        status: 'fail',
        message: 'Source currency not found',
      });
    }

    const toCurrencyExists = await Currency.findById(toCurrency);
    if (!toCurrencyExists) {
      return res.status(404).json({
        status: 'fail',
        message: 'Destination currency not found',
      });
    }

    // Validate that from and to currencies are different
    if (fromCurrency.toString() === toCurrency.toString()) {
      return res.status(400).json({
        status: 'fail',
        message: 'Source and destination currencies cannot be the same',
      });
    }

    // Validate bank accounts if provided
    if (fromBankAccount) {
      const fromBankAccountExists = await BankAccount.findById(fromBankAccount);
      if (!fromBankAccountExists) {
        return res.status(404).json({
          status: 'fail',
          message: 'Source bank account not found',
        });
      }
    }

    if (toBankAccount) {
      const toBankAccountExists = await BankAccount.findById(toBankAccount);
      if (!toBankAccountExists) {
        return res.status(404).json({
          status: 'fail',
          message: 'Destination bank account not found',
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
            { folder: 'saraf-entry-vouchers' },
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

    // Create voucher
    const voucherData = {
      exchangeType: exchangeType || 'exchange',
      fromCurrency,
      fromAmount: typeof fromAmount === 'string' ? parseFloat(fromAmount) : fromAmount,
      toCurrency,
      toAmount: typeof toAmount === 'string' ? parseFloat(toAmount) : toAmount,
      exchangeRate: typeof exchangeRate === 'string' ? parseFloat(exchangeRate) : exchangeRate,
      marketRate: marketRate ? (typeof marketRate === 'string' ? parseFloat(marketRate) : marketRate) : undefined,
      commission: commission ? (typeof commission === 'string' ? parseFloat(commission) : commission) : 0,
      commissionPercentage: commissionPercentage ? (typeof commissionPercentage === 'string' ? parseFloat(commissionPercentage) : commissionPercentage) : 0,
      fromBankAccount,
      toBankAccount,
      fromCashAccount,
      toCashAccount,
      referenceNumber,
      transactionId,
      bankTransactionId,
      sarafName,
      sarafContact,
      purpose,
      description,
      notes,
      status: status || 'draft',
      relatedPurchase,
      relatedSale,
      relatedPayment,
      relatedSupplierPayment,
      relatedBankPaymentVoucher,
      relatedCashPaymentVoucher,
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

    const voucher = await SarafEntryVoucher.create(voucherData);

    const populatedVoucher = await SarafEntryVoucher.findById(voucher._id)
      .populate('fromCurrency', 'name code symbol')
      .populate('toCurrency', 'name code symbol')
      .populate('fromBankAccount', 'accountName accountNumber bankName')
      .populate('toBankAccount', 'accountName accountNumber bankName')
      .populate('user', 'name email')
      .select('-__v');

    res.status(201).json({
      status: 'success',
      message: 'Saraf entry voucher created successfully',
      data: {
        voucher: populatedVoucher,
      },
    });
  } catch (error) {
    console.error('Error creating saraf entry voucher:', error);
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

// @desc    Update saraf entry voucher
// @route   PUT /api/saraf-entry-vouchers/:id
// @access  Private
const updateSarafEntryVoucher = async (req, res) => {
  try {
    const voucher = await SarafEntryVoucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Saraf entry voucher not found',
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
      exchangeType,
      fromCurrency,
      fromAmount,
      toCurrency,
      toAmount,
      exchangeRate,
      marketRate,
      commission,
      commissionPercentage,
      fromBankAccount,
      toBankAccount,
      fromCashAccount,
      toCashAccount,
      referenceNumber,
      transactionId,
      bankTransactionId,
      sarafName,
      sarafContact,
      purpose,
      description,
      notes,
      status,
      relatedPurchase,
      relatedSale,
      relatedPayment,
      relatedSupplierPayment,
      relatedBankPaymentVoucher,
      relatedCashPaymentVoucher,
      attachments,
    } = req.body;

    // Validate currencies if provided
    if (fromCurrency !== undefined) {
      const fromCurrencyExists = await Currency.findById(fromCurrency);
      if (!fromCurrencyExists) {
        return res.status(404).json({
          status: 'fail',
          message: 'Source currency not found',
        });
      }
      voucher.fromCurrency = fromCurrency;
    }

    if (toCurrency !== undefined) {
      const toCurrencyExists = await Currency.findById(toCurrency);
      if (!toCurrencyExists) {
        return res.status(404).json({
          status: 'fail',
          message: 'Destination currency not found',
        });
      }
      voucher.toCurrency = toCurrency;
    }

    // Validate that from and to currencies are different
    if (voucher.fromCurrency && voucher.toCurrency) {
      if (voucher.fromCurrency.toString() === voucher.toCurrency.toString()) {
        return res.status(400).json({
          status: 'fail',
          message: 'Source and destination currencies cannot be the same',
        });
      }
    }

    // Validate bank accounts if provided
    if (fromBankAccount !== undefined) {
      if (fromBankAccount) {
        const fromBankAccountExists = await BankAccount.findById(fromBankAccount);
        if (!fromBankAccountExists) {
          return res.status(404).json({
            status: 'fail',
            message: 'Source bank account not found',
          });
        }
      }
      voucher.fromBankAccount = fromBankAccount;
    }

    if (toBankAccount !== undefined) {
      if (toBankAccount) {
        const toBankAccountExists = await BankAccount.findById(toBankAccount);
        if (!toBankAccountExists) {
          return res.status(404).json({
            status: 'fail',
            message: 'Destination bank account not found',
          });
        }
      }
      voucher.toBankAccount = toBankAccount;
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
                await cloudinary.uploader.destroy(`saraf-entry-vouchers/${publicId}`);
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
              { folder: 'saraf-entry-vouchers' },
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
    if (exchangeType !== undefined) voucher.exchangeType = exchangeType;
    if (fromAmount !== undefined) voucher.fromAmount = typeof fromAmount === 'string' ? parseFloat(fromAmount) : fromAmount;
    if (toAmount !== undefined) voucher.toAmount = typeof toAmount === 'string' ? parseFloat(toAmount) : toAmount;
    if (exchangeRate !== undefined) voucher.exchangeRate = typeof exchangeRate === 'string' ? parseFloat(exchangeRate) : exchangeRate;
    if (marketRate !== undefined) voucher.marketRate = marketRate ? (typeof marketRate === 'string' ? parseFloat(marketRate) : marketRate) : undefined;
    if (commission !== undefined) voucher.commission = commission ? (typeof commission === 'string' ? parseFloat(commission) : commission) : 0;
    if (commissionPercentage !== undefined) voucher.commissionPercentage = commissionPercentage ? (typeof commissionPercentage === 'string' ? parseFloat(commissionPercentage) : commissionPercentage) : 0;
    if (fromCashAccount !== undefined) voucher.fromCashAccount = fromCashAccount;
    if (toCashAccount !== undefined) voucher.toCashAccount = toCashAccount;
    if (referenceNumber !== undefined) voucher.referenceNumber = referenceNumber;
    if (transactionId !== undefined) voucher.transactionId = transactionId;
    if (bankTransactionId !== undefined) voucher.bankTransactionId = bankTransactionId;
    if (sarafName !== undefined) voucher.sarafName = sarafName;
    if (sarafContact !== undefined) voucher.sarafContact = sarafContact;
    if (purpose !== undefined) voucher.purpose = purpose;
    if (description !== undefined) voucher.description = description;
    if (notes !== undefined) voucher.notes = notes;
    if (status !== undefined) voucher.status = status;
    if (relatedPurchase !== undefined) voucher.relatedPurchase = relatedPurchase;
    if (relatedSale !== undefined) voucher.relatedSale = relatedSale;
    if (relatedPayment !== undefined) voucher.relatedPayment = relatedPayment;
    if (relatedSupplierPayment !== undefined) voucher.relatedSupplierPayment = relatedSupplierPayment;
    if (relatedBankPaymentVoucher !== undefined) voucher.relatedBankPaymentVoucher = relatedBankPaymentVoucher;
    if (relatedCashPaymentVoucher !== undefined) voucher.relatedCashPaymentVoucher = relatedCashPaymentVoucher;

    const updatedVoucher = await voucher.save();

    const populatedVoucher = await SarafEntryVoucher.findById(updatedVoucher._id)
      .populate('fromCurrency', 'name code symbol')
      .populate('toCurrency', 'name code symbol')
      .populate('fromBankAccount', 'accountName accountNumber bankName')
      .populate('toBankAccount', 'accountName accountNumber bankName')
      .populate('user', 'name email')
      .select('-__v');

    res.status(200).json({
      status: 'success',
      message: 'Saraf entry voucher updated successfully',
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

// @desc    Approve saraf entry voucher
// @route   PUT /api/saraf-entry-vouchers/:id/approve
// @access  Private
const approveSarafEntryVoucher = async (req, res) => {
  try {
    const voucher = await SarafEntryVoucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Saraf entry voucher not found',
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

    const populatedVoucher = await SarafEntryVoucher.findById(updatedVoucher._id)
      .populate('fromCurrency', 'name code symbol')
      .populate('toCurrency', 'name code symbol')
      .populate('fromBankAccount', 'accountName accountNumber bankName')
      .populate('toBankAccount', 'accountName accountNumber bankName')
      .populate('user', 'name email')
      .populate('approvalStatus.approvedBy', 'name email')
      .select('-__v');

    res.status(200).json({
      status: 'success',
      message: 'Saraf entry voucher approved successfully',
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

// @desc    Reject saraf entry voucher
// @route   PUT /api/saraf-entry-vouchers/:id/reject
// @access  Private
const rejectSarafEntryVoucher = async (req, res) => {
  try {
    const { rejectionReason } = req.body;

    const voucher = await SarafEntryVoucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Saraf entry voucher not found',
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

    const populatedVoucher = await SarafEntryVoucher.findById(updatedVoucher._id)
      .populate('fromCurrency', 'name code symbol')
      .populate('toCurrency', 'name code symbol')
      .populate('fromBankAccount', 'accountName accountNumber bankName')
      .populate('toBankAccount', 'accountName accountNumber bankName')
      .populate('user', 'name email')
      .populate('approvalStatus.approvedBy', 'name email')
      .select('-__v');

    res.status(200).json({
      status: 'success',
      message: 'Saraf entry voucher rejected',
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

// @desc    Complete saraf entry voucher
// @route   PUT /api/saraf-entry-vouchers/:id/complete
// @access  Private
const completeSarafEntryVoucher = async (req, res) => {
  try {
    const voucher = await SarafEntryVoucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Saraf entry voucher not found',
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
    voucher.completedAt = new Date();
    voucher.completedBy = req.user._id;

    const updatedVoucher = await voucher.save();

    const populatedVoucher = await SarafEntryVoucher.findById(updatedVoucher._id)
      .populate('fromCurrency', 'name code symbol')
      .populate('toCurrency', 'name code symbol')
      .populate('fromBankAccount', 'accountName accountNumber bankName')
      .populate('toBankAccount', 'accountName accountNumber bankName')
      .populate('user', 'name email')
      .populate('completedBy', 'name email')
      .select('-__v');

    res.status(200).json({
      status: 'success',
      message: 'Saraf entry voucher completed successfully',
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

// @desc    Cancel saraf entry voucher
// @route   PUT /api/saraf-entry-vouchers/:id/cancel
// @access  Private
const cancelSarafEntryVoucher = async (req, res) => {
  try {
    const voucher = await SarafEntryVoucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Saraf entry voucher not found',
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

    const updatedVoucher = await voucher.save();

    const populatedVoucher = await SarafEntryVoucher.findById(updatedVoucher._id)
      .populate('fromCurrency', 'name code symbol')
      .populate('toCurrency', 'name code symbol')
      .populate('fromBankAccount', 'accountName accountNumber bankName')
      .populate('toBankAccount', 'accountName accountNumber bankName')
      .populate('user', 'name email')
      .select('-__v');

    res.status(200).json({
      status: 'success',
      message: 'Saraf entry voucher cancelled successfully',
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

// @desc    Delete saraf entry voucher
// @route   DELETE /api/saraf-entry-vouchers/:id
// @access  Private
const deleteSarafEntryVoucher = async (req, res) => {
  try {
    const voucher = await SarafEntryVoucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Saraf entry voucher not found',
      });
    }

    if (voucher.status === 'completed') {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot delete completed voucher',
      });
    }

    await SarafEntryVoucher.findByIdAndDelete(req.params.id);

    res.status(200).json({
      status: 'success',
      message: 'Saraf entry voucher deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get saraf entry vouchers by currency
// @route   GET /api/saraf-entry-vouchers/currency/:currencyId
// @access  Private
const getVouchersByCurrency = async (req, res) => {
  try {
    const { currencyId } = req.params;
    const { page = 1, limit = 10, startDate, endDate, status, type } = req.query;

    if (!mongoose.Types.ObjectId.isValid(currencyId)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid currency ID format',
      });
    }

    const currency = await Currency.findById(currencyId);
    if (!currency) {
      return res.status(404).json({
        status: 'fail',
        message: 'Currency not found',
      });
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    let query = {};
    
    // Filter by type: 'from', 'to', or 'all'
    if (type === 'from') {
      query.fromCurrency = currencyId;
    } else if (type === 'to') {
      query.toCurrency = currencyId;
    } else {
      // Default: show both from and to
      query.$or = [
        { fromCurrency: currencyId },
        { toCurrency: currencyId }
      ];
    }

    if (status) {
      query.status = status;
    }

    if (startDate && endDate) {
      query.voucherDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const totalVouchers = await SarafEntryVoucher.countDocuments(query);

    const vouchers = await SarafEntryVoucher.find(query)
      .populate('fromCurrency', 'name code symbol')
      .populate('toCurrency', 'name code symbol')
      .populate('fromBankAccount', 'accountName accountNumber bankName')
      .populate('toBankAccount', 'accountName accountNumber bankName')
      .populate('user', 'name email')
      .sort({ voucherDate: -1 })
      .skip(skip)
      .limit(limitNum)
      .select('-__v');

    res.status(200).json({
      status: 'success',
      results: vouchers.length,
      totalPages: Math.ceil(totalVouchers / limitNum),
      currentPage: pageNum,
      totalVouchers,
      currency: {
        _id: currency._id,
        name: currency.name,
        code: currency.code,
        symbol: currency.symbol,
      },
      filterType: type || 'all',
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
  getSarafEntryVouchers,
  getSarafEntryVoucherById,
  createSarafEntryVoucher,
  updateSarafEntryVoucher,
  approveSarafEntryVoucher,
  rejectSarafEntryVoucher,
  completeSarafEntryVoucher,
  cancelSarafEntryVoucher,
  deleteSarafEntryVoucher,
  getVouchersByCurrency,
};

