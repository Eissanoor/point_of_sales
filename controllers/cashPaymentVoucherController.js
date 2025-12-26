const mongoose = require('mongoose');
const CashPaymentVoucher = require('../models/cashPaymentVoucherModel');
const Shop = require('../models/shopModel');
const Warehouse = require('../models/warehouseModel');
const APIFeatures = require('../utils/apiFeatures');
const cloudinary = require('cloudinary').v2;

// @desc    Get all cash payment vouchers with filtering and pagination
// @route   GET /api/cash-payment-vouchers
// @access  Private
const getCashPaymentVouchers = async (req, res) => {
  try {
    const features = new APIFeatures(CashPaymentVoucher.find(), req.query)
      .filter()
      .sort()
      .limitFields()
      .paginate();

    const vouchers = await features.query
      .populate('currency', 'name code symbol')
      .populate('shop', 'name address')
      .populate('warehouse', 'name address')
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
    
    const totalVouchers = await CashPaymentVoucher.countDocuments(filterQuery);

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

// @desc    Get cash payment voucher by ID
// @route   GET /api/cash-payment-vouchers/:id
// @access  Private
const getCashPaymentVoucherById = async (req, res) => {
  try {
    const voucher = await CashPaymentVoucher.findById(req.params.id)
      .populate('currency', 'name code symbol')
      .populate('shop', 'name address phoneNumber')
      .populate('warehouse', 'name address phoneNumber')
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
        message: 'Cash payment voucher not found',
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

// @desc    Create new cash payment voucher
// @route   POST /api/cash-payment-vouchers
// @access  Private
const createCashPaymentVoucher = async (req, res) => {
  try {
    const {
      voucherDate,
      voucherType,
      cashAccount,
      cashAccountType,
      shop,
      warehouse,
      payeeType,
      payee,
      payeeName,
      amount,
      currency,
      currencyExchangeRate,
      paymentMethod,
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
    
    console.log('req.file:', req.file);
    console.log('attachments from req.body:', attachments);
    console.log('attachments type:', typeof attachments);
    
    // Validate shop if provided
    if (shop) {
      const shopExists = await Shop.findById(shop);
      if (!shopExists) {
        return res.status(404).json({
          status: 'fail',
          message: 'Shop not found',
        });
      }
    }

    // Validate warehouse if provided
    if (warehouse) {
      const warehouseExists = await Warehouse.findById(warehouse);
      if (!warehouseExists) {
        return res.status(404).json({
          status: 'fail',
          message: 'Warehouse not found',
        });
      }
    }

    // Validate payee if provided
    if (payee && payeeType !== 'other') {
      let PayeeModel;
      if (payeeType === 'supplier') {
        PayeeModel = require('../models/supplierModel');
      } else if (payeeType === 'customer') {
        PayeeModel = require('../models/customerModel');
      } else if (payeeType === 'employee') {
        PayeeModel = require('../models/userModel');
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
    
    // Helper function to parse attachments string
    const parseAttachmentsString = (attachmentsStr) => {
      if (!attachmentsStr || typeof attachmentsStr !== 'string') {
        return [];
      }
      
      try {
        let cleanString = attachmentsStr.trim();
        
        // Remove outer quotes if present
        if ((cleanString.startsWith('"') && cleanString.endsWith('"')) || 
            (cleanString.startsWith("'") && cleanString.endsWith("'"))) {
          cleanString = cleanString.slice(1, -1);
        }
        
        // Handle escaped characters - unescape the string
        cleanString = cleanString
          .replace(/\\n/g, '')
          .replace(/\\r/g, '')
          .replace(/\\t/g, '')
          .replace(/\\'/g, "'")
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\');
        
        // Try to parse as JSON
        const parsed = JSON.parse(cleanString);
        
        if (Array.isArray(parsed)) {
          return parsed;
        } else if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          // Single object, wrap in array
          return [parsed];
        }
        
        return [];
      } catch (parseError) {
        console.error('Error parsing attachments string:', parseError.message);
        console.error('Raw attachments string:', attachmentsStr);
        
        // Try alternative parsing - look for JSON-like structure
        try {
          // Try to extract JSON from the string using regex
          const jsonMatch = attachmentsStr.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return Array.isArray(parsed) ? parsed : [parsed];
          }
        } catch (e) {
          console.error('Alternative parsing also failed:', e.message);
        }
        
        return [];
      }
    };
    
    // If a file is uploaded via req.file (single file)
    if (req.file) {
      try {
        const uploadResult = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder: 'cash-payment-vouchers' },
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
        // Continue even if upload fails
      }
    }
    
    // Handle attachments from req.body (already uploaded to Cloudinary or provided as data)
    if (attachments !== undefined && attachments !== null) {
      let parsedAttachments = [];
      
      if (Array.isArray(attachments)) {
        // Already an array
        parsedAttachments = attachments;
      } else if (typeof attachments === 'string') {
        // String that needs parsing
        parsedAttachments = parseAttachmentsString(attachments);
      } else if (typeof attachments === 'object' && !Array.isArray(attachments)) {
        // Single object
        parsedAttachments = [attachments];
      }
      
      // Normalize and validate each attachment
      const normalizedAttachments = parsedAttachments
        .filter(att => {
          // Filter out invalid entries
          if (!att || Array.isArray(att)) return false;
          if (typeof att !== 'object') return false;
          // Must have at least url or name
          return att.url || att.name;
        })
        .map(att => {
          // Ensure proper structure
          return {
            url: String(att.url || ''),
            name: String(att.name || ''),
            type: String(att.type || att.mimetype || '')
          };
        });
      
      // Merge with any file uploads
      if (req.file && uploadedAttachments.length > 0) {
        // If file was uploaded, combine with existing attachments
        uploadedAttachments = [...uploadedAttachments, ...normalizedAttachments];
      } else {
        // Use parsed attachments
        uploadedAttachments = normalizedAttachments;
      }
      
      console.log('Final attachments to save:', uploadedAttachments);
    }

    // Validate user is authenticated
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        status: 'fail',
        message: 'User not authenticated',
      });
    }

    // Create voucher (voucherNumber and voucherDate will be auto-generated if not provided)
    const voucherData = {
      voucherType,
      cashAccount,
      cashAccountType: cashAccountType || 'main_cash',
      shop,
      warehouse,
      payeeType,
      payee,
      payeeName,
      amount: typeof amount === 'string' ? parseFloat(amount) : amount,
      currency,
      currencyExchangeRate: currencyExchangeRate ? (typeof currencyExchangeRate === 'string' ? parseFloat(currencyExchangeRate) : currencyExchangeRate) : 1,
      paymentMethod,
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
      // Handle different date formats (ISO string, DD/MM/YYYY, etc.)
      const parsedDate = new Date(voucherDate);
      if (!isNaN(parsedDate.getTime())) {
        voucherData.voucherDate = parsedDate;
      } else {
        console.warn('Invalid voucherDate format, using default:', voucherDate);
      }
    }

    // Only set voucherNumber if explicitly provided, otherwise model will auto-generate it
    if (req.body.voucherNumber) {
      voucherData.voucherNumber = req.body.voucherNumber;
    }

    // Final safety check: ensure attachments is always an array of proper objects
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

    const voucher = await CashPaymentVoucher.create(voucherData);

    // Populate before sending response
    const populatedVoucher = await CashPaymentVoucher.findById(voucher._id)
      .populate('currency', 'name code symbol')
      .populate('shop', 'name address')
      .populate('warehouse', 'name address')
      .populate('payee', 'name')
      .populate('user', 'name email')
      .select('-__v');

    res.status(201).json({
      status: 'success',
      message: 'Cash payment voucher created successfully',
      data: {
        voucher: populatedVoucher,
      },
    });
  } catch (error) {
    console.error('Error creating cash payment voucher:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    
    // If it's a validation error, log the details
    if (error.name === 'ValidationError') {
      console.error('Validation errors:', error.errors);
      const validationErrors = Object.keys(error.errors).map(key => ({
        field: key,
        message: error.errors[key].message,
        value: error.errors[key].value
      }));
      console.error('Validation error details:', validationErrors);
      
      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: validationErrors,
      });
    }
    
    // If it's a duplicate key error
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

// @desc    Update cash payment voucher
// @route   PUT /api/cash-payment-vouchers/:id
// @access  Private
const updateCashPaymentVoucher = async (req, res) => {
  try {
    const voucher = await CashPaymentVoucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Cash payment voucher not found',
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
      cashAccount,
      cashAccountType,
      shop,
      warehouse,
      payeeType,
      payee,
      payeeName,
      amount,
      currency,
      currencyExchangeRate,
      paymentMethod,
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

    console.log('Update - req.file:', req.file);
    console.log('Update - attachments from req.body:', attachments);
    console.log('Update - attachments type:', typeof attachments);

    // Helper function to parse attachments string (same as create function)
    const parseAttachmentsString = (attachmentsStr) => {
      if (!attachmentsStr || typeof attachmentsStr !== 'string') {
        return [];
      }
      
      try {
        let cleanString = attachmentsStr.trim();
        
        // Remove outer quotes if present
        if ((cleanString.startsWith('"') && cleanString.endsWith('"')) || 
            (cleanString.startsWith("'") && cleanString.endsWith("'"))) {
          cleanString = cleanString.slice(1, -1);
        }
        
        // Handle escaped characters - unescape the string
        cleanString = cleanString
          .replace(/\\n/g, '')
          .replace(/\\r/g, '')
          .replace(/\\t/g, '')
          .replace(/\\'/g, "'")
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\');
        
        // Try to parse as JSON
        const parsed = JSON.parse(cleanString);
        
        if (Array.isArray(parsed)) {
          return parsed;
        } else if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          // Single object, wrap in array
          return [parsed];
        }
        
        return [];
      } catch (parseError) {
        console.error('Error parsing attachments string:', parseError.message);
        console.error('Raw attachments string:', attachmentsStr);
        
        // Try alternative parsing - look for JSON-like structure
        try {
          // Try to extract JSON from the string using regex
          const jsonMatch = attachmentsStr.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return Array.isArray(parsed) ? parsed : [parsed];
          }
        } catch (e) {
          console.error('Alternative parsing also failed:', e.message);
        }
        
        return [];
      }
    };

    // Handle file uploads for attachments
    let uploadedAttachments = voucher.attachments || [];
    
    // If a new file is uploaded via req.file (single file)
    if (req.file) {
      // Delete old attachments from Cloudinary if replacing
      if (voucher.attachments && voucher.attachments.length > 0) {
        for (const attachment of voucher.attachments) {
          if (attachment.url) {
            try {
              const publicId = attachment.url.split('/').slice(-2).join('/').split('.')[0];
              await cloudinary.uploader.destroy(`cash-payment-vouchers/${publicId}`);
            } catch (error) {
              console.error('Error deleting old attachment:', error);
            }
          }
        }
      }

      // Upload new file
      uploadedAttachments = [];
      try {
        const uploadResult = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder: 'cash-payment-vouchers' },
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
        
        console.log('Update - File uploaded to Cloudinary, attachment added:', uploadedAttachments[0]);
      } catch (uploadError) {
        console.error('Error uploading file:', uploadError);
        // Keep existing attachments if upload fails
        uploadedAttachments = voucher.attachments || [];
      }
    }
    
    // Handle attachments from req.body (already uploaded to Cloudinary or provided as data)
    if (attachments !== undefined) {
      if (attachments === null) {
        // Explicitly set to empty array if null
        uploadedAttachments = [];
      } else {
        let parsedAttachments = [];
        
        if (Array.isArray(attachments)) {
          // Already an array
          parsedAttachments = attachments;
        } else if (typeof attachments === 'string') {
          // String that needs parsing
          parsedAttachments = parseAttachmentsString(attachments);
        } else if (typeof attachments === 'object' && !Array.isArray(attachments)) {
          // Single object
          parsedAttachments = [attachments];
        }
        
        // Normalize and validate each attachment
        const normalizedAttachments = parsedAttachments
          .filter(att => {
            // Filter out invalid entries
            if (!att || Array.isArray(att)) return false;
            if (typeof att !== 'object') return false;
            // Must have at least url or name
            return att.url || att.name;
          })
          .map(att => {
            // Ensure proper structure
            return {
              url: String(att.url || ''),
              name: String(att.name || ''),
              type: String(att.type || att.mimetype || '')
            };
          });
        
        // Merge with any file uploads
        if (req.file && uploadedAttachments.length > 0) {
          // If file was uploaded, combine with existing attachments
          uploadedAttachments = [...uploadedAttachments, ...normalizedAttachments];
        } else {
          // Use parsed attachments
          uploadedAttachments = normalizedAttachments;
        }
        
        console.log('Update - Final attachments to save:', uploadedAttachments);
      }
    }

    // Validate shop if provided
    if (shop !== undefined) {
      if (shop) {
        const shopExists = await Shop.findById(shop);
        if (!shopExists) {
          return res.status(404).json({
            status: 'fail',
            message: 'Shop not found',
          });
        }
      }
      voucher.shop = shop;
    }

    // Validate warehouse if provided
    if (warehouse !== undefined) {
      if (warehouse) {
        const warehouseExists = await Warehouse.findById(warehouse);
        if (!warehouseExists) {
          return res.status(404).json({
            status: 'fail',
            message: 'Warehouse not found',
          });
        }
      }
      voucher.warehouse = warehouse;
    }

    // Update fields
    if (voucherDate !== undefined) {
      const parsedDate = new Date(voucherDate);
      if (!isNaN(parsedDate.getTime())) {
        voucher.voucherDate = parsedDate;
      }
    }
    if (voucherType !== undefined) voucher.voucherType = voucherType;
    if (cashAccount !== undefined) voucher.cashAccount = cashAccount;
    if (cashAccountType !== undefined) voucher.cashAccountType = cashAccountType;
    if (payeeType !== undefined) voucher.payeeType = payeeType;
    if (payee !== undefined) voucher.payee = payee;
    if (payeeName !== undefined) voucher.payeeName = payeeName;
    if (amount !== undefined) voucher.amount = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (currency !== undefined) voucher.currency = currency;
    if (currencyExchangeRate !== undefined) voucher.currencyExchangeRate = typeof currencyExchangeRate === 'string' ? parseFloat(currencyExchangeRate) : currencyExchangeRate;
    if (paymentMethod !== undefined) voucher.paymentMethod = paymentMethod;
    if (transactionId !== undefined) voucher.transactionId = transactionId;
    if (referenceNumber !== undefined) voucher.referenceNumber = referenceNumber;
    if (relatedPurchase !== undefined) voucher.relatedPurchase = relatedPurchase;
    if (relatedSale !== undefined) voucher.relatedSale = relatedSale;
    if (relatedPayment !== undefined) voucher.relatedPayment = relatedPayment;
    if (relatedSupplierPayment !== undefined) voucher.relatedSupplierPayment = relatedSupplierPayment;
    if (description !== undefined) voucher.description = description;
    if (notes !== undefined) voucher.notes = notes;
    if (status !== undefined) voucher.status = status;
    if (attachments !== undefined || req.file) {
      // Final safety check: ensure attachments is always an array of proper objects
      if (!Array.isArray(uploadedAttachments)) {
        voucher.attachments = [];
      } else {
        voucher.attachments = uploadedAttachments
          .filter(att => att && typeof att === 'object' && !Array.isArray(att))
          .map(att => ({
            url: String(att.url || ''),
            name: String(att.name || ''),
            type: String(att.type || '')
          }));
      }
      console.log('Update - Final voucher.attachments before save:', voucher.attachments);
    }

    const updatedVoucher = await voucher.save();

    // Populate before sending response
    const populatedVoucher = await CashPaymentVoucher.findById(updatedVoucher._id)
      .populate('currency', 'name code symbol')
      .populate('shop', 'name address')
      .populate('warehouse', 'name address')
      .populate('payee', 'name')
      .populate('user', 'name email')
      .select('-__v');

    res.status(200).json({
      status: 'success',
      message: 'Cash payment voucher updated successfully',
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

// @desc    Approve cash payment voucher
// @route   PUT /api/cash-payment-vouchers/:id/approve
// @access  Private
const approveCashPaymentVoucher = async (req, res) => {
  try {
    const voucher = await CashPaymentVoucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Cash payment voucher not found',
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

    const populatedVoucher = await CashPaymentVoucher.findById(updatedVoucher._id)
      .populate('currency', 'name code symbol')
      .populate('shop', 'name address')
      .populate('warehouse', 'name address')
      .populate('payee', 'name')
      .populate('user', 'name email')
      .populate('approvalStatus.approvedBy', 'name email')
      .select('-__v');

    res.status(200).json({
      status: 'success',
      message: 'Cash payment voucher approved successfully',
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

// @desc    Reject cash payment voucher
// @route   PUT /api/cash-payment-vouchers/:id/reject
// @access  Private
const rejectCashPaymentVoucher = async (req, res) => {
  try {
    const { rejectionReason } = req.body;

    const voucher = await CashPaymentVoucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Cash payment voucher not found',
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

    const populatedVoucher = await CashPaymentVoucher.findById(updatedVoucher._id)
      .populate('currency', 'name code symbol')
      .populate('shop', 'name address')
      .populate('warehouse', 'name address')
      .populate('payee', 'name')
      .populate('user', 'name email')
      .populate('approvalStatus.approvedBy', 'name email')
      .select('-__v');

    res.status(200).json({
      status: 'success',
      message: 'Cash payment voucher rejected',
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

// @desc    Complete cash payment voucher
// @route   PUT /api/cash-payment-vouchers/:id/complete
// @access  Private
const completeCashPaymentVoucher = async (req, res) => {
  try {
    const voucher = await CashPaymentVoucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Cash payment voucher not found',
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

    const populatedVoucher = await CashPaymentVoucher.findById(updatedVoucher._id)
      .populate('currency', 'name code symbol')
      .populate('shop', 'name address')
      .populate('warehouse', 'name address')
      .populate('payee', 'name')
      .populate('user', 'name email')
      .populate('approvalStatus.approvedBy', 'name email')
      .select('-__v');

    res.status(200).json({
      status: 'success',
      message: 'Cash payment voucher completed successfully',
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

// @desc    Cancel cash payment voucher
// @route   PUT /api/cash-payment-vouchers/:id/cancel
// @access  Private
const cancelCashPaymentVoucher = async (req, res) => {
  try {
    const voucher = await CashPaymentVoucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Cash payment voucher not found',
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

    const populatedVoucher = await CashPaymentVoucher.findById(updatedVoucher._id)
      .populate('currency', 'name code symbol')
      .populate('shop', 'name address')
      .populate('warehouse', 'name address')
      .populate('payee', 'name')
      .populate('user', 'name email')
      .select('-__v');

    res.status(200).json({
      status: 'success',
      message: 'Cash payment voucher cancelled successfully',
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

// @desc    Delete cash payment voucher
// @route   DELETE /api/cash-payment-vouchers/:id
// @access  Private
const deleteCashPaymentVoucher = async (req, res) => {
  try {
    const voucher = await CashPaymentVoucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Cash payment voucher not found',
      });
    }

    // Prevent deletion if status is completed
    if (voucher.status === 'completed') {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot delete completed voucher',
      });
    }

    await CashPaymentVoucher.findByIdAndDelete(req.params.id);

    res.status(200).json({
      status: 'success',
      message: 'Cash payment voucher deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get cash payment vouchers by cash account
// @route   GET /api/cash-payment-vouchers/cash-account/:cashAccount
// @access  Private
const getVouchersByCashAccount = async (req, res) => {
  try {
    const { cashAccount } = req.params;
    const { page = 1, limit = 10, startDate, endDate, status, voucherType } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    let query = { cashAccount };

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

    const totalVouchers = await CashPaymentVoucher.countDocuments(query);

    const vouchers = await CashPaymentVoucher.find(query)
      .populate('currency', 'name code symbol')
      .populate('shop', 'name address')
      .populate('warehouse', 'name address')
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
      cashAccount,
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
  getCashPaymentVouchers,
  getCashPaymentVoucherById,
  createCashPaymentVoucher,
  updateCashPaymentVoucher,
  approveCashPaymentVoucher,
  rejectCashPaymentVoucher,
  completeCashPaymentVoucher,
  cancelCashPaymentVoucher,
  deleteCashPaymentVoucher,
  getVouchersByCashAccount,
};

