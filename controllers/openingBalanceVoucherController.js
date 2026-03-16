const mongoose = require('mongoose');
const OpeningBalanceVoucher = require('../models/openingBalanceVoucherModel');
const APIFeatures = require('../utils/apiFeatures');
const cloudinary = require('cloudinary').v2;

// @desc    Get all opening balance vouchers with filtering and pagination
// @route   GET /api/opening-balance-vouchers
// @access  Private
const getOpeningBalanceVouchers = async (req, res) => {
  try {
    const features = new APIFeatures(OpeningBalanceVoucher.find(), req.query)
      .filter()
      .sort()
      .limitFields()
      .paginate();

    const vouchers = await features.query
      .populate('currency', 'name code symbol')
      .populate('account')
      .populate('user', 'name email')
      .populate('approvalStatus.approvedBy', 'name')
      .populate('postedBy', 'name email')
      .sort({ voucherDate: -1 })
      .select('-__v');

    // Build filter query for count
    const queryObj = { ...req.query };
    const excludedFields = ['page', 'sort', 'limit', 'fields'];
    excludedFields.forEach(el => delete queryObj[el]);
    let queryStr = JSON.stringify(queryObj);
    queryStr = queryStr.replace(/\b(gte|gt|lte|lt)\b/g, match => `$${match}`);
    const filterQuery = queryStr ? JSON.parse(queryStr) : {};
    
    const totalVouchers = await OpeningBalanceVoucher.countDocuments(filterQuery);

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

// @desc    Get opening balance voucher by ID
// @route   GET /api/opening-balance-vouchers/:id
// @access  Private
const getOpeningBalanceVoucherById = async (req, res) => {
  try {
    const voucher = await OpeningBalanceVoucher.findById(req.params.id)
      .populate('currency', 'name code symbol')
      .populate('account')
      .populate('user', 'name email')
      .populate('approvalStatus.approvedBy', 'name email')
      .populate('postedBy', 'name email')
      .select('-__v');

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Opening balance voucher not found',
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

// @desc    Create new opening balance voucher
// @route   POST /api/opening-balance-vouchers
// @access  Private
const createOpeningBalanceVoucher = async (req, res) => {
  try {
    const {
      voucherDate,
      financialYear,
      periodStartDate,
      periodEndDate,
      account,
      accountModel,
      accountName,
      voucherType,
      amount,
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
    console.log('attachments type:', typeof attachments);

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
            { folder: 'opening-balance-vouchers' },
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

    // Validate required single-account opening balance fields
    if (!account) {
      return res.status(400).json({
        status: 'fail',
        message: 'Opening balance voucher must have an account',
      });
    }

    if (!accountModel) {
      return res.status(400).json({
        status: 'fail',
        message: 'Opening balance voucher must have an accountModel',
        validAccountModels: ["BankAccount", "CashAccount", "Supplier", "Customer", "Expense", "Income", "Asset", "Liability", "Equity"],
      });
    }

    if (!voucherType || !['start', 'end'].includes(String(voucherType).toLowerCase())) {
      return res.status(400).json({
        status: 'fail',
        message: "Opening balance voucher must have a valid voucherType of 'start' or 'end'",
      });
    }

    let normalizedAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(normalizedAmount) || normalizedAmount <= 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'Opening balance voucher must have a positive amount',
      });
    }

    // Normalize accountModel
    let normalizedAccountModel = accountModel;
    if (Array.isArray(normalizedAccountModel)) {
      normalizedAccountModel = normalizedAccountModel[0];
    }
    if (typeof normalizedAccountModel === 'string') {
      normalizedAccountModel = normalizedAccountModel.trim();
      const accountModelMap = {
        bankaccount: 'BankAccount',
        cashaccount: 'CashAccount',
        supplier: 'Supplier',
        customer: 'Customer',
        expense: 'Expense',
        income: 'Income',
        asset: 'Asset',
        liability: 'Liability',
        equity: 'Equity',
      };
      normalizedAccountModel =
        accountModelMap[normalizedAccountModel.toLowerCase()] || normalizedAccountModel;
    }

    // Create voucher
    const voucherData = {
      financialYear: financialYear || new Date().getFullYear().toString(),
      periodStartDate: periodStartDate ? new Date(periodStartDate) : new Date(),
      periodEndDate: periodEndDate ? new Date(periodEndDate) : undefined,
      account,
      accountModel: normalizedAccountModel,
      accountName: accountName || '',
      voucherType: String(voucherType).toLowerCase(),
      amount: normalizedAmount,
      currency,
      currencyExchangeRate: currencyExchangeRate ? (typeof currencyExchangeRate === 'string' ? parseFloat(currencyExchangeRate) : currencyExchangeRate) : 1,
      referenceNumber,
      transactionId,
      description,
      notes,
      status: status || 'draft',
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

    const voucher = await OpeningBalanceVoucher.create(voucherData);

    const populatedVoucher = await OpeningBalanceVoucher.findById(voucher._id)
      .populate('currency', 'name code symbol')
      .populate('account')
      .populate('user', 'name email')
      .select('-__v');

    res.status(201).json({
      status: 'success',
      message: 'Opening balance voucher created successfully',
      data: {
        voucher: populatedVoucher,
      },
    });
  } catch (error) {
    console.error('Error creating opening balance voucher:', error);
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

// @desc    Update opening balance voucher
// @route   PUT /api/opening-balance-vouchers/:id
// @access  Private
const updateOpeningBalanceVoucher = async (req, res) => {
  try {
    const voucher = await OpeningBalanceVoucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Opening balance voucher not found',
      });
    }

    if (voucher.status === 'posted' || voucher.status === 'cancelled') {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot update posted or cancelled voucher',
      });
    }

    const {
      voucherDate,
      financialYear,
      periodStartDate,
      periodEndDate,
      account,
      accountModel,
      accountName,
      voucherType,
      amount,
      currency,
      currencyExchangeRate,
      referenceNumber,
      transactionId,
      description,
      notes,
      status,
      attachments,
    } = req.body;

    // Update single-account opening balance fields if provided
    if (account !== undefined) {
      voucher.account = account;
    }

    if (accountModel !== undefined) {
      let normalizedAccountModel = accountModel;
      if (Array.isArray(normalizedAccountModel)) {
        normalizedAccountModel = normalizedAccountModel[0];
      }
      if (typeof normalizedAccountModel === 'string') {
        normalizedAccountModel = normalizedAccountModel.trim();
        const accountModelMap = {
          bankaccount: 'BankAccount',
          cashaccount: 'CashAccount',
          supplier: 'Supplier',
          customer: 'Customer',
          expense: 'Expense',
          income: 'Income',
          asset: 'Asset',
          liability: 'Liability',
          equity: 'Equity',
        };
        normalizedAccountModel =
          accountModelMap[normalizedAccountModel.toLowerCase()] || normalizedAccountModel;
      }
      voucher.accountModel = normalizedAccountModel;
    }

    if (accountName !== undefined) {
      voucher.accountName = accountName;
    }

    if (voucherType !== undefined) {
      const normalizedType = String(voucherType).toLowerCase();
      if (!['start', 'end'].includes(normalizedType)) {
        return res.status(400).json({
          status: 'fail',
          message: "voucherType must be either 'start' or 'end'",
        });
      }
      voucher.voucherType = normalizedType;
    }

    if (amount !== undefined) {
      const normalizedAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
      if (isNaN(normalizedAmount) || normalizedAmount <= 0) {
        return res.status(400).json({
          status: 'fail',
          message: 'amount must be a positive number',
        });
      }
      voucher.amount = normalizedAmount;
    }

    // Handle attachments (similar to create)
    if (attachments !== undefined || req.file) {
      let uploadedAttachments = voucher.attachments || [];
      
      if (req.file) {
        if (voucher.attachments && voucher.attachments.length > 0) {
          for (const attachment of voucher.attachments) {
            if (attachment.url) {
              try {
                const publicId = attachment.url.split('/').slice(-2).join('/').split('.')[0];
                await cloudinary.uploader.destroy(`opening-balance-vouchers/${publicId}`);
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
              { folder: 'opening-balance-vouchers' },
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
            // Parse string
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
    if (financialYear !== undefined) voucher.financialYear = financialYear;
    if (periodStartDate !== undefined) voucher.periodStartDate = new Date(periodStartDate);
    if (periodEndDate !== undefined) voucher.periodEndDate = periodEndDate ? new Date(periodEndDate) : undefined;
    if (currency !== undefined) voucher.currency = currency;
    if (currencyExchangeRate !== undefined) voucher.currencyExchangeRate = typeof currencyExchangeRate === 'string' ? parseFloat(currencyExchangeRate) : currencyExchangeRate;
    if (referenceNumber !== undefined) voucher.referenceNumber = referenceNumber;
    if (transactionId !== undefined) voucher.transactionId = transactionId;
    if (description !== undefined) voucher.description = description;
    if (notes !== undefined) voucher.notes = notes;
    if (status !== undefined) voucher.status = status;

    const updatedVoucher = await voucher.save();

    const populatedVoucher = await OpeningBalanceVoucher.findById(updatedVoucher._id)
      .populate('currency', 'name code symbol')
      .populate('account')
      .populate('user', 'name email')
      .select('-__v');

    res.status(200).json({
      status: 'success',
      message: 'Opening balance voucher updated successfully',
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

// @desc    Approve opening balance voucher
// @route   PUT /api/opening-balance-vouchers/:id/approve
// @access  Private
const approveOpeningBalanceVoucher = async (req, res) => {
  try {
    const voucher = await OpeningBalanceVoucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Opening balance voucher not found',
      });
    }

    if (voucher.status === 'posted' || voucher.status === 'cancelled') {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot approve posted or cancelled voucher',
      });
    }

    voucher.status = 'approved';
    voucher.approvalStatus = {
      approvedBy: req.user._id,
      approvedAt: new Date(),
    };

    const updatedVoucher = await voucher.save();

    const populatedVoucher = await OpeningBalanceVoucher.findById(updatedVoucher._id)
      .populate('currency', 'name code symbol')
      .populate('account')
      .populate('user', 'name email')
      .populate('approvalStatus.approvedBy', 'name email')
      .select('-__v');

    res.status(200).json({
      status: 'success',
      message: 'Opening balance voucher approved successfully',
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

// @desc    Reject opening balance voucher
// @route   PUT /api/opening-balance-vouchers/:id/reject
// @access  Private
const rejectOpeningBalanceVoucher = async (req, res) => {
  try {
    const { rejectionReason } = req.body;

    const voucher = await OpeningBalanceVoucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Opening balance voucher not found',
      });
    }

    if (voucher.status === 'posted' || voucher.status === 'cancelled') {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot reject posted or cancelled voucher',
      });
    }

    voucher.status = 'rejected';
    voucher.approvalStatus = {
      approvedBy: req.user._id,
      approvedAt: new Date(),
      rejectionReason: rejectionReason || 'No reason provided',
    };

    const updatedVoucher = await voucher.save();

    const populatedVoucher = await OpeningBalanceVoucher.findById(updatedVoucher._id)
      .populate('currency', 'name code symbol')
      .populate('account')
      .populate('user', 'name email')
      .populate('approvalStatus.approvedBy', 'name email')
      .select('-__v');

    res.status(200).json({
      status: 'success',
      message: 'Opening balance voucher rejected',
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

// @desc    Post opening balance voucher
// @route   PUT /api/opening-balance-vouchers/:id/post
// @access  Private
const postOpeningBalanceVoucher = async (req, res) => {
  try {
    const voucher = await OpeningBalanceVoucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Opening balance voucher not found',
      });
    }

    if (voucher.status === 'posted') {
      return res.status(400).json({
        status: 'fail',
        message: 'Voucher is already posted',
      });
    }

    if (voucher.status === 'cancelled' || voucher.status === 'rejected') {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot post cancelled or rejected voucher',
      });
    }

    voucher.status = 'posted';
    voucher.postedAt = new Date();
    voucher.postedBy = req.user._id;

    const updatedVoucher = await voucher.save();

    const populatedVoucher = await OpeningBalanceVoucher.findById(updatedVoucher._id)
      .populate('currency', 'name code symbol')
      .populate('entries.account')
      .populate('user', 'name email')
      .populate('postedBy', 'name email')
      .select('-__v');

    res.status(200).json({
      status: 'success',
      message: 'Opening balance voucher posted successfully',
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

// @desc    Cancel opening balance voucher
// @route   PUT /api/opening-balance-vouchers/:id/cancel
// @access  Private
const cancelOpeningBalanceVoucher = async (req, res) => {
  try {
    const voucher = await OpeningBalanceVoucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Opening balance voucher not found',
      });
    }

    if (voucher.status === 'posted') {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot cancel posted voucher',
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

    const populatedVoucher = await OpeningBalanceVoucher.findById(updatedVoucher._id)
      .populate('currency', 'name code symbol')
      .populate('entries.account')
      .populate('user', 'name email')
      .select('-__v');

    res.status(200).json({
      status: 'success',
      message: 'Opening balance voucher cancelled successfully',
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

// @desc    Delete opening balance voucher
// @route   DELETE /api/opening-balance-vouchers/:id
// @access  Private
const deleteOpeningBalanceVoucher = async (req, res) => {
  try {
    const voucher = await OpeningBalanceVoucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Opening balance voucher not found',
      });
    }

    if (voucher.status === 'posted') {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot delete posted voucher',
      });
    }

    await OpeningBalanceVoucher.findByIdAndDelete(req.params.id);

    res.status(200).json({
      status: 'success',
      message: 'Opening balance voucher deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

module.exports = {
  getOpeningBalanceVouchers,
  getOpeningBalanceVoucherById,
  createOpeningBalanceVoucher,
  updateOpeningBalanceVoucher,
  approveOpeningBalanceVoucher,
  rejectOpeningBalanceVoucher,
  postOpeningBalanceVoucher,
  cancelOpeningBalanceVoucher,
  deleteOpeningBalanceVoucher,
};

