const mongoose = require('mongoose');
const BankPaymentVoucher = require('../models/bankPaymentVoucherModel');
const BankAccount = require('../models/bankAccountModel');
const SupplierPayment = require('../models/supplierPaymentModel');
const Payment = require('../models/paymentModel');
const SupplierJourney = require('../models/supplierJourneyModel');
const PaymentJourney = require('../models/paymentJourneyModel');
const Purchase = require('../models/purchaseModel');
const FinancialPayment = require('../models/financialPaymentModel');
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
      .populate('relatedFinancialPayment', 'referCode amount paymentDate method relatedModel relatedId')
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
  let createdFinancialPayment = null;
  let errorDetails = null;

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
  console.log('Checking customer payment creation:', {
    payeeType: freshVoucher.payeeType,
    hasPayee: !!freshVoucher.payee,
    payee: freshVoucher.payee,
    hasRelatedPayment: !!freshVoucher.relatedPayment,
    relatedPayment: freshVoucher.relatedPayment
  });

  if (freshVoucher.payeeType === 'customer' && freshVoucher.payee && !freshVoucher.relatedPayment) {
    console.log('✓ Condition met - Creating Payment for customer:', freshVoucher.payee);
    try {
      // Use voucher's transactionId or generate a new one
      const paymentTransactionId = freshVoucher.transactionId || `TRX-${Date.now()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
      
      // Calculate customer balances (like supplier payments)
      const Sales = require('../models/salesModel');
      const salesAgg = await Sales.aggregate([
        { $match: { customer: new mongoose.Types.ObjectId(freshVoucher.payee), isActive: true } },
        { $group: { _id: null, total: { $sum: '$grandTotal' } } }
      ]);
      const totalSalesAmount = salesAgg.length > 0 ? (salesAgg[0].total || 0) : 0;
      
      const paymentsAgg = await Payment.aggregate([
        { $match: { customer: new mongoose.Types.ObjectId(freshVoucher.payee), status: { $nin: ['failed', 'refunded'] } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);
      const paidSoFar = paymentsAgg.length > 0 ? (paymentsAgg[0].total || 0) : 0;
      const remainingBefore = totalSalesAmount - paidSoFar;
      
      // Prepare payments array for Payment model
      const paymentMethodMapped = mapPaymentMethod(freshVoucher.paymentMethod || 'bank_transfer');
      const paymentsArray = [{
        method: paymentMethodMapped,
        amount: freshVoucher.amount,
        bankAccount: (paymentMethodMapped === 'bank_transfer' || paymentMethodMapped === 'online_payment') ? freshVoucher.bankAccount : null
      }];

      // Use voucherDate or paymentDate for consistency
      const paymentDate = freshVoucher.voucherDate || new Date();

      // Ensure customer is an ObjectId for Payment creation
      const customerIdForPayment = typeof freshVoucher.payee === 'string' 
        ? new mongoose.Types.ObjectId(freshVoucher.payee) 
        : freshVoucher.payee;

      console.log('Creating Payment with customer ID:', customerIdForPayment.toString());

      // Generate payment number (required field - must be set before creation)
      const date = new Date(paymentDate);
      const year = date.getFullYear().toString().slice(-2);
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      
      // Get count of payments for today to generate sequential number
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      
      const paymentsCount = await Payment.countDocuments({
        createdAt: {
          $gte: startOfDay,
          $lt: endOfDay,
        },
      });
      
      const paymentNumber = `PAY-${year}${month}${day}-${(paymentsCount + 1).toString().padStart(3, '0')}`;
      console.log('Generated payment number:', paymentNumber);

      // Create Payment
      createdPayment = await Payment.create({
        paymentNumber: paymentNumber,
        customer: customerIdForPayment,
        sale: freshVoucher.relatedSale || null,
        amount: freshVoucher.amount,
        payments: paymentsArray,
        paymentDate: paymentDate,
        transactionId: paymentTransactionId,
        status: 'completed',
        notes: freshVoucher.notes || `Payment via bank payment voucher ${freshVoucher.voucherNumber}`,
        attachments: freshVoucher.attachments || [],
        user: userId,
        isPartial: false,
        currency: freshVoucher.currency || null,
        paymentType: freshVoucher.relatedSale ? 'sale_payment' : 'advance_payment'
      });

      console.log('Payment created successfully:', createdPayment._id, 'Payment Number:', createdPayment.paymentNumber);

      // Calculate new balances (like supplier payments)
      const newPaidAmount = paidSoFar + freshVoucher.amount;
      const newRemainingBalance = remainingBefore - freshVoucher.amount;
      const isAdvancedPayment = newRemainingBalance < 0;

      // Get the actual payment status from the created payment
      const actualPaymentStatus = createdPayment.status || 'completed';

      // Ensure customer is an ObjectId
      const customerId = typeof freshVoucher.payee === 'string' 
        ? new mongoose.Types.ObjectId(freshVoucher.payee) 
        : freshVoucher.payee;

      console.log('Creating PaymentJourney with customer ID:', customerId.toString(), 'Type:', typeof customerId);

      // Create payment journey record with balance info (like supplier payments)
      const paymentJourneyData = {
        payment: createdPayment._id,
        customer: customerId, // Ensure customer field is set as ObjectId
        user: userId,
        action: 'payment_made',
        paymentDetails: {
          amount: freshVoucher.amount,
          method: paymentMethodMapped,
          date: paymentDate,
          status: actualPaymentStatus, // Use actual payment status
          transactionId: paymentTransactionId
        },
        paidAmount: newPaidAmount,
        remainingBalance: newRemainingBalance,
        changes: [],
        notes: `Payment of ${freshVoucher.amount} received from customer via bank payment voucher ${freshVoucher.voucherNumber}. Transaction ID: ${paymentTransactionId}. ${isAdvancedPayment ? `Advanced payment: ${Math.abs(newRemainingBalance)}` : `Remaining balance: ${newRemainingBalance}`}. ${freshVoucher.notes || ''}`
      };
      
      console.log('PaymentJourney data before creation:', {
        customer: paymentJourneyData.customer?.toString(),
        customerType: typeof paymentJourneyData.customer,
        action: paymentJourneyData.action,
        payment: paymentJourneyData.payment?.toString()
      });
      
      const paymentJourneyEntry = await PaymentJourney.create(paymentJourneyData);

      console.log('PaymentJourney entry created successfully:', {
        journeyId: paymentJourneyEntry._id,
        customerId: paymentJourneyEntry.customer?.toString(),
        paymentId: paymentJourneyEntry.payment?.toString(),
        action: paymentJourneyEntry.action,
        paymentDetails: paymentJourneyEntry.paymentDetails
      });
      
      // Ensure customer field is set (in case it wasn't saved properly)
      if (!paymentJourneyEntry.customer || paymentJourneyEntry.customer.toString() !== customerId.toString()) {
        console.log('⚠️ Customer field missing or incorrect, updating PaymentJourney...');
        paymentJourneyEntry.customer = customerId;
        await paymentJourneyEntry.save();
        console.log('✓ PaymentJourney customer field updated to:', customerId.toString());
      }

      // Verify PaymentJourney was created correctly by querying it back
      const verifyJourney = await PaymentJourney.findById(paymentJourneyEntry._id);
      if (verifyJourney) {
        console.log('Verified PaymentJourney exists with customer:', verifyJourney.customer?.toString());
        
        // Also verify by querying PaymentJourney with customer filter (like the API does)
        const apiQueryTest = await PaymentJourney.find({
          customer: customerId,
          action: 'payment_made'
        }).limit(1);
        console.log('API query test - found PaymentJourney entries:', apiQueryTest.length);
        if (apiQueryTest.length > 0) {
          console.log('✓ PaymentJourney will be found by customer transactions API');
        } else {
          console.error('✗ WARNING: PaymentJourney NOT found by customer transactions API query!');
          console.error('Query used:', { customer: customerId.toString(), action: 'payment_made' });
        }
      } else {
        console.error('ERROR: PaymentJourney not found after creation!');
      }

      // Update sale payment status if sale exists
      if (freshVoucher.relatedSale) {
        const saleRecord = await Sales.findById(freshVoucher.relatedSale);
        if (saleRecord) {
          const salePayments = await Payment.find({ sale: freshVoucher.relatedSale });
          const totalPaidForSale = salePayments.reduce((sum, p) => sum + p.amount, 0);
          const remainingBalance = (saleRecord.grandTotal || 0) - totalPaidForSale;
          if (remainingBalance <= 0) {
            await Sales.findByIdAndUpdate(freshVoucher.relatedSale, { paymentStatus: 'paid' });
          } else {
            await Sales.findByIdAndUpdate(freshVoucher.relatedSale, { paymentStatus: 'partial' });
          }
        }
      }

      // Update voucher with created Payment reference
      freshVoucher.relatedPayment = createdPayment._id;
      const savedVoucher = await freshVoucher.save();
      
      console.log('✓ Voucher updated with relatedPayment:', {
        voucherId: savedVoucher._id,
        relatedPayment: savedVoucher.relatedPayment?.toString(),
        paymentId: createdPayment._id.toString()
      });

      // Verify the update persisted
      const verifyVoucher = await BankPaymentVoucher.findById(freshVoucher._id);
      console.log('✓ Verified voucher has relatedPayment:', verifyVoucher.relatedPayment?.toString());

      console.log('Payment created automatically:', createdPayment._id);
    } catch (error) {
      console.error('❌ ERROR creating Payment automatically:', error);
      console.error('Error stack:', error.stack);
      errorDetails = {
        message: error.message,
        name: error.name,
        code: error.code,
        errors: error.errors
      };
      console.error('Error details:', errorDetails);
      
      // Log the voucher details for debugging
      console.error('Voucher details at error:', {
        voucherId: freshVoucher._id,
        payeeType: freshVoucher.payeeType,
        payee: freshVoucher.payee,
        amount: freshVoucher.amount,
        status: freshVoucher.status
      });
      
      // Don't fail the voucher creation, but log the error
      // Continue without failing - voucher is already created
    }
  } else {
    console.log('✗ Condition NOT met for customer payment creation:', {
      payeeType: freshVoucher.payeeType,
      hasPayee: !!freshVoucher.payee,
      hasRelatedPayment: !!freshVoucher.relatedPayment
    });
  }

  // Create FinancialPayment when voucher is linked to a financial entity (Asset, Income, etc.)
  if (
    freshVoucher.financialModel &&
    freshVoucher.financialId &&
    !freshVoucher.relatedFinancialPayment
  ) {
    try {
      const methodMapForFinancial = {
        bank_transfer: 'bank_transfer',
        check: 'check',
        online_payment: 'online',
        wire_transfer: 'bank_transfer',
        dd: 'bank_transfer',
        other: 'other',
      };

      const mappedMethod =
        methodMapForFinancial[freshVoucher.paymentMethod] || 'bank_transfer';

      const paymentDate = freshVoucher.voucherDate || new Date();

      createdFinancialPayment = await FinancialPayment.create({
        name:
          freshVoucher.payeeName ||
          freshVoucher.description ||
          `Financial payment for ${freshVoucher.financialModel}`,
        mobileNo: null,
        code: freshVoucher.referenceNumber || null,
        description:
          freshVoucher.description ||
          `Payment via bank payment voucher ${freshVoucher.voucherNumber}`,
        amount: freshVoucher.amount,
        paymentDate,
        method: mappedMethod,
        relatedModel: freshVoucher.financialModel,
        relatedId: freshVoucher.financialId,
        user: userId,
        isActive: freshVoucher.isActive,
      });

      freshVoucher.relatedFinancialPayment = createdFinancialPayment._id;
      await freshVoucher.save();
    } catch (error) {
      console.error('Error creating FinancialPayment automatically:', error);
      errorDetails = error;
    }
  }

  return { 
    createdSupplierPayment, 
    createdPayment,
    createdFinancialPayment,
    error: errorDetails || null
  };
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
      financialModel,
      financialId,
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

    // Normalize payee: treat empty string as undefined
    const normalizedPayee =
      payee && typeof payee === 'string' && payee.trim() === ''
        ? undefined
        : payee;

    // Validate payee if provided and not "other"
    if (normalizedPayee && payeeType !== 'other') {
      let PayeeModel;
      if (payeeType === 'supplier') {
        PayeeModel = require('../models/supplierModel');
      } else if (payeeType === 'customer') {
        PayeeModel = require('../models/customerModel');
      } else if (payeeType === 'employee') {
        PayeeModel = require('../models/userModel'); // Assuming Employee uses User model
      }

      if (PayeeModel) {
        const payeeExists = await PayeeModel.findById(normalizedPayee);
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
      // Only set payee when we actually have one and type is not "other"
      payee:
        normalizedPayee && payeeType !== 'other' ? normalizedPayee : undefined,
      payeeName,
      amount: typeof amount === 'string' ? parseFloat(amount) : amount,
      currency,
      currencyExchangeRate: currencyExchangeRate
        ? typeof currencyExchangeRate === 'string'
          ? parseFloat(currencyExchangeRate)
          : currencyExchangeRate
        : 1,
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
      // Financial link (Asset, Income, etc.)
      financialModel: financialModel || null,
      financialId:
        financialId && typeof financialId === 'string' && financialId.trim() !== ''
          ? financialId
          : undefined,
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

    let voucher = await BankPaymentVoucher.create(voucherData);

    // Automatically create Payment or SupplierPayment transaction if supplier/customer is selected
    // Only create if status is 'completed' or 'approved' and relatedPayment/relatedSupplierPayment is not already provided
    // Check voucher.status (after creation) to ensure we have the actual saved status
    let createdTransaction = null;
    let transactionResult = null;
    const voucherStatus = voucher.status || voucherData.status || status;
    console.log('Voucher created with status:', voucherStatus, 'Voucher ID:', voucher._id);
    
    if ((voucherStatus === 'completed' || voucherStatus === 'approved')) {
      console.log('Creating transaction from voucher - status is completed/approved');
      transactionResult = await createTransactionFromVoucher(voucher, req.user._id);
      console.log('Transaction result:', {
        hasSupplierPayment: !!transactionResult.createdSupplierPayment,
        hasPayment: !!transactionResult.createdPayment,
        hasError: !!transactionResult.error,
        error: transactionResult.error
      });
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
        if (transactionResult.error) {
          console.error('Transaction creation error:', transactionResult.error);
        }
      }
      
      // Reload voucher after transaction creation to ensure we have the latest data
      voucher = await BankPaymentVoucher.findById(voucher._id);
      console.log('Voucher reloaded after transaction creation:', {
        voucherId: voucher._id,
        relatedPayment: voucher.relatedPayment?.toString(),
        relatedSupplierPayment: voucher.relatedSupplierPayment?.toString()
      });
    } else {
      console.log('Transaction NOT created - voucher status is:', voucherStatus, '(expected: completed or approved)');
    }

    // Populate before sending response - use the reloaded voucher
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
        createdTransaction: createdTransaction,
        transactionError: createdTransaction === null && transactionResult?.error ? transactionResult.error : null
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
    // Normalize payee on update: treat empty string as undefined
    if (payee !== undefined) {
      if (typeof payee === 'string' && payee.trim() === '') {
        voucher.payee = undefined;
      } else {
        voucher.payee = payee;
      }
    }
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

// @desc    Create missing Payment transactions for existing vouchers
// @route   POST /api/bank-payment-vouchers/:id/create-transaction
// @access  Private
const createMissingTransaction = async (req, res) => {
  try {
    const voucher = await BankPaymentVoucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Bank payment voucher not found',
      });
    }

    // Check if transaction already exists
    if (voucher.payeeType === 'supplier' && voucher.relatedSupplierPayment) {
      return res.status(400).json({
        status: 'fail',
        message: 'Supplier payment already exists for this voucher',
      });
    }

    if (voucher.payeeType === 'customer' && voucher.relatedPayment) {
      return res.status(400).json({
        status: 'fail',
        message: 'Payment already exists for this voucher',
      });
    }

    // Only create transaction if voucher is completed or approved
    if (voucher.status !== 'completed' && voucher.status !== 'approved') {
      return res.status(400).json({
        status: 'fail',
        message: 'Can only create transactions for completed or approved vouchers',
      });
    }

    // Create the transaction
    const transactionResult = await createTransactionFromVoucher(voucher, req.user._id);

    // Reload voucher to get updated data
    const updatedVoucher = await BankPaymentVoucher.findById(voucher._id)
      .populate('bankAccount', 'accountName accountNumber bankName')
      .populate('currency', 'name code symbol')
      .populate('payee', 'name')
      .populate('user', 'name email')
      .populate('relatedPayment', 'paymentNumber amount')
      .populate('relatedSupplierPayment', 'paymentNumber amount')
      .select('-__v');

    if (transactionResult.createdSupplierPayment || transactionResult.createdPayment) {
      res.status(200).json({
        status: 'success',
        message: 'Transaction created successfully',
        data: {
          voucher: updatedVoucher,
          createdTransaction: transactionResult.createdSupplierPayment 
            ? { type: 'SupplierPayment', id: transactionResult.createdSupplierPayment._id }
            : { type: 'Payment', id: transactionResult.createdPayment._id }
        },
      });
    } else {
      res.status(400).json({
        status: 'fail',
        message: 'Failed to create transaction. Check server logs for details.',
        data: {
          voucher: updatedVoucher
        }
      });
    }
  } catch (error) {
    console.error('Error creating missing transaction:', error);
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Create missing Payment transactions for all vouchers without transactions
// @route   POST /api/bank-payment-vouchers/create-missing-transactions
// @access  Private/Admin
const createMissingTransactionsForAll = async (req, res) => {
  try {
    // Find all completed/approved vouchers without transactions
    const vouchersWithoutTransactions = await BankPaymentVoucher.find({
      status: { $in: ['completed', 'approved'] },
      $or: [
        { payeeType: 'customer', relatedPayment: { $exists: false } },
        { payeeType: 'customer', relatedPayment: null },
        { payeeType: 'supplier', relatedSupplierPayment: { $exists: false } },
        { payeeType: 'supplier', relatedSupplierPayment: null }
      ]
    }).limit(100); // Limit to 100 at a time to avoid timeout

    const results = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: []
    };

    for (const voucher of vouchersWithoutTransactions) {
      try {
        results.processed++;
        const transactionResult = await createTransactionFromVoucher(voucher, req.user._id);
        
        if (transactionResult.createdSupplierPayment || transactionResult.createdPayment) {
          results.succeeded++;
        } else {
          results.failed++;
          results.errors.push({
            voucherId: voucher._id,
            voucherNumber: voucher.voucherNumber,
            error: 'Transaction creation returned null'
          });
        }
      } catch (error) {
        results.failed++;
        results.errors.push({
          voucherId: voucher._id,
          voucherNumber: voucher.voucherNumber,
          error: error.message
        });
      }
    }

    res.status(200).json({
      status: 'success',
      message: `Processed ${results.processed} vouchers`,
      data: results
    });
  } catch (error) {
    console.error('Error creating missing transactions:', error);
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
  createMissingTransaction,
  createMissingTransactionsForAll,
};

