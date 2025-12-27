const mongoose = require('mongoose');
const BankAccountTransferVoucher = require('../models/bankAccountTransferVoucherModel');
const BankAccount = require('../models/bankAccountModel');
const APIFeatures = require('../utils/apiFeatures');
const cloudinary = require('cloudinary').v2;

// @desc    Get all bank account transfer vouchers with filtering and pagination
// @route   GET /api/bank-account-transfer-vouchers
// @access  Private
const getBankAccountTransferVouchers = async (req, res) => {
  try {
    const features = new APIFeatures(BankAccountTransferVoucher.find(), req.query)
      .filter()
      .sort()
      .limitFields()
      .paginate();

    const vouchers = await features.query
      .populate('fromBankAccount', 'accountName accountNumber bankName')
      .populate('toBankAccount', 'accountName accountNumber bankName')
      .populate('currency', 'name code symbol')
      .populate('user', 'name email')
      .populate('approvalStatus.approvedBy', 'name')
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
    
    const totalVouchers = await BankAccountTransferVoucher.countDocuments(filterQuery);

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

// @desc    Get bank account transfer voucher by ID
// @route   GET /api/bank-account-transfer-vouchers/:id
// @access  Private
const getBankAccountTransferVoucherById = async (req, res) => {
  try {
    const voucher = await BankAccountTransferVoucher.findById(req.params.id)
      .populate('fromBankAccount', 'accountName accountNumber bankName branchName branchCode balance')
      .populate('toBankAccount', 'accountName accountNumber bankName branchName branchCode balance')
      .populate('currency', 'name code symbol')
      .populate('user', 'name email')
      .populate('approvalStatus.approvedBy', 'name email')
      .populate('relatedPurchase', 'invoiceNumber totalAmount')
      .populate('relatedSale', 'invoiceNumber grandTotal')
      .populate('relatedPayment', 'paymentNumber amount')
      .populate('relatedSupplierPayment', 'paymentNumber amount')
      .populate('relatedBankPaymentVoucher', 'voucherNumber amount')
      .select('-__v');

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Bank account transfer voucher not found',
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

// @desc    Create new bank account transfer voucher
// @route   POST /api/bank-account-transfer-vouchers
// @access  Private
const createBankAccountTransferVoucher = async (req, res) => {
  try {
    const {
      voucherDate,
      fromBankAccount,
      toBankAccount,
      amount,
      currency,
      currencyExchangeRate,
      transferMethod,
      transferFee,
      referenceNumber,
      transactionId,
      fromBankTransactionId,
      toBankTransactionId,
      purpose,
      description,
      notes,
      status,
      relatedPurchase,
      relatedSale,
      relatedPayment,
      relatedSupplierPayment,
      relatedBankPaymentVoucher,
      attachments,
    } = req.body;
    
    console.log('req.file:', req.file);
    console.log('attachments from req.body:', attachments);
    console.log('attachments type:', typeof attachments);
    
    // Validate from bank account exists
    const fromBankAccountExists = await BankAccount.findById(fromBankAccount);
    if (!fromBankAccountExists) {
      return res.status(404).json({
        status: 'fail',
        message: 'Source bank account not found',
      });
    }

    // Validate to bank account exists
    const toBankAccountExists = await BankAccount.findById(toBankAccount);
    if (!toBankAccountExists) {
      return res.status(404).json({
        status: 'fail',
        message: 'Destination bank account not found',
      });
    }

    // Validate that from and to accounts are different
    if (fromBankAccount.toString() === toBankAccount.toString()) {
      return res.status(400).json({
        status: 'fail',
        message: 'Source and destination bank accounts cannot be the same',
      });
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
            { folder: 'bank-account-transfer-vouchers' },
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
        
        console.log('File uploaded to Cloudinary, attachment added:', uploadedAttachments[0]);
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
      
      console.log('Final attachments to save:', uploadedAttachments);
    }

    if (!req.user || !req.user._id) {
      return res.status(401).json({
        status: 'fail',
        message: 'User not authenticated',
      });
    }

    // Create voucher
    const voucherData = {
      fromBankAccount,
      toBankAccount,
      amount: typeof amount === 'string' ? parseFloat(amount) : amount,
      currency,
      currencyExchangeRate: currencyExchangeRate ? (typeof currencyExchangeRate === 'string' ? parseFloat(currencyExchangeRate) : currencyExchangeRate) : 1,
      transferMethod: transferMethod || 'online_transfer',
      transferFee: typeof transferFee === 'string' ? parseFloat(transferFee) : (transferFee || 0),
      referenceNumber,
      transactionId,
      fromBankTransactionId,
      toBankTransactionId,
      purpose,
      description,
      notes,
      status: status || 'draft',
      relatedPurchase,
      relatedSale,
      relatedPayment,
      relatedSupplierPayment,
      relatedBankPaymentVoucher,
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

    // Calculate total amount
    voucherData.totalAmount = voucherData.amount + (voucherData.transferFee || 0);

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

    console.log('Final voucherData.attachments before save:', voucherData.attachments);
    console.log('Full voucherData before save:', JSON.stringify(voucherData, null, 2));

    const voucher = await BankAccountTransferVoucher.create(voucherData);

    const populatedVoucher = await BankAccountTransferVoucher.findById(voucher._id)
      .populate('fromBankAccount', 'accountName accountNumber bankName')
      .populate('toBankAccount', 'accountName accountNumber bankName')
      .populate('currency', 'name code symbol')
      .populate('user', 'name email')
      .select('-__v');

    res.status(201).json({
      status: 'success',
      message: 'Bank account transfer voucher created successfully',
      data: {
        voucher: populatedVoucher,
      },
    });
  } catch (error) {
    console.error('Error creating bank account transfer voucher:', error);
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

// @desc    Update bank account transfer voucher
// @route   PUT /api/bank-account-transfer-vouchers/:id
// @access  Private
const updateBankAccountTransferVoucher = async (req, res) => {
  try {
    const voucher = await BankAccountTransferVoucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Bank account transfer voucher not found',
      });
    }

    // Prevent updates if status is completed or cancelled
    if (voucher.status === 'completed' || voucher.status === 'cancelled') {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot update completed or cancelled voucher',
      });
    }

    const {
      voucherDate,
      fromBankAccount,
      toBankAccount,
      amount,
      currency,
      currencyExchangeRate,
      transferMethod,
      transferFee,
      referenceNumber,
      transactionId,
      fromBankTransactionId,
      toBankTransactionId,
      purpose,
      description,
      notes,
      status,
      relatedPurchase,
      relatedSale,
      relatedPayment,
      relatedSupplierPayment,
      relatedBankPaymentVoucher,
      attachments,
    } = req.body;

    console.log('Update - req.file:', req.file);
    console.log('Update - attachments from req.body:', attachments);

    // Validate bank accounts if provided
    if (fromBankAccount !== undefined) {
      const fromBankAccountExists = await BankAccount.findById(fromBankAccount);
      if (!fromBankAccountExists) {
        return res.status(404).json({
          status: 'fail',
          message: 'Source bank account not found',
        });
      }
      voucher.fromBankAccount = fromBankAccount;
    }

    if (toBankAccount !== undefined) {
      const toBankAccountExists = await BankAccount.findById(toBankAccount);
      if (!toBankAccountExists) {
        return res.status(404).json({
          status: 'fail',
          message: 'Destination bank account not found',
        });
      }
      voucher.toBankAccount = toBankAccount;
    }

    // Validate that from and to accounts are different
    if (voucher.fromBankAccount && voucher.toBankAccount) {
      if (voucher.fromBankAccount.toString() === voucher.toBankAccount.toString()) {
        return res.status(400).json({
          status: 'fail',
          message: 'Source and destination bank accounts cannot be the same',
        });
      }
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
                await cloudinary.uploader.destroy(`bank-account-transfer-vouchers/${publicId}`);
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
              { folder: 'bank-account-transfer-vouchers' },
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
    if (amount !== undefined) {
      voucher.amount = typeof amount === 'string' ? parseFloat(amount) : amount;
      // Recalculate total amount
      voucher.totalAmount = voucher.amount + (voucher.transferFee || 0);
    }
    if (currency !== undefined) voucher.currency = currency;
    if (currencyExchangeRate !== undefined) voucher.currencyExchangeRate = typeof currencyExchangeRate === 'string' ? parseFloat(currencyExchangeRate) : currencyExchangeRate;
    if (transferMethod !== undefined) voucher.transferMethod = transferMethod;
    if (transferFee !== undefined) {
      voucher.transferFee = typeof transferFee === 'string' ? parseFloat(transferFee) : transferFee;
      // Recalculate total amount
      voucher.totalAmount = (voucher.amount || 0) + (voucher.transferFee || 0);
    }
    if (referenceNumber !== undefined) voucher.referenceNumber = referenceNumber;
    if (transactionId !== undefined) voucher.transactionId = transactionId;
    if (fromBankTransactionId !== undefined) voucher.fromBankTransactionId = fromBankTransactionId;
    if (toBankTransactionId !== undefined) voucher.toBankTransactionId = toBankTransactionId;
    if (purpose !== undefined) voucher.purpose = purpose;
    if (description !== undefined) voucher.description = description;
    if (notes !== undefined) voucher.notes = notes;
    if (status !== undefined) voucher.status = status;
    if (relatedPurchase !== undefined) voucher.relatedPurchase = relatedPurchase;
    if (relatedSale !== undefined) voucher.relatedSale = relatedSale;
    if (relatedPayment !== undefined) voucher.relatedPayment = relatedPayment;
    if (relatedSupplierPayment !== undefined) voucher.relatedSupplierPayment = relatedSupplierPayment;
    if (relatedBankPaymentVoucher !== undefined) voucher.relatedBankPaymentVoucher = relatedBankPaymentVoucher;

    const updatedVoucher = await voucher.save();

    const populatedVoucher = await BankAccountTransferVoucher.findById(updatedVoucher._id)
      .populate('fromBankAccount', 'accountName accountNumber bankName')
      .populate('toBankAccount', 'accountName accountNumber bankName')
      .populate('currency', 'name code symbol')
      .populate('user', 'name email')
      .select('-__v');

    res.status(200).json({
      status: 'success',
      message: 'Bank account transfer voucher updated successfully',
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

// @desc    Initiate bank account transfer
// @route   PUT /api/bank-account-transfer-vouchers/:id/initiate
// @access  Private
const initiateBankAccountTransfer = async (req, res) => {
  try {
    const voucher = await BankAccountTransferVoucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Bank account transfer voucher not found',
      });
    }

    if (voucher.status === 'completed' || voucher.status === 'cancelled' || voucher.status === 'failed') {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot initiate completed, cancelled, or failed transfer',
      });
    }

    voucher.status = 'initiated';
    voucher.initiatedAt = new Date();

    const updatedVoucher = await voucher.save();

    const populatedVoucher = await BankAccountTransferVoucher.findById(updatedVoucher._id)
      .populate('fromBankAccount', 'accountName accountNumber bankName')
      .populate('toBankAccount', 'accountName accountNumber bankName')
      .populate('currency', 'name code symbol')
      .populate('user', 'name email')
      .select('-__v');

    res.status(200).json({
      status: 'success',
      message: 'Bank account transfer initiated successfully',
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

// @desc    Complete bank account transfer
// @route   PUT /api/bank-account-transfer-vouchers/:id/complete
// @access  Private
const completeBankAccountTransfer = async (req, res) => {
  try {
    const { fromBankTransactionId, toBankTransactionId } = req.body;

    const voucher = await BankAccountTransferVoucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Bank account transfer voucher not found',
      });
    }

    if (voucher.status === 'completed') {
      return res.status(400).json({
        status: 'fail',
        message: 'Transfer is already completed',
      });
    }

    if (voucher.status === 'cancelled') {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot complete cancelled transfer',
      });
    }

    voucher.status = 'completed';
    voucher.completedAt = new Date();
    if (fromBankTransactionId) voucher.fromBankTransactionId = fromBankTransactionId;
    if (toBankTransactionId) voucher.toBankTransactionId = toBankTransactionId;

    const updatedVoucher = await voucher.save();

    const populatedVoucher = await BankAccountTransferVoucher.findById(updatedVoucher._id)
      .populate('fromBankAccount', 'accountName accountNumber bankName')
      .populate('toBankAccount', 'accountName accountNumber bankName')
      .populate('currency', 'name code symbol')
      .populate('user', 'name email')
      .select('-__v');

    res.status(200).json({
      status: 'success',
      message: 'Bank account transfer completed successfully',
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

// @desc    Mark transfer as failed
// @route   PUT /api/bank-account-transfer-vouchers/:id/fail
// @access  Private
const failBankAccountTransfer = async (req, res) => {
  try {
    const { reason } = req.body;

    const voucher = await BankAccountTransferVoucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Bank account transfer voucher not found',
      });
    }

    if (voucher.status === 'completed' || voucher.status === 'cancelled') {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot mark completed or cancelled transfer as failed',
      });
    }

    voucher.status = 'failed';
    voucher.failureDetails = {
      reason: reason || 'Transfer failed',
      failedAt: new Date(),
      retryAttempts: (voucher.failureDetails?.retryAttempts || 0) + 1,
    };

    const updatedVoucher = await voucher.save();

    const populatedVoucher = await BankAccountTransferVoucher.findById(updatedVoucher._id)
      .populate('fromBankAccount', 'accountName accountNumber bankName')
      .populate('toBankAccount', 'accountName accountNumber bankName')
      .populate('currency', 'name code symbol')
      .populate('user', 'name email')
      .select('-__v');

    res.status(200).json({
      status: 'success',
      message: 'Bank account transfer marked as failed',
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

// @desc    Approve bank account transfer voucher
// @route   PUT /api/bank-account-transfer-vouchers/:id/approve
// @access  Private
const approveBankAccountTransferVoucher = async (req, res) => {
  try {
    const voucher = await BankAccountTransferVoucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Bank account transfer voucher not found',
      });
    }

    if (voucher.status === 'completed' || voucher.status === 'cancelled') {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot approve completed or cancelled voucher',
      });
    }

    voucher.status = 'pending';
    voucher.approvalStatus = {
      approvedBy: req.user._id,
      approvedAt: new Date(),
    };

    const updatedVoucher = await voucher.save();

    const populatedVoucher = await BankAccountTransferVoucher.findById(updatedVoucher._id)
      .populate('fromBankAccount', 'accountName accountNumber bankName')
      .populate('toBankAccount', 'accountName accountNumber bankName')
      .populate('currency', 'name code symbol')
      .populate('user', 'name email')
      .populate('approvalStatus.approvedBy', 'name email')
      .select('-__v');

    res.status(200).json({
      status: 'success',
      message: 'Bank account transfer voucher approved successfully',
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

// @desc    Reject bank account transfer voucher
// @route   PUT /api/bank-account-transfer-vouchers/:id/reject
// @access  Private
const rejectBankAccountTransferVoucher = async (req, res) => {
  try {
    const { rejectionReason } = req.body;

    const voucher = await BankAccountTransferVoucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Bank account transfer voucher not found',
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

    const populatedVoucher = await BankAccountTransferVoucher.findById(updatedVoucher._id)
      .populate('fromBankAccount', 'accountName accountNumber bankName')
      .populate('toBankAccount', 'accountName accountNumber bankName')
      .populate('currency', 'name code symbol')
      .populate('user', 'name email')
      .populate('approvalStatus.approvedBy', 'name email')
      .select('-__v');

    res.status(200).json({
      status: 'success',
      message: 'Bank account transfer voucher rejected',
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

// @desc    Cancel bank account transfer voucher
// @route   PUT /api/bank-account-transfer-vouchers/:id/cancel
// @access  Private
const cancelBankAccountTransferVoucher = async (req, res) => {
  try {
    const voucher = await BankAccountTransferVoucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Bank account transfer voucher not found',
      });
    }

    if (voucher.status === 'completed') {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot cancel completed transfer',
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

    const populatedVoucher = await BankAccountTransferVoucher.findById(updatedVoucher._id)
      .populate('fromBankAccount', 'accountName accountNumber bankName')
      .populate('toBankAccount', 'accountName accountNumber bankName')
      .populate('currency', 'name code symbol')
      .populate('user', 'name email')
      .select('-__v');

    res.status(200).json({
      status: 'success',
      message: 'Bank account transfer voucher cancelled successfully',
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

// @desc    Delete bank account transfer voucher
// @route   DELETE /api/bank-account-transfer-vouchers/:id
// @access  Private
const deleteBankAccountTransferVoucher = async (req, res) => {
  try {
    const voucher = await BankAccountTransferVoucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Bank account transfer voucher not found',
      });
    }

    if (voucher.status === 'completed') {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot delete completed transfer',
      });
    }

    await BankAccountTransferVoucher.findByIdAndDelete(req.params.id);

    res.status(200).json({
      status: 'success',
      message: 'Bank account transfer voucher deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get transfer vouchers by bank account (from or to)
// @route   GET /api/bank-account-transfer-vouchers/bank-account/:bankAccountId
// @access  Private
const getVouchersByBankAccount = async (req, res) => {
  try {
    const { bankAccountId } = req.params;
    const { page = 1, limit = 10, startDate, endDate, status, type } = req.query;

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

    let query = {};
    
    // Filter by type: 'from', 'to', or 'all'
    if (type === 'from') {
      query.fromBankAccount = bankAccountId;
    } else if (type === 'to') {
      query.toBankAccount = bankAccountId;
    } else {
      // Default: show both from and to
      query.$or = [
        { fromBankAccount: bankAccountId },
        { toBankAccount: bankAccountId }
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

    const totalVouchers = await BankAccountTransferVoucher.countDocuments(query);

    const vouchers = await BankAccountTransferVoucher.find(query)
      .populate('fromBankAccount', 'accountName accountNumber bankName')
      .populate('toBankAccount', 'accountName accountNumber bankName')
      .populate('currency', 'name code symbol')
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
      bankAccount: {
        _id: bankAccount._id,
        accountName: bankAccount.accountName,
        accountNumber: bankAccount.accountNumber,
        bankName: bankAccount.bankName,
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
  getBankAccountTransferVouchers,
  getBankAccountTransferVoucherById,
  createBankAccountTransferVoucher,
  updateBankAccountTransferVoucher,
  initiateBankAccountTransfer,
  completeBankAccountTransfer,
  failBankAccountTransfer,
  approveBankAccountTransferVoucher,
  rejectBankAccountTransferVoucher,
  cancelBankAccountTransferVoucher,
  deleteBankAccountTransferVoucher,
  getVouchersByBankAccount,
};

