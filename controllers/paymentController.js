const mongoose = require('mongoose');
const Sales = require('../models/salesModel');
const Product = require('../models/productModel');
const Payment = require('../models/paymentModel');
const PaymentJourney = require('../models/paymentJourneyModel');
const Customer = require('../models/customerModel');
const BankAccount = require('../models/bankAccountModel');
const cloudinary = require('cloudinary').v2;

// @desc    Create a new payment
// @route   POST /api/payments
// @access  Private
const createPayment = async (req, res) => {
  try {
    // Parse JSON fields if they come as strings (from multipart/form-data)
    let payments = req.body.payments;
    if (typeof payments === 'string') {
      try {
        payments = JSON.parse(payments);
      } catch (e) {
        return res.status(400).json({
          status: 'fail',
          message: 'Invalid payments format. Must be a valid JSON array.',
        });
      }
    }

    const { 
      sale, 
      amount, 
      paymentMethod, // For backward compatibility
      bankAccount, // For backward compatibility
      paymentDate,
      transactionId, 
      status, 
      notes,
      attachments,
      currency,
      isPartial
    } = req.body;

    // Verify the sale exists (if provided)
    let saleRecord = null;
    let customerId = req.body.customer;
    
    if (sale) {
      saleRecord = await Sales.findById(sale);
      if (!saleRecord) {
        return res.status(404).json({
          status: 'fail',
          message: 'Sale not found',
        });
      }
      customerId = saleRecord.customer;
    }

    // Validate customer exists
    if (!customerId) {
      return res.status(400).json({
        status: 'fail',
        message: 'Customer is required',
      });
    }

    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({
        status: 'fail',
        message: 'Customer not found',
      });
    }

    // Normalize payments array (support both new format and backward compatibility)
    let normalizedPayments = [];
    if (payments && Array.isArray(payments) && payments.length > 0) {
      // New format: multiple payment methods
      normalizedPayments = payments;
    } else if (paymentMethod && amount) {
      // Backward compatibility: single payment method
      normalizedPayments = [{
        method: paymentMethod,
        amount: parseFloat(amount),
        bankAccount: bankAccount || null
      }];
    } else {
      return res.status(400).json({
        status: 'fail',
        message: 'Please provide either payments array or paymentMethod with amount',
      });
    }

    // Validate payments array
    if (!Array.isArray(normalizedPayments) || normalizedPayments.length === 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'Please provide at least one payment method',
      });
    }

    // Validate each payment
    for (const payment of normalizedPayments) {
      if (!payment.method || payment.amount === undefined) {
        return res.status(400).json({
          status: 'fail',
          message: 'Each payment must have: method and amount',
        });
      }

      const validMethods = ['cash', 'credit_card', 'debit_card', 'advance_adjustment', 'bank_transfer', 'check', 'online_payment', 'mobile_payment', 'other', 'advance'];
      if (!validMethods.includes(payment.method)) {
        return res.status(400).json({
          status: 'fail',
          message: `Invalid payment method: ${payment.method}. Allowed: ${validMethods.join(', ')}`,
        });
      }

      if (typeof payment.amount !== 'number' || payment.amount <= 0) {
        return res.status(400).json({
          status: 'fail',
          message: 'Payment amount must be a positive number',
        });
      }

      // Validate bank account for bank_transfer payments
      if (payment.method === 'bank_transfer' && payment.bankAccount) {
        const bank = await BankAccount.findById(payment.bankAccount);
        if (!bank) {
          return res.status(400).json({
            status: 'fail',
            message: 'Bank account not found for bank_transfer payment',
          });
        }
      }
    }

    // Calculate total payment amount
    const totalPaymentAmount = normalizedPayments.reduce((sum, payment) => sum + payment.amount, 0);

    // Generate transaction ID automatically if not provided (like supplier-payments)
    let finalTransactionId = transactionId;
    if (!finalTransactionId) {
      const timestamp = new Date().getTime();
      const randomPart = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      finalTransactionId = `TRX-${timestamp}-${randomPart}`;
    }
    
    // Set payment date to current date and time if not provided (like supplier-payments)
    const finalPaymentDate = paymentDate ? new Date(paymentDate) : new Date();

    // Compute current totals for validation and journey running balances (like supplier-payments)
    // Calculate total sales amount for this customer (active sales only)
    const salesAgg = await Sales.aggregate([
      { $match: { customer: new mongoose.Types.ObjectId(customerId), isActive: true } },
      { $group: { _id: null, total: { $sum: '$grandTotal' } } }
    ]);
    const totalSalesAmount = salesAgg.length > 0 ? (salesAgg[0].total || 0) : 0;
    
    // Calculate total payments already made for this customer (excluding failed/refunded)
    const paymentsAgg = await Payment.aggregate([
      { $match: { customer: new mongoose.Types.ObjectId(customerId), status: { $nin: ['failed', 'refunded'] } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const paidSoFar = paymentsAgg.length > 0 ? (paymentsAgg[0].total || 0) : 0;
    const remainingBefore = totalSalesAmount - paidSoFar;

    // Calculate total payments already made for this sale (if sale exists)
    let totalPaid = 0;
    let remainingBalance = 0;
    if (saleRecord) {
      const existingPayments = await Payment.find({ sale });
      totalPaid = existingPayments.reduce((sum, payment) => sum + payment.amount, 0);
      remainingBalance = saleRecord.grandTotal - totalPaid;
    }

    // Handle file uploads for attachments
    let uploadedAttachments = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        try {
          const uploadResult = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
              { folder: 'payment-attachments' },
              (error, result) => {
                if (error) return reject(error);
                resolve(result);
              }
            );
            stream.end(file.buffer);
          });
          
          uploadedAttachments.push({
            url: uploadResult.secure_url || '',
            name: file.originalname || '',
            type: file.mimetype || ''
          });
        } catch (uploadError) {
          console.error('Error uploading file:', uploadError);
          // Continue with other files even if one fails
        }
      }
    } else if (attachments && Array.isArray(attachments)) {
      // If attachments are provided as JSON (for API calls)
      uploadedAttachments = attachments;
    }

    // Generate payment number
    const date = finalPaymentDate;
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    
    // Get count of payments for today to generate sequential number
    const paymentsCount = await Payment.countDocuments({
      createdAt: {
        $gte: new Date(date.setHours(0, 0, 0, 0)),
        $lt: new Date(date.setHours(23, 59, 59, 999)),
      },
    });
    
    const paymentNumber = `PAY-${year}${month}${day}-${(paymentsCount + 1).toString().padStart(3, '0')}`;
    let excessAmount = 0;
    let regularPaymentAmount = totalPaymentAmount;
    let advancePayment = null;

    // Check if payment amount exceeds remaining balance (only if sale exists)
    if (saleRecord && totalPaymentAmount > remainingBalance) {
      excessAmount = totalPaymentAmount - remainingBalance;
      regularPaymentAmount = remainingBalance;
    }

    // Prepare payments array for database
    const paymentsForDB = normalizedPayments.map(payment => ({
      method: payment.method,
      amount: payment.amount,
      bankAccount: (payment.method === 'bank_transfer' || payment.method === 'online_payment') && payment.bankAccount 
        ? payment.bankAccount 
        : null
    }));

    // Create new payment for the invoice (up to the remaining balance)
    const payment = await Payment.create({
      paymentNumber,
      sale: sale || null,
      customer: customerId,
      amount: regularPaymentAmount,
      payments: paymentsForDB,
      paymentDate: finalPaymentDate,
      transactionId: finalTransactionId,
      status: status || 'completed',
      notes,
      attachments: uploadedAttachments,
      user: req.user._id,
      isPartial: isPartial || false,
      currency
    });

    // Calculate new balances (like supplier-payments)
    const newPaidAmount = paidSoFar + regularPaymentAmount;
    const newRemainingBalance = remainingBefore - regularPaymentAmount;
    const isAdvancedPayment = newRemainingBalance < 0;
    
    // Get payment method for journey entry (use first payment method)
    const paymentMethodForJourney = normalizedPayments.length > 0 ? normalizedPayments[0].method : 'unknown';
    
    // Create payment journey record with balance info (like supplier-payments)
    await PaymentJourney.create({
      payment: payment._id,
      customer: customerId,
      user: req.user._id,
      action: 'payment_made',
      paymentDetails: {
        amount: regularPaymentAmount,
        method: paymentMethodForJourney,
        date: finalPaymentDate,
        status: status || 'completed',
        transactionId: finalTransactionId
      },
      paidAmount: newPaidAmount,
      remainingBalance: newRemainingBalance,
      changes: [],
      notes: `Payment of ${regularPaymentAmount} received from customer via ${paymentMethodForJourney}. Transaction ID: ${finalTransactionId}. ${isAdvancedPayment ? `Advanced payment: ${Math.abs(newRemainingBalance)}` : `Remaining balance: ${newRemainingBalance}`}. ${notes || ''}`
    });
    
    // Update sale payment status to paid (if sale exists)
    if (saleRecord) {
      const newRemainingBalance = remainingBalance - regularPaymentAmount;
      if (newRemainingBalance <= 0) {
        await Sales.findByIdAndUpdate(sale, { paymentStatus: 'paid' });
      } else {
        await Sales.findByIdAndUpdate(sale, { paymentStatus: 'partial' });
      }
    }
    
    // If there's excess payment, create an advance payment record
    if (excessAmount > 0) {
      const advancePaymentNumber = `${paymentNumber}-ADV`;
      
      // Distribute excess amount proportionally across payment methods
      const excessPayments = paymentsForDB.map(p => ({
        ...p,
        amount: (p.amount / totalPaymentAmount) * excessAmount
      }));
      
      advancePayment = await Payment.create({
        paymentNumber: advancePaymentNumber,
        customer: customerId,
        amount: excessAmount,
        payments: excessPayments,
        paymentDate: finalPaymentDate,
        transactionId: finalTransactionId ? `${finalTransactionId}-ADV` : undefined,
        status: status || 'completed',
        notes: notes ? `${notes} (Excess payment - advance for future invoices)` : 'Excess payment - advance for future invoices',
        attachments: uploadedAttachments,
        user: req.user._id,
        isPartial: false,
        currency,
        isAdvancePayment: true
      });
      
      // Calculate balances for advance payment
      const advancePaidAmount = newPaidAmount + excessAmount;
      const advanceRemainingBalance = newRemainingBalance - excessAmount;
      
      // Create payment journey record for advance payment with balance info
      await PaymentJourney.create({
        payment: advancePayment._id,
        customer: customerId,
        user: req.user._id,
        action: 'payment_made',
        paymentDetails: {
          amount: excessAmount,
          method: paymentMethodForJourney,
          date: finalPaymentDate,
          status: status || 'completed',
          transactionId: finalTransactionId ? `${finalTransactionId}-ADV` : undefined
        },
        paidAmount: advancePaidAmount,
        remainingBalance: advanceRemainingBalance,
        changes: [],
        notes: `Excess payment ${advancePaymentNumber} created for customer for future use. Transaction ID: ${finalTransactionId ? `${finalTransactionId}-ADV` : 'N/A'}. Advanced payment: ${Math.abs(advanceRemainingBalance)}.`,
      });
    }
    
    // Return payment with balance information (like supplier-payments)
    res.status(201).json({
      ...payment.toObject(),
      balanceInfo: {
        totalSalesAmount,
        paidAmount: newPaidAmount,
        remainingBalance: newRemainingBalance,
        isAdvancedPayment: isAdvancedPayment,
        advanceAmount: isAdvancedPayment ? Math.abs(newRemainingBalance) : 0
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get all payments (like supplier-payments)
// @route   GET /api/payments
// @access  Private
const getPayments = async (req, res) => {
  try {
    const payments = await Payment.find({})
      .sort({ createdAt: -1 })
      .populate('customer', 'name email phoneNumber')
      .populate('user', 'name')
      .populate('currency', 'name symbol')
      .populate('sale', 'invoiceNumber grandTotal');

    res.status(200).json(payments);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get payment by ID
// @route   GET /api/payments/:id
// @access  Private
const getPaymentById = async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate('sale', 'invoiceNumber grandTotal items customer')
      .populate({
        path: 'sale',
        populate: {
          path: 'customer',
          select: 'name email phoneNumber address'
        }
      })
      .populate('user', 'name email')
      .populate('currency', 'name code symbol');

    if (payment) {
      // Calculate remaining balance after this payment
      const salePayments = await Payment.find({ 
        sale: payment.sale._id,
        paymentDate: { $lte: payment.paymentDate }
      });
      
      const totalPaid = salePayments.reduce((sum, p) => sum + p.amount, 0);
      const remainingBalance = payment.sale.grandTotal - totalPaid;
      
      const paymentWithBalance = {
        ...payment._doc,
        remainingBalance
      };
      
      res.json({
        status: 'success',
        data: paymentWithBalance,
      });
    } else {
      res.status(404).json({
        status: 'fail',
        message: 'Payment not found',
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Update payment by ID
// @route   PUT /api/payments/:id
// @access  Private
const updatePayment = async (req, res) => {
  try {
    // Parse JSON fields if they come as strings (from multipart/form-data)
    let payments = req.body.payments;
    if (typeof payments === 'string') {
      try {
        payments = JSON.parse(payments);
      } catch (e) {
        return res.status(400).json({
          status: 'fail',
          message: 'Invalid payments format. Must be a valid JSON array.',
        });
      }
    }

    const { 
      amount, 
      paymentMethod, // For backward compatibility
      bankAccount, // For backward compatibility
      paymentDate,
      transactionId, 
      status, 
      notes,
      attachments,
      currency
    } = req.body;

    const payment = await Payment.findById(req.params.id);

    if (!payment) {
      return res.status(404).json({
        status: 'fail',
        message: 'Payment not found',
      });
    }

    // Get the sale (if exists)
    let saleRecord = null;
    if (payment.sale) {
      saleRecord = await Sales.findById(payment.sale);
      if (!saleRecord) {
        return res.status(404).json({
          status: 'fail',
          message: 'Associated sale not found',
        });
      }
    }

    // Calculate total payments already made for this sale (excluding this payment)
    let totalPaid = 0;
    if (saleRecord) {
      const existingPayments = await Payment.find({ 
        sale: payment.sale,
        _id: { $ne: payment._id }
      });
      totalPaid = existingPayments.reduce((sum, p) => sum + p.amount, 0);
    }

    // Normalize payments array (support both new format and backward compatibility)
    let normalizedPayments = null;
    if (payments && Array.isArray(payments) && payments.length > 0) {
      // New format: multiple payment methods
      normalizedPayments = payments;
    } else if (paymentMethod && amount) {
      // Backward compatibility: single payment method
      normalizedPayments = [{
        method: paymentMethod,
        amount: parseFloat(amount),
        bankAccount: bankAccount || null
      }];
    }

    // Validate payments array if provided
    if (normalizedPayments) {
      for (const pay of normalizedPayments) {
        if (!pay.method || pay.amount === undefined) {
          return res.status(400).json({
            status: 'fail',
            message: 'Each payment must have: method and amount',
          });
        }

        const validMethods = ['cash', 'credit_card', 'debit_card', 'advance_adjustment', 'bank_transfer', 'check', 'online_payment', 'mobile_payment', 'other', 'advance'];
        if (!validMethods.includes(pay.method)) {
          return res.status(400).json({
            status: 'fail',
            message: `Invalid payment method: ${pay.method}`,
          });
        }

        // Validate bank account for bank_transfer payments
        if (pay.method === 'bank_transfer' && pay.bankAccount) {
          const bank = await BankAccount.findById(pay.bankAccount);
          if (!bank) {
            return res.status(400).json({
              status: 'fail',
              message: 'Bank account not found for bank_transfer payment',
            });
          }
        }
      }

      // Calculate total payment amount
      const totalPaymentAmount = normalizedPayments.reduce((sum, p) => sum + p.amount, 0);
      
      // Check if new payment amount is valid (only if sale exists)
      if (saleRecord && totalPaid + totalPaymentAmount > saleRecord.grandTotal) {
        return res.status(400).json({
          status: 'fail',
          message: 'Payment amount exceeds the remaining balance',
        });
      }
    }

    // Handle file uploads for attachments
    let uploadedAttachments = payment.attachments || [];
    if (req.files && req.files.length > 0) {
      // Delete old attachments from Cloudinary
      if (payment.attachments && payment.attachments.length > 0) {
        for (const attachment of payment.attachments) {
          if (attachment.url) {
            try {
              const publicId = attachment.url.split('/').slice(-2).join('/').split('.')[0];
              await cloudinary.uploader.destroy(`payment-attachments/${publicId}`);
            } catch (error) {
              console.error('Error deleting old attachment:', error);
            }
          }
        }
      }

      // Upload new files
      uploadedAttachments = [];
      for (const file of req.files) {
        try {
          const uploadResult = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
              { folder: 'payment-attachments' },
              (error, result) => {
                if (error) return reject(error);
                resolve(result);
              }
            );
            stream.end(file.buffer);
          });
          
          uploadedAttachments.push({
            url: uploadResult.secure_url || '',
            name: file.originalname || '',
            type: file.mimetype || ''
          });
        } catch (uploadError) {
          console.error('Error uploading file:', uploadError);
        }
      }
    } else if (attachments && Array.isArray(attachments)) {
      // If attachments are provided as JSON (for API calls)
      uploadedAttachments = attachments;
    }

    // Track changes for payment journey
    const changes = [];
    
    if (normalizedPayments) {
      const paymentsForDB = normalizedPayments.map(pay => ({
        method: pay.method,
        amount: pay.amount,
        bankAccount: (pay.method === 'bank_transfer' || pay.method === 'online_payment') && pay.bankAccount 
          ? pay.bankAccount 
          : null
      }));

      const totalPaymentAmount = paymentsForDB.reduce((sum, p) => sum + p.amount, 0);
      
      if (totalPaymentAmount !== payment.amount) {
        changes.push({
          field: 'amount',
          oldValue: payment.amount,
          newValue: totalPaymentAmount
        });
        payment.amount = totalPaymentAmount;
      }

      if (JSON.stringify(paymentsForDB) !== JSON.stringify(payment.payments || [])) {
        changes.push({
          field: 'payments',
          oldValue: payment.payments,
          newValue: paymentsForDB
        });
        payment.payments = paymentsForDB;
        
        // Update legacy fields for backward compatibility
        if (paymentsForDB.length > 0) {
          payment.paymentMethod = paymentsForDB[0].method;
          payment.bankAccount = paymentsForDB.find(p => p.bankAccount)?.bankAccount || null;
        }
      }
    } else if (amount !== undefined && amount !== payment.amount) {
      changes.push({
        field: 'amount',
        oldValue: payment.amount,
        newValue: amount
      });
      payment.amount = amount;
    }
    
    if (paymentMethod && !normalizedPayments && paymentMethod !== payment.paymentMethod) {
      changes.push({
        field: 'paymentMethod',
        oldValue: payment.paymentMethod,
        newValue: paymentMethod
      });
      payment.paymentMethod = paymentMethod;
    }
    
    if (paymentDate && paymentDate !== payment.paymentDate.toISOString()) {
      changes.push({
        field: 'paymentDate',
        oldValue: payment.paymentDate,
        newValue: paymentDate
      });
      payment.paymentDate = paymentDate;
    }
    
    if (transactionId !== undefined && transactionId !== payment.transactionId) {
      changes.push({
        field: 'transactionId',
        oldValue: payment.transactionId,
        newValue: transactionId
      });
      payment.transactionId = transactionId;
    }
    
    if (status && status !== payment.status) {
      changes.push({
        field: 'status',
        oldValue: payment.status,
        newValue: status
      });
      payment.status = status;
    }
    
    if (notes !== undefined && notes !== payment.notes) {
      changes.push({
        field: 'notes',
        oldValue: payment.notes,
        newValue: notes
      });
      payment.notes = notes;
    }
    
    if (uploadedAttachments.length > 0 && JSON.stringify(uploadedAttachments) !== JSON.stringify(payment.attachments || [])) {
      changes.push({
        field: 'attachments',
        oldValue: payment.attachments,
        newValue: uploadedAttachments
      });
      payment.attachments = uploadedAttachments;
    }
    
    if (currency && (!payment.currency || currency.toString() !== payment.currency.toString())) {
      changes.push({
        field: 'currency',
        oldValue: payment.currency,
        newValue: currency
      });
      payment.currency = currency;
    }
    
    // Update isPartial status (only if sale exists)
    if (saleRecord && (amount !== undefined || normalizedPayments)) {
      const newAmount = normalizedPayments 
        ? normalizedPayments.reduce((sum, p) => sum + p.amount, 0)
        : amount;
      const newIsPartial = totalPaid + newAmount < saleRecord.grandTotal;
      if (newIsPartial !== payment.isPartial) {
        changes.push({
          field: 'isPartial',
          oldValue: payment.isPartial,
          newValue: newIsPartial
        });
        payment.isPartial = newIsPartial;
      }
    }

    const updatedPayment = await payment.save();
    
    // Create payment journey record if there were changes
    if (changes.length > 0) {
      await PaymentJourney.create({
        payment: payment._id,
        user: req.user._id,
        action: 'updated',
        changes,
        notes: `Payment ${payment.paymentNumber} updated`,
      });
      
      // Update sale payment status (only if sale exists)
      if (saleRecord) {
        const allPayments = await Payment.find({ sale: payment.sale });
        const totalPaidAmount = allPayments.reduce((sum, p) => sum + p.amount, 0);
        let paymentStatus = 'unpaid';
      
        if (totalPaidAmount >= saleRecord.grandTotal) {
          paymentStatus = 'paid';
        } else if (totalPaidAmount > 0) {
          paymentStatus = 'partially_paid';
        }
        
        // Check if payment is overdue
        const today = new Date();
        if (saleRecord.dueDate && today > saleRecord.dueDate && totalPaidAmount < saleRecord.grandTotal) {
          paymentStatus = 'overdue';
        }
        
        await Sales.findByIdAndUpdate(saleRecord._id, { paymentStatus });
      }
    }

    res.json({
      status: 'success',
      data: updatedPayment,
      remainingBalance: saleRecord.grandTotal - (totalPaid + updatedPayment.amount)
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Delete payment
// @route   DELETE /api/payments/:id
// @access  Private
const deletePayment = async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);

    if (payment) {
      // Get the sale record
      const saleRecord = await Sales.findById(payment.sale);
      if (!saleRecord) {
        return res.status(404).json({
          status: 'fail',
          message: 'Associated sale not found',
        });
      }
      
      // Create payment journey record before deleting the payment
      await PaymentJourney.create({
        payment: payment._id,
        user: req.user._id,
        action: 'deleted',
        changes: [],
        notes: `Payment ${payment.paymentNumber} deleted`,
      });
      
      // Delete the payment
      await Payment.deleteOne({ _id: req.params.id });
      
      // Update sale payment status
      const remainingPayments = await Payment.find({ sale: payment.sale });
      const totalPaidAmount = remainingPayments.reduce((sum, p) => sum + p.amount, 0);
      let paymentStatus = 'unpaid';
      
      if (totalPaidAmount >= saleRecord.grandTotal) {
        paymentStatus = 'paid';
      } else if (totalPaidAmount > 0) {
        paymentStatus = 'partially_paid';
      }
      
      // Check if payment is overdue
      const today = new Date();
      if (saleRecord.dueDate && today > saleRecord.dueDate && totalPaidAmount < saleRecord.grandTotal) {
        paymentStatus = 'overdue';
      }
      
      await Sales.findByIdAndUpdate(saleRecord._id, { paymentStatus });
      
      res.json({
        status: 'success',
        message: 'Payment removed',
      });
    } else {
      res.status(404).json({
        status: 'fail',
        message: 'Payment not found',
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get payments by sale ID
// @route   GET /api/payments/sale/:saleId
// @access  Private
const getPaymentsBySaleId = async (req, res) => {
  try {
    const { saleId } = req.params;
    
    // Verify the sale exists
    const saleRecord = await Sales.findById(saleId);
    if (!saleRecord) {
      return res.status(404).json({
        status: 'fail',
        message: 'Sale not found',
      });
    }
    
    // Get all payments for this sale
    const payments = await Payment.find({ sale: saleId })
      .populate('user', 'name email')
      .populate('currency', 'name code symbol')
      .sort({ paymentDate: 1 });
    
    // Calculate payment summary
    const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
    const remainingBalance = saleRecord.grandTotal - totalPaid;
    const paymentStatus = remainingBalance <= 0 ? 'paid' : 
                          totalPaid > 0 ? 'partially_paid' : 'unpaid';
    
    res.json({
      status: 'success',
      results: payments.length,
      data: payments,
      summary: {
        invoiceNumber: saleRecord.invoiceNumber,
        invoiceTotal: saleRecord.grandTotal,
        totalPaid,
        remainingBalance,
        paymentStatus,
        paymentPercentage: (totalPaid / saleRecord.grandTotal * 100).toFixed(2)
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get payment statistics
// @route   GET /api/payments/stats
// @access  Private
const getPaymentStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Build date filter if provided
    let dateFilter = {};
    if (startDate && endDate) {
      dateFilter = {
        paymentDate: {
          $gte: new Date(startDate),
          $lte: new Date(endDate),
        }
      };
    }
    
    // Get payment statistics by method
    const paymentsByMethod = await Payment.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: "$paymentMethod",
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" }
        }
      },
      { $sort: { totalAmount: -1 } }
    ]);
    
    // Get payment statistics by day (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const paymentsByDay = await Payment.aggregate([
      { 
        $match: { 
          ...dateFilter,
          paymentDate: { $gte: thirtyDaysAgo }
        } 
      },
      {
        $group: {
          _id: { 
            year: { $year: "$paymentDate" },
            month: { $month: "$paymentDate" },
            day: { $dayOfMonth: "$paymentDate" }
          },
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } }
    ]);
    
    // Format payment by day data for easier frontend use
    const paymentTrends = paymentsByDay.map(item => ({
      date: `${item._id.year}-${String(item._id.month).padStart(2, '0')}-${String(item._id.day).padStart(2, '0')}`,
      count: item.count,
      amount: item.totalAmount
    }));
    
    // Get payment statistics by status
    const paymentsByStatus = await Payment.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" }
        }
      }
    ]);
    
    // Get overall statistics
    const overallStats = await Payment.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: null,
          totalPayments: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
          avgAmount: { $avg: "$amount" },
          minAmount: { $min: "$amount" },
          maxAmount: { $max: "$amount" }
        }
      }
    ]);
    
    res.json({
      status: 'success',
      data: {
        byMethod: paymentsByMethod,
        byStatus: paymentsByStatus,
        trends: paymentTrends,
        overall: overallStats.length > 0 ? overallStats[0] : {
          totalPayments: 0,
          totalAmount: 0,
          avgAmount: 0,
          minAmount: 0,
          maxAmount: 0
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get payment journey history for a payment
// @route   GET /api/payments/:id/journey
// @access  Private
const getPaymentJourney = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if payment exists
    const payment = await Payment.findById(id);
    if (!payment) {
      return res.status(404).json({
        status: 'fail',
        message: 'Payment not found',
      });
    }
    
    // Get payment journey history
    const journeyHistory = await PaymentJourney.find({ payment: id })
      .populate('user', 'name email')
      .sort({ createdAt: 1 });
    
    res.json({
      status: 'success',
      results: journeyHistory.length,
      data: journeyHistory,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Check and update overdue payments
// @route   GET /api/payments/check-overdue
// @access  Private/Admin
const checkOverduePayments = async (req, res) => {
  try {
    const today = new Date();
    
    // Find sales that are due but not fully paid
    const overdueSales = await Sales.find({
      dueDate: { $lt: today },
      paymentStatus: { $in: ['unpaid', 'partially_paid'] }
    });
    
    let updatedCount = 0;
    
    // Update each sale to overdue status
    for (const sale of overdueSales) {
      await Sales.findByIdAndUpdate(sale._id, { paymentStatus: 'overdue' });
      updatedCount++;
    }
    
    res.json({
      status: 'success',
      message: `${updatedCount} sales marked as overdue`,
      data: {
        updatedCount,
        totalOverdue: overdueSales.length
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get customer payment analytics
// @route   GET /api/payments/customer/:customerId/analytics
// @access  Private
const getCustomerPaymentAnalytics = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { startDate, endDate } = req.query;
    
    // Verify the customer exists
    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({
        status: 'fail',
        message: 'Customer not found',
      });
    }
    
    // Build date filter
    let dateFilter = {};
    if (startDate && endDate) {
      dateFilter = {
        createdAt: {
          $gte: new Date(startDate),
          $lte: new Date(endDate),
        }
      };
    }
    
    // Get all sales for this customer
    const sales = await Sales.find({
      customer: customerId,
      ...dateFilter
    }).sort({ createdAt: -1 });
    
    // Get all payments for these sales
    const saleIds = sales.map(sale => sale._id);
    const payments = await Payment.find({
      sale: { $in: saleIds }
    }).populate('sale', 'invoiceNumber grandTotal dueDate createdAt');
    
    // Get all advance payments for this customer
    const advancePayments = await Payment.find({
      customer: customerId,
      isAdvancePayment: true,
      ...dateFilter
    });
    
    const totalAdvanceAmount = advancePayments.reduce((sum, payment) => sum + payment.amount, 0);
    
    // Group sales by payment status
    const today = new Date();
    
    const paidSales = [];
    const partiallyPaidSales = [];
    const unpaidSales = [];
    const overdueSales = [];
    
    // Calculate payment analytics for each sale
    const salesAnalytics = await Promise.all(sales.map(async (sale) => {
      // Find payments for this sale
      const salePayments = payments.filter(payment => 
        payment.sale._id.toString() === sale._id.toString()
      );
      
      // Calculate total paid amount
      const totalPaid = salePayments.reduce((sum, payment) => sum + payment.amount, 0);
      const remainingBalance = sale.grandTotal - totalPaid;
      const paymentPercentage = (totalPaid / sale.grandTotal * 100).toFixed(2);
      
      // Determine payment status
      let paymentStatus = 'unpaid';
      if (totalPaid >= sale.grandTotal) {
        paymentStatus = 'paid';
        paidSales.push(sale._id);
      } else if (totalPaid > 0) {
        paymentStatus = 'partially_paid';
        partiallyPaidSales.push(sale._id);
      } else {
        unpaidSales.push(sale._id);
      }
      
      // Check if overdue
      if (sale.dueDate && today > sale.dueDate && remainingBalance > 0) {
        paymentStatus = 'overdue';
        overdueSales.push(sale._id);
      }
      
      // Get latest payment date
      const latestPayment = salePayments.length > 0 ? 
        salePayments.sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate))[0] : null;
      
      return {
        _id: sale._id,
        invoiceNumber: sale.invoiceNumber,
        date: sale.createdAt,
        dueDate: sale.dueDate,
        totalAmount: sale.grandTotal,
        totalPaid,
        remainingBalance,
        paymentPercentage,
        paymentStatus,
        daysSinceDue: sale.dueDate ? Math.floor((today - new Date(sale.dueDate)) / (1000 * 60 * 60 * 24)) : null,
        lastPaymentDate: latestPayment ? latestPayment.paymentDate : null,
        payments: salePayments.map(payment => ({
          _id: payment._id,
          amount: payment.amount,
          paymentDate: payment.paymentDate,
          paymentMethod: payment.paymentMethod,
          status: payment.status
        }))
      };
    }));
    
    // Calculate summary statistics
    const totalInvoiced = sales.reduce((sum, sale) => sum + sale.grandTotal, 0);
    const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
    const totalDue = totalInvoiced - totalPaid;
    
    // Calculate overdue amounts
    const overdueSalesData = sales.filter(sale => 
      overdueSales.includes(sale._id) || 
      (sale.dueDate && today > sale.dueDate && sale.paymentStatus !== 'paid')
    );
    
    const totalOverdue = overdueSalesData.reduce((sum, sale) => {
      const salePaid = payments
        .filter(payment => payment.sale._id.toString() === sale._id.toString())
        .reduce((paidSum, payment) => paidSum + payment.amount, 0);
      return sum + (sale.grandTotal - salePaid);
    }, 0);
    
    // Calculate aging buckets (0-30, 31-60, 61-90, 90+ days)
    const agingBuckets = {
      current: { count: 0, amount: 0 },
      '1-30': { count: 0, amount: 0 },
      '31-60': { count: 0, amount: 0 },
      '61-90': { count: 0, amount: 0 },
      '90+': { count: 0, amount: 0 }
    };
    
    salesAnalytics.forEach(sale => {
      if (sale.remainingBalance <= 0) return; // Skip fully paid sales
      
      let daysPastDue = 0;
      if (sale.dueDate) {
        daysPastDue = Math.max(0, Math.floor((today - new Date(sale.dueDate)) / (1000 * 60 * 60 * 24)));
      }
      
      let bucket;
      if (daysPastDue <= 0) bucket = 'current';
      else if (daysPastDue <= 30) bucket = '1-30';
      else if (daysPastDue <= 60) bucket = '31-60';
      else if (daysPastDue <= 90) bucket = '61-90';
      else bucket = '90+';
      
      agingBuckets[bucket].count++;
      agingBuckets[bucket].amount += sale.remainingBalance;
    });
    
    // Calculate payment trends (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    const paymentsByMonth = await Payment.aggregate([
      { 
        $match: { 
          sale: { $in: saleIds },
          paymentDate: { $gte: sixMonthsAgo }
        } 
      },
      {
        $group: {
          _id: { 
            year: { $year: "$paymentDate" },
            month: { $month: "$paymentDate" }
          },
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } }
    ]);
    
    // Format payment trend data
    const paymentTrends = paymentsByMonth.map(item => ({
      period: `${item._id.year}-${String(item._id.month).padStart(2, '0')}`,
      count: item.count,
      amount: item.totalAmount
    }));
    
    // Payment method breakdown
    const paymentMethodBreakdown = await Payment.aggregate([
      { 
        $match: { 
          sale: { $in: saleIds }
        } 
      },
      {
        $group: {
          _id: "$paymentMethod",
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" }
        }
      },
      { $sort: { totalAmount: -1 } }
    ]);
    
    // Get recent advance payments
    const recentAdvancePayments = advancePayments
      .sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate))
      .slice(0, 5)
      .map(payment => ({
        _id: payment._id,
        paymentNumber: payment.paymentNumber,
        amount: payment.amount,
        paymentDate: payment.paymentDate,
        paymentMethod: payment.paymentMethod,
        notes: payment.notes
      }));
    
    res.json({
      status: 'success',
      data: {
        customer: {
          _id: customer._id,
          name: customer.name,
          email: customer.email,
          phoneNumber: customer.phoneNumber
        },
        summary: {
          totalInvoiced,
          totalPaid,
          totalDue,
          totalOverdue,
          paidPercentage: totalInvoiced > 0 ? (totalPaid / totalInvoiced * 100).toFixed(2) : 0,
          totalSales: sales.length,
          paidSales: paidSales.length,
          partiallyPaidSales: partiallyPaidSales.length,
          unpaidSales: unpaidSales.length,
          overdueSales: overdueSales.length,
          totalAdvanceAmount,
          advancePaymentsCount: advancePayments.length
        },
        aging: agingBuckets,
        trends: paymentTrends,
        paymentMethods: paymentMethodBreakdown,
        sales: salesAnalytics,
        advancePayments: {
          total: totalAdvanceAmount,
          count: advancePayments.length,
          recent: recentAdvancePayments
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Create payment for a customer (distributed across unpaid sales)
// @route   POST /api/payments/customer
// @access  Private
const createCustomerPayment = async (req, res) => {
  try {
    const { 
      customerId, 
      amount, 
      paymentMethod, 
      notes,
      attachments,
      currency,
      status = 'completed',
      distributionStrategy = 'oldest-first' // Options: 'oldest-first', 'newest-first', 'proportional'
    } = req.body;

    // Ensure amount is positive
    if (amount <= 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'Payment amount must be greater than zero',
      });
    }

    // Automatically set payment date to current date/time
    const paymentDate = new Date();
    
    // Generate a unique transaction ID
    const transactionId = `TRX-${Date.now()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;

    // Verify the customer exists
    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({
        status: 'fail',
        message: 'Customer not found',
      });
    }

    // Find all unpaid or partially paid sales for this customer
    const unpaidSales = await Sales.find({
      customer: customerId,
      paymentStatus: { $in: ['unpaid', 'partially_paid', 'overdue'] }
    }).sort({ createdAt: distributionStrategy === 'newest-first' ? -1 : 1 }); // Sort by date based on strategy

    if (unpaidSales.length === 0) {
      // Create a record of the payment even if there are no unpaid sales
      const paymentNumber = generatePaymentNumber();
      
      const payment = await Payment.create({
        paymentNumber,
        customer: customerId, // Store customer reference directly
        amount,
        paymentMethod,
        paymentDate,
        transactionId,
        status,
        notes: notes ? `${notes} (Advance payment - no unpaid invoices)` : 'Advance payment - no unpaid invoices',
        attachments,
        user: req.user._id,
        isPartial: false,
        currency,
        isAdvancePayment: true // Flag to indicate this is an advance payment
      });
      
      // Create payment journey record
      await PaymentJourney.create({
        payment: payment._id,
        user: req.user._id,
        action: 'created',
        changes: [],
        notes: `Advance payment ${paymentNumber} created for customer ${customer.name}`,
      });
      
      return res.status(201).json({
        status: 'success',
        data: {
          // Supplier-like fields at top level
          payment: {
            amount: amount,
            method: paymentMethod,
            date: paymentDate,
            status: status,
            transactionId: transactionId
          },
          _id: payment._id,
          user: req.user ? { _id: req.user._id, name: req.user.name } : undefined,
          notes: notes ? notes : `Payment of ${amount} received via ${paymentMethod}. Transaction ID: ${transactionId}. Advanced payment: ${amount}.`,
          paidAmount: amount,
          remainingBalance: -amount,
          createdAt: paymentDate,

          // Backwards compatible fields
          customer: {
            id: customer._id,
            name: customer.name
          },
          totalPaid: amount,
          paymentNumber,
          transactionId,
          paymentDate,
          paymentStatus: status,
          isAdvancePayment: true,
          message: 'Advance payment recorded - no unpaid invoices found'
        }
      });
    }

    // Calculate total unpaid amount across all sales
    let totalUnpaidAmount = 0;
    const salesWithRemainingBalances = await Promise.all(unpaidSales.map(async (sale) => {
      // Get existing payments for this sale
      const existingPayments = await Payment.find({ sale: sale._id });
      const totalPaid = existingPayments.reduce((sum, payment) => sum + payment.amount, 0);
      const remainingBalance = sale.grandTotal - totalPaid;
      
      totalUnpaidAmount += remainingBalance;
      
      return {
        sale,
        remainingBalance,
        proportion: remainingBalance // Will be converted to actual proportion later
      };
    }));

    // Calculate proportions for proportional distribution
    if (distributionStrategy === 'proportional') {
      salesWithRemainingBalances.forEach(item => {
        item.proportion = item.remainingBalance / totalUnpaidAmount;
      });
    }

    // Generate payment number
    const date = new Date(paymentDate);
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    
    // Get count of payments for today to generate sequential number
    const paymentsCount = await Payment.countDocuments({
      createdAt: {
        $gte: new Date(date.setHours(0, 0, 0, 0)),
        $lt: new Date(date.setHours(23, 59, 59, 999)),
      },
    });
    
    const paymentNumber = `PAY-${year}${month}${day}-${(paymentsCount + 1).toString().padStart(3, '0')}`;

    // Distribute payment across sales based on strategy
    let remainingPaymentAmount = amount;
    const payments = [];
    const updatedSales = [];
    let excessAmount = 0;

    for (const saleData of salesWithRemainingBalances) {
      if (remainingPaymentAmount <= 0) break;
      
      let paymentAmount;
      
      if (distributionStrategy === 'proportional') {
        // Distribute proportionally
        paymentAmount = Math.min(
          Math.round((amount * saleData.proportion) * 100) / 100, // Round to 2 decimal places
          saleData.remainingBalance
        );
      } else {
        // For oldest-first or newest-first strategies
        paymentAmount = Math.min(remainingPaymentAmount, saleData.remainingBalance);
      }
      
      if (paymentAmount <= 0) continue;
      
      // Create payment record for this sale
      const payment = await Payment.create({
        paymentNumber: `${paymentNumber}-${payments.length + 1}`,
        sale: saleData.sale._id,
        customer: customerId, // Also store customer reference directly
        amount: paymentAmount,
        paymentMethod,
        paymentDate,
        transactionId: `${transactionId}-${payments.length + 1}`,
        status,
        notes: notes ? `${notes} (Part of customer payment distribution)` : 'Part of customer payment distribution',
        attachments,
        user: req.user._id,
        isPartial: paymentAmount < saleData.remainingBalance,
        currency
      });
      
      payments.push(payment);
      
      // Create payment journey record
      await PaymentJourney.create({
        payment: payment._id,
        user: req.user._id,
        action: 'created',
        changes: [],
        notes: `Payment ${payment.paymentNumber} created for invoice ${saleData.sale.invoiceNumber} as part of customer payment distribution`,
      });
      
      // Update sale payment status
      const newRemainingBalance = saleData.remainingBalance - paymentAmount;
      let paymentStatus = 'unpaid';
      
      if (newRemainingBalance <= 0) {
        paymentStatus = 'paid';
      } else {
        paymentStatus = 'partially_paid';
        
        // Check if payment is overdue
        const today = new Date();
        if (saleData.sale.dueDate && today > saleData.sale.dueDate) {
          paymentStatus = 'overdue';
        }
      }
      
      await Sales.findByIdAndUpdate(saleData.sale._id, { paymentStatus });
      updatedSales.push({
        saleId: saleData.sale._id,
        invoiceNumber: saleData.sale.invoiceNumber,
        amountPaid: paymentAmount,
        remainingBalance: newRemainingBalance,
        newStatus: paymentStatus
      });
      
      remainingPaymentAmount -= paymentAmount;
    }

    // If there's excess payment amount after paying all invoices
    if (remainingPaymentAmount > 0) {
      excessAmount = remainingPaymentAmount;
      
      // Create a record for the excess payment
      const excessPayment = await Payment.create({
        paymentNumber: `${paymentNumber}-excess`,
        customer: customerId, // Store customer reference directly
        amount: excessAmount,
        paymentMethod,
        paymentDate,
        transactionId: `${transactionId}-excess`,
        status,
        notes: notes ? `${notes} (Excess payment - advance for future invoices)` : 'Excess payment - advance for future invoices',
        attachments,
        user: req.user._id,
        isPartial: false,
        currency,
        isAdvancePayment: true // Flag to indicate this is an advance payment
      });
      
      payments.push(excessPayment);
      
      // Create payment journey record for excess payment
      await PaymentJourney.create({
        payment: excessPayment._id,
        user: req.user._id,
        action: 'created',
        changes: [],
        notes: `Excess payment ${excessPayment.paymentNumber} created for customer ${customer.name} for future use`,
      });
    }

    res.status(201).json({
      status: 'success',
      data: {
        // Supplier-like fields at top level
        payment: {
          amount: amount,
          method: paymentMethod,
          date: paymentDate,
          status: status,
          transactionId: transactionId
        },
        _id: payments.length > 0 ? payments[0]._id : undefined,
        user: req.user ? { _id: req.user._id, name: req.user.name } : undefined,
        notes: (() => {
          const base = notes || `Payment of ${amount} received via ${paymentMethod}. Transaction ID: ${transactionId}.`;
          return excessAmount > 0 ? `${base} Advanced payment: ${excessAmount}.` : base;
        })(),
        paidAmount: amount,
        remainingBalance: (() => {
          const applied = amount - (excessAmount || 0);
          const newRemaining = Math.max(0, (totalUnpaidAmount || 0) - applied);
          return excessAmount > 0 ? -excessAmount : newRemaining;
        })(),
        createdAt: paymentDate,

        // Backwards compatible fields
        customer: {
          id: customer._id,
          name: customer.name
        },
        totalPaid: amount,
        paymentNumber,
        transactionId,
        paymentDate,
        paymentStatus: status,
        payments: payments.map(p => ({
          id: p._id,
          paymentNumber: p.paymentNumber,
          amount: p.amount,
          sale: p.sale || null,
          isAdvancePayment: p.isAdvancePayment || false
        })),
        updatedSales,
        excessAmount: excessAmount > 0 ? excessAmount : undefined,
        distributionStrategy
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// Helper function to generate payment number
const generatePaymentNumber = () => {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  
  // Use a timestamp to ensure uniqueness
  const timestamp = Date.now().toString().slice(-6);
  
  return `PAY-${year}${month}${day}-${timestamp}`;
};

// @desc    Get all advance payments for a customer
// @route   GET /api/payments/customer/:customerId/advance
// @access  Private
const getCustomerAdvancePayments = async (req, res) => {
  try {
    const { customerId } = req.params;
    
    // Verify the customer exists
    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({
        status: 'fail',
        message: 'Customer not found',
      });
    }
    
    // Find all advance payments for this customer
    const advancePayments = await Payment.find({ 
      customer: customerId,
      isAdvancePayment: true
    }).sort({ paymentDate: -1 });
    
    // Calculate total advance amount
    const totalAdvance = advancePayments.reduce((sum, payment) => sum + payment.amount, 0);
    
    res.json({
      status: 'success',
      results: advancePayments.length,
      data: {
        advancePayments,
        totalAdvance,
        customer: {
          id: customer._id,
          name: customer.name
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get payment journey by customer ID
// @route   GET /api/payments/customer/:customerId/journey
// @access  Private
const getPaymentJourneyByCustomerId = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { startDate, endDate } = req.query;
    
    // Verify the customer exists
    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({
        status: 'fail',
        message: 'Customer not found',
      });
    }
    
    // Build date filter if provided
    let dateFilter = {};
    if (startDate && endDate) {
      dateFilter = {
        paymentDate: {
          $gte: new Date(startDate),
          $lte: new Date(endDate),
        }
      };
    }
    
    // Get all sales for this customer
    const sales = await Sales.find({ customer: customerId })
      .sort({ createdAt: -1 });
    
    // Get all payments for this customer (both regular and advance)
    const payments = await Payment.find({
      $or: [
        { customer: customerId, isAdvancePayment: true },
        { sale: { $in: sales.map(sale => sale._id) } }
      ],
      ...dateFilter
    })
    .populate('sale', 'invoiceNumber grandTotal dueDate createdAt items')
    .populate('user', 'name email')
    .populate('currency', 'name code symbol')
    .sort({ paymentDate: 1 });
    
    // Get all payment journeys for these payments
    const paymentIds = payments.map(payment => payment._id);
    const paymentJourneys = await PaymentJourney.find({
      payment: { $in: paymentIds }
    })
    .populate('user', 'name email')
    .sort({ createdAt: 1 });
    
    // Group journeys by payment
    const journeysByPayment = {};
    paymentJourneys.forEach(journey => {
      if (!journeysByPayment[journey.payment.toString()]) {
        journeysByPayment[journey.payment.toString()] = [];
      }
      journeysByPayment[journey.payment.toString()].push(journey);
    });
    
    // Calculate running balance over time
    let runningBalance = 0;
    const salesMap = {};
    sales.forEach(sale => {
      salesMap[sale._id.toString()] = sale;
      runningBalance += sale.grandTotal;
    });
    
    // Create timeline of all transactions
    const timeline = [];
    
    // Add sales to timeline
    sales.forEach(sale => {
      timeline.push({
        type: 'invoice',
        date: sale.createdAt,
        invoiceNumber: sale.invoiceNumber,
        amount: sale.grandTotal,
        dueDate: sale.dueDate,
        saleId: sale._id,
        items: sale.items,
        balanceAfter: null, // Will calculate this after sorting
        description: `Invoice created: ${sale.invoiceNumber}`
      });
    });
    
    // Add payments to timeline with enriched data
    payments.forEach(payment => {
      const journeys = journeysByPayment[payment._id.toString()] || [];
      const creationJourney = journeys.find(j => j.action === 'created');
      
      timeline.push({
        type: 'payment',
        date: payment.paymentDate,
        paymentNumber: payment.paymentNumber,
        amount: payment.amount,
        paymentMethod: payment.paymentMethod,
        status: payment.status,
        paymentId: payment._id,
        isAdvancePayment: payment.isAdvancePayment || false,
        sale: payment.sale ? {
          id: payment.sale._id,
          invoiceNumber: payment.sale.invoiceNumber,
          total: payment.sale.grandTotal
        } : null,
        createdBy: creationJourney?.user?.name || payment.user?.name || 'System',
        journeys: journeys.map(j => ({
          action: j.action,
          date: j.createdAt,
          user: j.user?.name || 'System',
          notes: j.notes,
          changes: j.changes
        })),
        balanceAfter: null, // Will calculate this after sorting
        description: payment.isAdvancePayment ? 
          `Advance payment: ${payment.paymentNumber}` : 
          `Payment: ${payment.paymentNumber} for invoice ${payment.sale?.invoiceNumber || 'N/A'}`
      });
    });
    
    // Sort timeline by date
    timeline.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    // Calculate running balance for each event
    let currentBalance = 0;
    timeline.forEach(event => {
      if (event.type === 'invoice') {
        currentBalance += event.amount;
      } else if (event.type === 'payment') {
        currentBalance -= event.amount;
      }
      event.balanceAfter = currentBalance;
    });
    
    // Calculate payment statistics
    const totalInvoiced = sales.reduce((sum, sale) => sum + sale.grandTotal, 0);
    const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
    const currentOutstandingBalance = currentBalance;
    
    // Calculate on-time vs late payments
    const onTimePayments = [];
    const latePayments = [];
    
    payments.forEach(payment => {
      if (!payment.sale || !payment.sale.dueDate) return;
      
      const paymentDate = new Date(payment.paymentDate);
      const dueDate = new Date(payment.sale.dueDate);
      
      if (paymentDate <= dueDate) {
        onTimePayments.push(payment);
      } else {
        latePayments.push(payment);
      }
    });
    
    // Calculate average days to payment
    const daysToPayment = [];
    payments.forEach(payment => {
      if (!payment.sale || !payment.sale.createdAt) return;
      
      const invoiceDate = new Date(payment.sale.createdAt);
      const paymentDate = new Date(payment.paymentDate);
      const days = Math.floor((paymentDate - invoiceDate) / (1000 * 60 * 60 * 24));
      
      daysToPayment.push(days);
    });
    
    const avgDaysToPayment = daysToPayment.length > 0 ? 
      daysToPayment.reduce((sum, days) => sum + days, 0) / daysToPayment.length : 0;
    
    // Calculate payment method breakdown
    const paymentMethodBreakdown = {};
    payments.forEach(payment => {
      if (!paymentMethodBreakdown[payment.paymentMethod]) {
        paymentMethodBreakdown[payment.paymentMethod] = {
          count: 0,
          amount: 0
        };
      }
      paymentMethodBreakdown[payment.paymentMethod].count++;
      paymentMethodBreakdown[payment.paymentMethod].amount += payment.amount;
    });
    
    // Find advance payments
    const advancePayments = payments.filter(payment => payment.isAdvancePayment);
    const totalAdvanceAmount = advancePayments.reduce((sum, payment) => sum + payment.amount, 0);
    
    res.json({
      status: 'success',
      data: {
        customer: {
          _id: customer._id,
          name: customer.name,
          email: customer.email,
          phoneNumber: customer.phoneNumber
        },
        summary: {
          totalInvoiced,
          totalPaid,
          currentOutstandingBalance,
          totalSales: sales.length,
          totalPayments: payments.length,
          totalAdvancePayments: advancePayments.length,
          totalAdvanceAmount,
          paymentCompletion: totalInvoiced > 0 ? ((totalPaid / totalInvoiced) * 100).toFixed(2) : 100,
          onTimePayments: onTimePayments.length,
          latePayments: latePayments.length,
          avgDaysToPayment: avgDaysToPayment.toFixed(1),
          paymentMethodBreakdown
        },
        timeline
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get simplified customer transaction history
// @route   GET /api/payments/customer/:customerId/transactions
// @access  Private
// @desc    Get customer payment summary (like supplier-journey/:supplierId/payments)
// @route   GET /api/payments/customer/:customerId/transactions
// @access  Private
const getCustomerTransactionHistory = async (req, res) => {
  try {
    const { customerId } = req.params;
    
    // Verify the customer exists
    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({
        status: 'fail',
        message: 'Customer not found',
      });
    }

    // Get all payment entries for this customer from PaymentJourney (like supplier-journey)
    const paymentEntries = await PaymentJourney.find({ 
      customer: customerId,
      action: { $in: ['payment_made', 'payment_updated'] }
    })
    .sort({ 'paymentDetails.date': -1 })
    .select('paymentDetails notes createdAt user paidAmount remainingBalance')
    .populate('user', 'name');

    // Calculate total payments
    const totalPayments = paymentEntries.reduce((sum, entry) => {
      return sum + (entry.paymentDetails?.amount || 0);
    }, 0);

    // Group payments by status
    const paymentsByStatus = paymentEntries.reduce((acc, entry) => {
      const status = entry.paymentDetails?.status || 'unknown';
      if (!acc[status]) {
        acc[status] = 0;
      }
      acc[status] += entry.paymentDetails?.amount || 0;
      return acc;
    }, {});

    const enhancedEntries = paymentEntries.map(entry => {
      const obj = entry.toObject();
      const adv = (obj.remainingBalance || 0) < 0 ? Math.abs(obj.remainingBalance) : 0;
      const normalizedRemaining = (obj.remainingBalance || 0) < 0 ? 0 : (obj.remainingBalance || 0);
      return {
        ...obj,
        payment: obj.paymentDetails, // Map paymentDetails to payment for consistency
        remainingBalance: normalizedRemaining,
        advancePayment: adv
      };
    });

    res.status(200).json({
      totalPayments,
      paymentsByStatus,
      paymentEntries: enhancedEntries
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Apply customer's advance payment to a sale
// @route   POST /api/payments/apply-customer-advance
// @access  Private
const applyAdvancePaymentToSale = async (req, res) => {
  try {
    const { customerId, saleId } = req.body;

    // Verify the customer exists
    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({
        status: 'fail',
        message: 'Customer not found',
      });
    }

    // Find all advance payments for this customer
    // Modified query to match how advance payments are stored
    const advancePayments = await Payment.find({ 
      customer: customerId,
      $or: [
        { isAdvancePayment: true },
        { notes: { $regex: /advance/i } }
      ],
      status: { $ne: 'cancelled' }
    });

    // Calculate total available advance amount
    const totalAdvanceAvailable = advancePayments.reduce((sum, payment) => sum + payment.amount, 0);

    if (totalAdvanceAvailable <= 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'No advance payment available for this customer',
        debug: {
          advancePaymentsCount: advancePayments.length,
          advancePayments: advancePayments.map(p => ({
            id: p._id,
            amount: p.amount,
            isAdvancePayment: p.isAdvancePayment,
            notes: p.notes
          }))
        }
      });
    }

    // Find all unpaid or partially paid sales for this customer
    const unpaidSales = await Sales.find({
      customer: customerId,
      paymentStatus: { $in: ['unpaid', 'partially_paid', 'overdue'] }
    }).sort({ createdAt: 1 }); // Process oldest sales first

    if (unpaidSales.length === 0) {
      return res.status(400).json({
        status: 'success',
        message: 'No unpaid sales found for this customer. Advance payment remains available.',
        data: {
          customer: {
            id: customer._id,
            name: customer.name
          },
          totalAdvanceAvailable
        }
      });
    }

    // Process each sale until advance payment is exhausted
    let remainingAdvance = totalAdvanceAvailable;
    const processedSales = [];
    const payments = [];

    for (const sale of unpaidSales) {
      if (remainingAdvance <= 0) break;

      // Calculate remaining balance for the sale
      const existingPayments = await Payment.find({ sale: sale._id });
      const totalPaid = existingPayments.reduce((sum, payment) => sum + payment.amount, 0);
      const remainingBalance = sale.grandTotal - totalPaid;

      if (remainingBalance <= 0) continue; // Skip if already paid

      // Determine how much advance payment to apply
      const amountToApply = Math.min(remainingAdvance, remainingBalance);

      // Generate payment number
      const date = new Date();
      const year = date.getFullYear().toString().slice(-2);
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      
      // Get count of payments for today to generate sequential number
      const paymentsCount = await Payment.countDocuments({
        createdAt: {
          $gte: new Date(date.setHours(0, 0, 0, 0)),
          $lt: new Date(date.setHours(23, 59, 59, 999)),
        },
      });
      
      const paymentNumber = `PAY-${year}${month}${day}-${(paymentsCount + payments.length + 1).toString().padStart(3, '0')}`;

      // Create a new payment record using the advance payment
      const payment = await Payment.create({
        paymentNumber,
        sale: sale._id,
        customer: customerId,
        amount: amountToApply,
        paymentMethod: 'advance', // Special payment method to indicate it's from advance payment
        paymentDate: new Date(),
        status: 'completed',
        notes: `Payment applied from customer's advance payment balance (${remainingAdvance} available, ${amountToApply} applied)`,
        user: req.user._id,
        isPartial: amountToApply < remainingBalance,
        currency: sale.currency // Assuming sale has currency field, otherwise adjust accordingly
      });

      payments.push(payment);

      // Create payment journey record
      await PaymentJourney.create({
        payment: payment._id,
        user: req.user._id,
        action: 'created',
        changes: [],
        notes: `Payment ${paymentNumber} created from advance payment for invoice ${sale.invoiceNumber}`,
      });

      // Update sale payment status
      let paymentStatus = 'unpaid';
      if (amountToApply >= remainingBalance) {
        paymentStatus = 'paid';
      } else if (amountToApply > 0) {
        paymentStatus = 'partially_paid';
      }
      
      await Sales.findByIdAndUpdate(sale._id, { paymentStatus });

      // Track processed sale
      processedSales.push({
        saleId: sale._id,
        invoiceNumber: sale.invoiceNumber,
        amountApplied: amountToApply,
        remainingBalance: remainingBalance - amountToApply,
        newPaymentStatus: paymentStatus
      });

      // Reduce remaining advance amount
      remainingAdvance -= amountToApply;
    }

    // Create a record to track used amount (using negative amount to reduce advance balance)
    if (processedSales.length > 0) {
      const date = new Date();
      const year = date.getFullYear().toString().slice(-2);
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      const timestamp = Date.now().toString().slice(-6);
      const adjustmentPaymentNumber = `ADV-${year}${month}${day}-${timestamp}`;
      
      // We don't need to create an advance_adjustment record anymore since we're directly
      // handling the advance balance reduction in the 'advance' payment method
      // This prevents double-counting the reduction
    }

    res.status(200).json({
      status: 'success',
      data: {
        customer: {
          id: customer._id,
          name: customer.name
        },
        totalAdvanceAvailable,
        totalAmountApplied: totalAdvanceAvailable - remainingAdvance,
        remainingAdvance,
        processedSales,
        payments: payments.map(p => ({
          id: p._id,
          paymentNumber: p.paymentNumber,
          amount: p.amount,
          sale: p.sale
        })),
        message: processedSales.length > 0 
          ? `Applied ${totalAdvanceAvailable - remainingAdvance} from advance payment to ${processedSales.length} invoices. Remaining advance balance: ${remainingAdvance}` 
          : 'No sales were processed'
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get payment summary with comprehensive analytics
// @route   GET /api/payments/summary
// @access  Private
const getPaymentSummary = async (req, res) => {
  try {
    const { startDate, endDate, customer, paymentMethod, status } = req.query;
    
    const filter = {};
    
    if (startDate || endDate) {
      filter.paymentDate = {};
      if (startDate) filter.paymentDate.$gte = new Date(startDate);
      if (endDate) filter.paymentDate.$lte = new Date(endDate);
    }
    
    if (customer) filter.customer = customer;
    if (paymentMethod) filter.paymentMethod = paymentMethod;
    if (status) filter.status = status;
    
    const summary = await Payment.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalPayments: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          totalRefunds: { $sum: '$refundAmount' },
          averageAmount: { $avg: '$amount' },
          paymentMethods: {
            $push: {
              method: '$paymentMethod',
              amount: '$amount'
            }
          },
          paymentTypes: {
            $push: {
              type: '$paymentType',
              amount: '$amount'
            }
          }
        }
      }
    ]);
    
    // Get payment method breakdown
    const methodBreakdown = await Payment.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$paymentMethod',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      },
      { $sort: { totalAmount: -1 } }
    ]);
    
    // Get payment type breakdown
    const typeBreakdown = await Payment.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$paymentType',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      },
      { $sort: { totalAmount: -1 } }
    ]);
    
    // Get status breakdown
    const statusBreakdown = await Payment.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      }
    ]);
    
    const result = summary.length > 0 ? summary[0] : {
      totalPayments: 0,
      totalAmount: 0,
      totalRefunds: 0,
      averageAmount: 0
    };
    
    res.json({
      status: 'success',
      data: {
        summary: result,
        breakdown: {
          paymentMethods: methodBreakdown,
          paymentTypes: typeBreakdown,
          statuses: statusBreakdown
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// @desc    Get payments by customer ID
// @route   GET /api/payments/customer/:customerId
// @access  Private
const getPaymentsByCustomer = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { 
      page = 1, 
      limit = 10, 
      startDate, 
      endDate, 
      paymentMethod, 
      status,
      paymentType 
    } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    // Check if customer exists
    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({
        status: 'fail',
        message: 'Customer not found'
      });
    }
    
    // Build filter
    const filter = { customer: customerId };
    
    if (startDate || endDate) {
      filter.paymentDate = {};
      if (startDate) filter.paymentDate.$gte = new Date(startDate);
      if (endDate) filter.paymentDate.$lte = new Date(endDate);
    }
    
    if (paymentMethod) filter.paymentMethod = paymentMethod;
    if (status) filter.status = status;
    if (paymentType) filter.paymentType = paymentType;
    
    // Count total payments
    const totalPayments = await Payment.countDocuments(filter);
    
    // Get payments
    const payments = await Payment.find(filter)
      .populate('sale', 'invoiceNumber grandTotal')
      .populate('customer', 'name email phoneNumber')
      .populate('user', 'name email')
      .populate('currency', 'name code symbol')
      .sort({ paymentDate: -1 })
      .skip(skip)
      .limit(limitNum);
    
    // Calculate customer totals
    const customerTotals = await Payment.aggregate([
      { $match: { customer: customerId } },
      {
        $group: {
          _id: null,
          totalPaid: { $sum: '$amount' },
          totalRefunded: { $sum: '$refundAmount' },
          totalAdvancePayments: {
            $sum: {
              $cond: [{ $eq: ['$isAdvancePayment', true] }, '$amount', 0]
            }
          },
          paymentCount: { $sum: 1 }
        }
      }
    ]);
    
    const totals = customerTotals.length > 0 ? customerTotals[0] : {
      totalPaid: 0,
      totalRefunded: 0,
      totalAdvancePayments: 0,
      paymentCount: 0
    };
    
    res.json({
      status: 'success',
      results: payments.length,
      totalPages: Math.ceil(totalPayments / limitNum),
      currentPage: pageNum,
      totalPayments,
      customerTotals: totals,
      data: payments
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// @desc    Create a refund for a payment
// @route   POST /api/payments/:id/refund
// @access  Private
const createRefund = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, reason, notes, refundMethod } = req.body;
    
    const originalPayment = await Payment.findById(id);
    if (!originalPayment) {
      return res.status(404).json({
        status: 'fail',
        message: 'Payment not found'
      });
    }
    
    if (originalPayment.status === 'refunded') {
      return res.status(400).json({
        status: 'fail',
        message: 'Payment has already been fully refunded'
      });
    }
    
    const refundAmount = amount || originalPayment.amount;
    
    if (refundAmount > originalPayment.amount) {
      return res.status(400).json({
        status: 'fail',
        message: 'Refund amount cannot exceed original payment amount'
      });
    }
    
    // Create refund payment record
    const refund = await Payment.create({
      paymentNumber: `${originalPayment.paymentNumber}-REF`,
      paymentType: 'refund',
      customer: originalPayment.customer,
      sale: originalPayment.sale,
      amount: refundAmount,
      paymentMethod: refundMethod || originalPayment.paymentMethod,
      paymentDate: new Date(),
      status: 'completed',
      notes: notes || `Refund for payment ${originalPayment.paymentNumber}: ${reason}`,
      user: req.user._id,
      isAdvancePayment: false,
      currency: originalPayment.currency,
      refundAmount: refundAmount,
      refundDate: new Date(),
      refundReason: reason,
      referenceNumber: originalPayment.paymentNumber
    });
    
    // Update original payment
    const newRefundAmount = (originalPayment.refundAmount || 0) + refundAmount;
    const newStatus = newRefundAmount >= originalPayment.amount ? 'refunded' : 'partially_refunded';
    
    await Payment.findByIdAndUpdate(id, {
      refundAmount: newRefundAmount,
      refundDate: newRefundAmount >= originalPayment.amount ? new Date() : originalPayment.refundDate,
      refundReason: reason,
      status: newStatus
    });
    
    // Create payment journey record
    await PaymentJourney.create({
      payment: refund._id,
      user: req.user._id,
      action: 'refund_created',
      changes: [{
        field: 'refund',
        oldValue: null,
        newValue: {
          amount: refundAmount,
          reason: reason
        }
      }],
      notes: `Refund created for payment ${originalPayment.paymentNumber}`
    });
    
    res.status(201).json({
      status: 'success',
      data: refund
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// @desc    Get payment analytics dashboard
// @route   GET /api/payments/analytics
// @access  Private
const getPaymentAnalytics = async (req, res) => {
  try {
    const { period = '30', startDate, endDate } = req.query;
    
    let dateFilter = {};
    if (startDate && endDate) {
      dateFilter.paymentDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    } else {
      const days = parseInt(period);
      const start = new Date();
      start.setDate(start.getDate() - days);
      dateFilter.paymentDate = { $gte: start };
    }
    
    // Daily payment trends
    const dailyTrends = await Payment.aggregate([
      { $match: { ...dateFilter, status: 'completed' } },
      {
        $group: {
          _id: {
            year: { $year: '$paymentDate' },
            month: { $month: '$paymentDate' },
            day: { $dayOfMonth: '$paymentDate' }
          },
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    ]);
    
    // Payment method performance
    const methodPerformance = await Payment.aggregate([
      { $match: { ...dateFilter, status: 'completed' } },
      {
        $group: {
          _id: '$paymentMethod',
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 },
          averageAmount: { $avg: '$amount' }
        }
      },
      { $sort: { totalAmount: -1 } }
    ]);
    
    // Customer payment behavior
    const customerBehavior = await Payment.aggregate([
      { $match: { ...dateFilter, status: 'completed' } },
      {
        $group: {
          _id: '$customer',
          totalPaid: { $sum: '$amount' },
          paymentCount: { $sum: 1 },
          averagePayment: { $avg: '$amount' }
        }
      },
      { $sort: { totalPaid: -1 } },
      { $limit: 10 }
    ]);
    
    // Populate customer names
    const customerIds = customerBehavior.map(cb => cb._id);
    const customers = await Customer.find({ _id: { $in: customerIds } }, 'name email');
    const customerMap = {};
    customers.forEach(customer => {
      customerMap[customer._id.toString()] = customer;
    });
    
    const customerBehaviorWithNames = customerBehavior.map(cb => ({
      ...cb,
      customer: customerMap[cb._id.toString()]
    }));
    
    res.json({
      status: 'success',
      data: {
        dailyTrends,
        methodPerformance,
        topCustomers: customerBehaviorWithNames
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
  createPayment,
  getPayments,
  getPaymentById,
  updatePayment,
  deletePayment,
  getPaymentsBySaleId,
  getPaymentStats,
  getPaymentJourney,
  checkOverduePayments,
  getCustomerPaymentAnalytics,
  createCustomerPayment,
  getCustomerAdvancePayments,
  getPaymentJourneyByCustomerId,
  getCustomerTransactionHistory,
  applyAdvancePaymentToSale,
  getPaymentSummary,
  getPaymentsByCustomer,
  createRefund,
  getPaymentAnalytics
}; 