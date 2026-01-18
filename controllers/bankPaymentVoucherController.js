const mongoose = require('mongoose');
const BankPaymentVoucher = require('../models/bankPaymentVoucherModel');
const BankAccount = require('../models/bankAccountModel');
const SupplierPayment = require('../models/supplierPaymentModel');
const Payment = require('../models/paymentModel');
const SupplierJourney = require('../models/supplierJourneyModel');
const PaymentJourney = require('../models/paymentJourneyModel');
const Purchase = require('../models/purchaseModel');
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

// Helper function to create Payment or SupplierPayment transaction from voucher
const createTransactionFromVoucher = async (voucher, userId) => {
  console.log('=== createTransactionFromVoucher called ===');
  console.log('Voucher ID:', voucher?._id);
  console.log('User ID:', userId);
  
  // Ensure voucher is a Mongoose document with all fields loaded
  if (!voucher || !voucher._id) {
    console.error('Invalid voucher passed to createTransactionFromVoucher');
    return { createdSupplierPayment: null, createdPayment: null };
  }

  // Refresh voucher from database to ensure we have all fields
  const freshVoucher = await BankPaymentVoucher.findById(voucher._id);
  if (!freshVoucher) {
    console.error('Voucher not found in database');
    return { createdSupplierPayment: null, createdPayment: null };
  }
  
  console.log('Fresh voucher loaded:', {
    payeeType: freshVoucher.payeeType,
    payee: freshVoucher.payee,
    relatedSupplierPayment: freshVoucher.relatedSupplierPayment,
    relatedPayment: freshVoucher.relatedPayment,
    amount: freshVoucher.amount,
    status: freshVoucher.status
  });

  // Map voucher paymentMethod to supplier/customer payment method
  const mapPaymentMethod = (voucherMethod) => {
    const methodMap = {
      'bank_transfer': 'bank_transfer',
      'check': 'check',
      'online_payment': 'online_payment',
      'wire_transfer': 'bank_transfer',
      'dd': 'bank_transfer',
      'other': 'other'
    };
    return methodMap[voucherMethod] || 'bank_transfer';
  };

  let createdSupplierPayment = null;
  let createdPayment = null;

  // Only create transactions if they don't already exist
  if (freshVoucher.payeeType === 'supplier' && freshVoucher.payee && !freshVoucher.relatedSupplierPayment) {
    console.log('Creating SupplierPayment for supplier:', freshVoucher.payee);
    try {
      // Generate payment number
      const paymentCount = await SupplierPayment.countDocuments();
      const paymentNumber = `SP-${paymentCount + 1}`;
      
      // Use voucher's transactionId or generate a new one
      const paymentTransactionId = voucher.transactionId || `TRX-${Date.now()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
      
      // Calculate supplier balances
      const purchasesAgg = await Purchase.aggregate([
        { $match: { supplier: new mongoose.Types.ObjectId(freshVoucher.payee), isActive: true } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
      ]);
      const totalPurchasesAmount = purchasesAgg.length > 0 ? (purchasesAgg[0].total || 0) : 0;
      
      const paymentsAgg = await SupplierPayment.aggregate([
        { $match: { supplier: new mongoose.Types.ObjectId(freshVoucher.payee), status: { $nin: ['failed', 'refunded'] } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);
      const paidSoFar = paymentsAgg.length > 0 ? (paymentsAgg[0].total || 0) : 0;
      const remainingBefore = totalPurchasesAmount - paidSoFar;
      
      // Create SupplierPayment
      createdSupplierPayment = await SupplierPayment.create({
        paymentNumber,
        supplier: freshVoucher.payee,
        amount: freshVoucher.amount,
        paymentMethod: mapPaymentMethod(freshVoucher.paymentMethod || 'bank_transfer'),
        paymentDate: freshVoucher.voucherDate || new Date(),
        transactionId: paymentTransactionId,
        status: 'completed',
        notes: freshVoucher.notes || `Payment via bank payment voucher ${freshVoucher.voucherNumber}`,
        attachments: freshVoucher.attachments || [],
        user: userId,
        isPartial: false,
        currency: freshVoucher.currency || null,
        products: []
      });

      // Calculate new balances
      const newPaidAmount = paidSoFar + freshVoucher.amount;
      const newRemainingBalance = remainingBefore - freshVoucher.amount;
      const isAdvancedPayment = newRemainingBalance < 0;
      
      // Use voucherDate or paymentDate for consistency
      const paymentDate = freshVoucher.voucherDate || createdSupplierPayment.paymentDate || new Date();
      
      // Create supplier journey entry - this is what the payments API queries
      const journeyEntry = await SupplierJourney.create({
        supplier: freshVoucher.payee,
        user: userId,
        action: 'payment_made',
        payment: {
          amount: freshVoucher.amount,
          method: mapPaymentMethod(freshVoucher.paymentMethod || 'bank_transfer'),
          date: paymentDate, // Use consistent date
          status: 'completed',
          transactionId: paymentTransactionId
        },
        paidAmount: newPaidAmount,
        remainingBalance: newRemainingBalance,
        notes: `Payment of ${freshVoucher.amount} made to supplier via bank payment voucher ${freshVoucher.voucherNumber}. Transaction ID: ${paymentTransactionId}. ${isAdvancedPayment ? `Advanced payment: ${Math.abs(newRemainingBalance)}` : `Remaining balance: ${newRemainingBalance}`}. ${freshVoucher.notes || ''}`
      });

      console.log('SupplierJourney entry created:', journeyEntry._id, 'for supplier:', freshVoucher.payee);

      // Update voucher with created SupplierPayment reference
      freshVoucher.relatedSupplierPayment = createdSupplierPayment._id;
      await freshVoucher.save();

      console.log('SupplierPayment created automatically:', createdSupplierPayment._id);
    } catch (error) {
      console.error('Error creating SupplierPayment automatically:', error);
      // Continue without failing - voucher is already created
    }
  }

  // Create Payment if customer is selected and no relatedPayment provided
  if (freshVoucher.payeeType === 'customer' && freshVoucher.payee && !freshVoucher.relatedPayment) {
    console.log('Creating Payment for customer:', freshVoucher.payee);
    try {
      // Use voucher's transactionId or generate a new one
      const paymentTransactionId = freshVoucher.transactionId || `TRX-${Date.now()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
      
      // Prepare payments array for Payment model
      const paymentMethodMapped = mapPaymentMethod(freshVoucher.paymentMethod || 'bank_transfer');
      const paymentsArray = [{
        method: paymentMethodMapped,
        amount: freshVoucher.amount,
        bankAccount: (paymentMethodMapped === 'bank_transfer' || paymentMethodMapped === 'online_payment') ? freshVoucher.bankAccount : null
      }];

      // Create Payment
      createdPayment = await Payment.create({
        customer: freshVoucher.payee,
        sale: freshVoucher.relatedSale || null,
        amount: freshVoucher.amount,
        payments: paymentsArray,
        paymentDate: freshVoucher.voucherDate || new Date(),
        transactionId: paymentTransactionId,
        status: 'completed',
        notes: freshVoucher.notes || `Payment via bank payment voucher ${freshVoucher.voucherNumber}`,
        attachments: freshVoucher.attachments || [],
        user: userId,
        isPartial: false,
        currency: freshVoucher.currency || null,
        paymentType: freshVoucher.relatedSale ? 'sale_payment' : 'advance_payment'
      });

      // Create payment journey record
      await PaymentJourney.create({
        payment: createdPayment._id,
        user: userId,
        action: 'created',
        changes: [],
        notes: `Payment created via bank payment voucher ${freshVoucher.voucherNumber}${freshVoucher.relatedSale ? ` for sale ${freshVoucher.relatedSale}` : ' as advance payment'}`
      });

      // Update sale payment status if sale exists
      if (freshVoucher.relatedSale) {
        const Sales = require('../models/salesModel');
        const saleRecord = await Sales.findById(freshVoucher.relatedSale);
        if (saleRecord) {
          const remainingBalance = (saleRecord.grandTotal || 0) - (createdPayment.amount || 0);
          if (remainingBalance <= 0) {
            await Sales.findByIdAndUpdate(freshVoucher.relatedSale, { paymentStatus: 'paid' });
          } else {
            await Sales.findByIdAndUpdate(freshVoucher.relatedSale, { paymentStatus: 'partial' });
          }
        }
      }

      // Update voucher with created Payment reference
      freshVoucher.relatedPayment = createdPayment._id;
      await freshVoucher.save();

      console.log('Payment created automatically:', createdPayment._id);
    } catch (error) {
      console.error('Error creating Payment automatically:', error);
      // Continue without failing - voucher is already created
    }
  }

  return { createdSupplierPayment, createdPayment };
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
    
    console.log('req.file:', req.file);
    console.log('attachments from req.body:', attachments);
    console.log('attachments type:', typeof attachments);
    
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
            { folder: 'bank-payment-vouchers' },
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
    // Auto-set status to 'completed' if supplier/customer is selected (for automatic transaction creation)
    let finalStatus = status || 'draft';
    if (!status && (payeeType === 'supplier' || payeeType === 'customer') && payee) {
      finalStatus = 'completed';
      console.log('Auto-setting status to "completed" because supplier/customer is selected');
    }
    
    const voucherData = {
      voucherType,
      bankAccount,
      payeeType,
      payee,
      payeeName,
      amount: typeof amount === 'string' ? parseFloat(amount) : amount,
      currency,
      currencyExchangeRate: currencyExchangeRate ? (typeof currencyExchangeRate === 'string' ? parseFloat(currencyExchangeRate) : currencyExchangeRate) : 1,
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
      status: finalStatus,
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

    const voucher = await BankPaymentVoucher.create(voucherData);

    // Automatically create Payment or SupplierPayment transaction if supplier/customer is selected
    // Only create if status is 'completed' or 'approved' and relatedPayment/relatedSupplierPayment is not already provided
    // Check voucher.status (after creation) to ensure we have the actual saved status
    let createdTransaction = null;
    const voucherStatus = voucher.status || voucherData.status || status;
    console.log('Voucher created with status:', voucherStatus, 'Voucher ID:', voucher._id);
    
    if ((voucherStatus === 'completed' || voucherStatus === 'approved')) {
      console.log('Creating transaction from voucher - status is completed/approved');
      const transactionResult = await createTransactionFromVoucher(voucher, req.user._id);
      if (transactionResult.createdSupplierPayment) {
        createdTransaction = {
          type: 'SupplierPayment',
          id: transactionResult.createdSupplierPayment._id,
          paymentNumber: transactionResult.createdSupplierPayment.paymentNumber
        };
        console.log('Transaction created - SupplierPayment:', createdTransaction.id);
      } else if (transactionResult.createdPayment) {
        createdTransaction = {
          type: 'Payment',
          id: transactionResult.createdPayment._id,
          paymentNumber: transactionResult.createdPayment.paymentNumber
        };
        console.log('Transaction created - Payment:', createdTransaction.id);
      } else {
        console.log('No transaction created - check if supplier/customer was selected and relatedPayment/relatedSupplierPayment was already set');
      }
    } else {
      console.log('Transaction NOT created - voucher status is:', voucherStatus, '(expected: completed or approved)');
    }

    // Populate before sending response
    const populatedVoucher = await BankPaymentVoucher.findById(voucher._id)
      .populate('bankAccount', 'accountName accountNumber bankName')
      .populate('currency', 'name code symbol')
      .populate('payee', 'name')
      .populate('user', 'name email')
      .populate('relatedPayment', 'paymentNumber amount')
      .populate('relatedSupplierPayment', 'paymentNumber amount')
      .select('-__v');

    res.status(201).json({
      status: 'success',
      message: 'Bank payment voucher created successfully',
      data: {
        voucher: populatedVoucher,
        createdTransaction: createdTransaction
      },
    });
  } catch (error) {
    console.error('Error creating bank payment voucher:', error);
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
              await cloudinary.uploader.destroy(`bank-payment-vouchers/${publicId}`);
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
            { folder: 'bank-payment-vouchers' },
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

    // Create transactions if supplier/customer is selected and not already created
    await createTransactionFromVoucher(updatedVoucher, req.user._id);

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

    // Create transactions if supplier/customer is selected and not already created
    await createTransactionFromVoucher(updatedVoucher, req.user._id);

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

