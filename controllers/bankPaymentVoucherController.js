const mongoose = require('mongoose');
const BankPaymentVoucher = require('../models/bankPaymentVoucherModel');
const BankAccount = require('../models/bankAccountModel');
const APIFeatures = require('../utils/apiFeatures');
const cloudinary = require('cloudinary').v2;

// @desc    Get all bank payment vouchers with filtering and pagination
// @route   GET /api/bank-payment-vouchers
// @access  Private
const getBankPaymentVouchers = async (req, res) => {
  try {
    const features = new APIFeatures(BankPaymentVoucher.find(), req.query)
      .filter()
      .sort()
      .limitFields()
      .paginate();

    const vouchers = await features.query
      .populate('bankAccount', 'accountName accountNumber bankName')
      .populate('currency', 'name code symbol')
      .populate('payee', 'name')
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
    
    const totalVouchers = await BankPaymentVoucher.countDocuments(filterQuery);

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

// @desc    Get bank payment voucher by ID
// @route   GET /api/bank-payment-vouchers/:id
// @access  Private
const getBankPaymentVoucherById = async (req, res) => {
  try {
    const voucher = await BankPaymentVoucher.findById(req.params.id)
      .populate('bankAccount', 'accountName accountNumber bankName branchName branchCode')
      .populate('currency', 'name code symbol')
      .populate('payee', 'name email phoneNumber address')
      .populate('user', 'name email')
      .populate('approvalStatus.approvedBy', 'name email')
      .populate('relatedPurchase', 'invoiceNumber totalAmount')
      .populate('relatedSale', 'invoiceNumber grandTotal')
      .populate('relatedPayment', 'paymentNumber amount')
      .populate('relatedSupplierPayment', 'paymentNumber amount')
      .select('-__v');

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Bank payment voucher not found',
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

// @desc    Create new bank payment voucher
// @route   POST /api/bank-payment-vouchers
// @access  Private
const createBankPaymentVoucher = async (req, res) => {
  try {
    const {
      voucherDate,
      voucherType,
      bankAccount,
      payeeType,
      payee,
      payeeName,
      amount,
      currency,
      currencyExchangeRate,
      paymentMethod,
      checkNumber,
      transactionId,
      referenceNumber,
      relatedPurchase,
      relatedSale,
      relatedPayment,
      relatedSupplierPayment,
      description,
      notes,
      status,
      attachments,
    } = req.body;

    // Validate bank account exists
    const bankAccountExists = await BankAccount.findById(bankAccount);
    if (!bankAccountExists) {
      return res.status(404).json({
        status: 'fail',
        message: 'Bank account not found',
      });
    }

    // Validate payee if provided
    if (payee && payeeType !== 'other') {
      let PayeeModel;
      if (payeeType === 'supplier') {
        PayeeModel = require('../models/supplierModel');
      } else if (payeeType === 'customer') {
        PayeeModel = require('../models/customerModel');
      } else if (payeeType === 'employee') {
        PayeeModel = require('../models/userModel'); // Assuming Employee uses User model
      }

      if (PayeeModel) {
        const payeeExists = await PayeeModel.findById(payee);
        if (!payeeExists) {
          return res.status(404).json({
            status: 'fail',
            message: `${payeeType} not found`,
          });
        }
      }
    }

    // Handle file uploads for attachments
    let uploadedAttachments = [];
    if (req.file) {
      console.log('req.file', req.file);
      // Single file uploaded - use that
      try {
        const uploadResult = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder: 'bank-payment-vouchers' },
            (error, result) => {
              if (error) return reject(error);
              resolve(result);
            }
          );
          stream.end(req.file.buffer);
        });
        
        uploadedAttachments = [{
          url: uploadResult.secure_url || '',
          name: req.file.originalname || '',
          type: req.file.mimetype || ''
        }];
      } catch (uploadError) {
        console.error('Error uploading file:', uploadError);
      }
    } else if (attachments) {
      // Handle attachments from req.body (could be array or string from multipart/form-data)
      if (Array.isArray(attachments)) {
        // Already an array - validate and use
        uploadedAttachments = attachments.filter(att => {
          return att && typeof att === 'object' && !Array.isArray(att) && att.url;
        }).map(att => ({
          url: String(att.url || ''),
          name: String(att.name || ''),
          type: String(att.type || '')
        }));
      } else if (typeof attachments === 'string') {
        // String from multipart/form-data - try to parse
        try {
          const parsed = JSON.parse(attachments);
          if (Array.isArray(parsed)) {
            uploadedAttachments = parsed.filter(att => {
              return att && typeof att === 'object' && !Array.isArray(att) && att.url;
            }).map(att => ({
              url: String(att.url || ''),
              name: String(att.name || ''),
              type: String(att.type || '')
            }));
          }
        } catch (e) {
          // Invalid JSON string - ignore
          uploadedAttachments = [];
        }
      }
    }

    // Create voucher (voucherNumber and voucherDate will be auto-generated if not provided)
    const voucherData = {
      voucherType,
      bankAccount,
      payeeType,
      payee,
      payeeName,
      amount,
      currency,
      currencyExchangeRate: currencyExchangeRate || 1,
      paymentMethod,
      checkNumber,
      transactionId,
      referenceNumber,
      relatedPurchase,
      relatedSale,
      relatedPayment,
      relatedSupplierPayment,
      description,
      notes,
      status: status || 'draft',
      attachments: uploadedAttachments,
      user: req.user._id,
    };

    // Only set voucherDate if explicitly provided, otherwise model default will handle it
    if (voucherDate) {
      voucherData.voucherDate = voucherDate;
    }

    // Only set voucherNumber if explicitly provided, otherwise model will auto-generate it
    if (req.body.voucherNumber) {
      voucherData.voucherNumber = req.body.voucherNumber;
    }

    const voucher = await BankPaymentVoucher.create(voucherData);

    // Populate before sending response
    const populatedVoucher = await BankPaymentVoucher.findById(voucher._id)
      .populate('bankAccount', 'accountName accountNumber bankName')
      .populate('currency', 'name code symbol')
      .populate('payee', 'name')
      .populate('user', 'name email')
      .select('-__v');

    res.status(201).json({
      status: 'success',
      message: 'Bank payment voucher created successfully',
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

// @desc    Update bank payment voucher
// @route   PUT /api/bank-payment-vouchers/:id
// @access  Private
const updateBankPaymentVoucher = async (req, res) => {
  try {
    const voucher = await BankPaymentVoucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Bank payment voucher not found',
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
      voucherType,
      bankAccount,
      payeeType,
      payee,
      payeeName,
      amount,
      currency,
      currencyExchangeRate,
      paymentMethod,
      checkNumber,
      transactionId,
      referenceNumber,
      relatedPurchase,
      relatedSale,
      relatedPayment,
      relatedSupplierPayment,
      description,
      notes,
      status,
      attachments,
    } = req.body;

    // Handle file uploads for attachments
    let uploadedAttachments = voucher.attachments || [];
    if (req.file) {
      // Delete old attachments from Cloudinary if replacing
      if (voucher.attachments && voucher.attachments.length > 0) {
        for (const attachment of voucher.attachments) {
          if (attachment.url) {
            try {
              const publicId = attachment.url.split('/').slice(-2).join('/').split('.')[0];
              await cloudinary.uploader.destroy(`bank-payment-vouchers/${publicId}`);
            } catch (error) {
              console.error('Error deleting old attachment:', error);
            }
          }
        }
      }

      // Upload new single file
      uploadedAttachments = [];
      try {
        const uploadResult = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder: 'bank-payment-vouchers' },
            (error, result) => {
              if (error) return reject(error);
              resolve(result);
            }
          );
          stream.end(req.file.buffer);
        });
        
        uploadedAttachments = [{
          url: uploadResult.secure_url || '',
          name: req.file.originalname || '',
          type: req.file.mimetype || ''
        }];
      } catch (uploadError) {
        console.error('Error uploading file:', uploadError);
      }
    } else if (attachments !== undefined) {
      // Handle attachments from req.body (could be array or string from multipart/form-data)
      if (Array.isArray(attachments)) {
        // Already an array - validate and use
        uploadedAttachments = attachments.filter(att => {
          return att && typeof att === 'object' && !Array.isArray(att) && att.url;
        }).map(att => ({
          url: String(att.url || ''),
          name: String(att.name || ''),
          type: String(att.type || '')
        }));
      } else if (typeof attachments === 'string') {
        // String from multipart/form-data - try to parse
        try {
          const parsed = JSON.parse(attachments);
          if (Array.isArray(parsed)) {
            uploadedAttachments = parsed.filter(att => {
              return att && typeof att === 'object' && !Array.isArray(att) && att.url;
            }).map(att => ({
              url: String(att.url || ''),
              name: String(att.name || ''),
              type: String(att.type || '')
            }));
          } else {
            // Keep existing attachments if parsed value is not an array
            uploadedAttachments = voucher.attachments || [];
          }
        } catch (e) {
          // Invalid JSON string - keep existing attachments
          uploadedAttachments = voucher.attachments || [];
        }
      } else if (attachments === null) {
        // Explicitly set to empty array if null
        uploadedAttachments = [];
      }
    }

    // Final safety check: Ensure uploadedAttachments is always an array of valid objects
    // This prevents any strings from being saved
    if (!Array.isArray(uploadedAttachments)) {
      uploadedAttachments = [];
    }
    
    // Deep clean: Remove any strings, arrays, or invalid objects
    uploadedAttachments = uploadedAttachments
      .filter(att => {
        // Only keep if it's an object (not string, not array, not null)
        if (!att || typeof att !== 'object' || Array.isArray(att)) {
          return false;
        }
        // Must have url property
        if (!att.url || typeof att.url !== 'string') {
          return false;
        }
        return true;
      })
      .map(att => ({
        url: String(att.url || ''),
        name: String(att.name || ''),
        type: String(att.type || '')
      }));

    // Update fields
    if (voucherDate !== undefined) voucher.voucherDate = voucherDate;
    if (voucherType !== undefined) voucher.voucherType = voucherType;
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
    if (payeeType !== undefined) voucher.payeeType = payeeType;
    if (payee !== undefined) voucher.payee = payee;
    if (payeeName !== undefined) voucher.payeeName = payeeName;
    if (amount !== undefined) voucher.amount = amount;
    if (currency !== undefined) voucher.currency = currency;
    if (currencyExchangeRate !== undefined) voucher.currencyExchangeRate = currencyExchangeRate;
    if (paymentMethod !== undefined) voucher.paymentMethod = paymentMethod;
    if (checkNumber !== undefined) voucher.checkNumber = checkNumber;
    if (transactionId !== undefined) voucher.transactionId = transactionId;
    if (referenceNumber !== undefined) voucher.referenceNumber = referenceNumber;
    if (relatedPurchase !== undefined) voucher.relatedPurchase = relatedPurchase;
    if (relatedSale !== undefined) voucher.relatedSale = relatedSale;
    if (relatedPayment !== undefined) voucher.relatedPayment = relatedPayment;
    if (relatedSupplierPayment !== undefined) voucher.relatedSupplierPayment = relatedSupplierPayment;
    if (description !== undefined) voucher.description = description;
    if (notes !== undefined) voucher.notes = notes;
    if (status !== undefined) voucher.status = status;
    voucher.attachments = uploadedAttachments;

    const updatedVoucher = await voucher.save();

    // Populate before sending response
    const populatedVoucher = await BankPaymentVoucher.findById(updatedVoucher._id)
      .populate('bankAccount', 'accountName accountNumber bankName')
      .populate('currency', 'name code symbol')
      .populate('payee', 'name')
      .populate('user', 'name email')
      .select('-__v');

    res.status(200).json({
      status: 'success',
      message: 'Bank payment voucher updated successfully',
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

// @desc    Approve bank payment voucher
// @route   PUT /api/bank-payment-vouchers/:id/approve
// @access  Private
const approveBankPaymentVoucher = async (req, res) => {
  try {
    const voucher = await BankPaymentVoucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Bank payment voucher not found',
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

    const populatedVoucher = await BankPaymentVoucher.findById(updatedVoucher._id)
      .populate('bankAccount', 'accountName accountNumber bankName')
      .populate('currency', 'name code symbol')
      .populate('payee', 'name')
      .populate('user', 'name email')
      .populate('approvalStatus.approvedBy', 'name email')
      .select('-__v');

    res.status(200).json({
      status: 'success',
      message: 'Bank payment voucher approved successfully',
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

// @desc    Reject bank payment voucher
// @route   PUT /api/bank-payment-vouchers/:id/reject
// @access  Private
const rejectBankPaymentVoucher = async (req, res) => {
  try {
    const { rejectionReason } = req.body;

    const voucher = await BankPaymentVoucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Bank payment voucher not found',
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

    const populatedVoucher = await BankPaymentVoucher.findById(updatedVoucher._id)
      .populate('bankAccount', 'accountName accountNumber bankName')
      .populate('currency', 'name code symbol')
      .populate('payee', 'name')
      .populate('user', 'name email')
      .populate('approvalStatus.approvedBy', 'name email')
      .select('-__v');

    res.status(200).json({
      status: 'success',
      message: 'Bank payment voucher rejected',
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

// @desc    Complete bank payment voucher
// @route   PUT /api/bank-payment-vouchers/:id/complete
// @access  Private
const completeBankPaymentVoucher = async (req, res) => {
  try {
    const voucher = await BankPaymentVoucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Bank payment voucher not found',
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

    const populatedVoucher = await BankPaymentVoucher.findById(updatedVoucher._id)
      .populate('bankAccount', 'accountName accountNumber bankName')
      .populate('currency', 'name code symbol')
      .populate('payee', 'name')
      .populate('user', 'name email')
      .populate('approvalStatus.approvedBy', 'name email')
      .select('-__v');

    res.status(200).json({
      status: 'success',
      message: 'Bank payment voucher completed successfully',
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

// @desc    Cancel bank payment voucher
// @route   PUT /api/bank-payment-vouchers/:id/cancel
// @access  Private
const cancelBankPaymentVoucher = async (req, res) => {
  try {
    const voucher = await BankPaymentVoucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Bank payment voucher not found',
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

    const populatedVoucher = await BankPaymentVoucher.findById(updatedVoucher._id)
      .populate('bankAccount', 'accountName accountNumber bankName')
      .populate('currency', 'name code symbol')
      .populate('payee', 'name')
      .populate('user', 'name email')
      .select('-__v');

    res.status(200).json({
      status: 'success',
      message: 'Bank payment voucher cancelled successfully',
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

// @desc    Delete bank payment voucher
// @route   DELETE /api/bank-payment-vouchers/:id
// @access  Private
const deleteBankPaymentVoucher = async (req, res) => {
  try {
    const voucher = await BankPaymentVoucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Bank payment voucher not found',
      });
    }

    // Prevent deletion if status is completed
    if (voucher.status === 'completed') {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot delete completed voucher',
      });
    }

    await BankPaymentVoucher.findByIdAndDelete(req.params.id);

    res.status(200).json({
      status: 'success',
      message: 'Bank payment voucher deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get bank payment vouchers by bank account
// @route   GET /api/bank-payment-vouchers/bank-account/:bankAccountId
// @access  Private
const getVouchersByBankAccount = async (req, res) => {
  try {
    const { bankAccountId } = req.params;
    const { page = 1, limit = 10, startDate, endDate, status, voucherType } = req.query;

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

    if (voucherType) {
      query.voucherType = voucherType;
    }

    if (startDate && endDate) {
      query.voucherDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const totalVouchers = await BankPaymentVoucher.countDocuments(query);

    const vouchers = await BankPaymentVoucher.find(query)
      .populate('currency', 'name code symbol')
      .populate('payee', 'name')
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
  getBankPaymentVouchers,
  getBankPaymentVoucherById,
  createBankPaymentVoucher,
  updateBankPaymentVoucher,
  approveBankPaymentVoucher,
  rejectBankPaymentVoucher,
  completeBankPaymentVoucher,
  cancelBankPaymentVoucher,
  deleteBankPaymentVoucher,
  getVouchersByBankAccount,
};

