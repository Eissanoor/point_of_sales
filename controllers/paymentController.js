const Sales = require('../models/salesModel');
const Product = require('../models/productModel');
const Payment = require('../models/paymentModel');
const PaymentJourney = require('../models/paymentJourneyModel');
const Customer = require('../models/customerModel');

// @desc    Create a new payment
// @route   POST /api/payments
// @access  Private
const createPayment = async (req, res) => {
  try {
    const { 
      sale, 
      amount, 
      paymentMethod, 
      paymentDate,
      transactionId, 
      status, 
      notes,
      attachments,
      currency,
      isPartial
    } = req.body;

    // Verify the sale exists
    const saleRecord = await Sales.findById(sale);
    if (!saleRecord) {
      return res.status(404).json({
        status: 'fail',
        message: 'Sale not found',
      });
    }

    // Calculate total payments already made for this sale
    const existingPayments = await Payment.find({ sale });
    const totalPaid = existingPayments.reduce((sum, payment) => sum + payment.amount, 0);
    
    // Calculate remaining balance
    const remainingBalance = saleRecord.grandTotal - totalPaid;
    
    // Generate payment number
    const date = new Date(paymentDate || Date.now());
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
    let regularPaymentAmount = amount;
    let advancePayment = null;

    // Check if payment amount exceeds remaining balance
    if (amount > remainingBalance) {
      excessAmount = amount - remainingBalance;
      regularPaymentAmount = remainingBalance;
    }

    // Create new payment for the invoice (up to the remaining balance)
    const payment = await Payment.create({
      paymentNumber,
      sale,
      customer: saleRecord.customer,
      amount: regularPaymentAmount,
      paymentMethod,
      paymentDate: paymentDate || Date.now(),
      transactionId,
      status: status || 'completed',
      notes,
      attachments,
      user: req.user._id,
      isPartial: false, // Since we're handling excess separately, this payment completes the invoice
      currency
    });

    // Create payment journey record
    await PaymentJourney.create({
      payment: payment._id,
      user: req.user._id,
      action: 'created',
      changes: [],
      notes: `Payment ${paymentNumber} created for invoice ${saleRecord.invoiceNumber}`,
    });
    
    // Update sale payment status to paid
    await Sales.findByIdAndUpdate(sale, { paymentStatus: 'paid' });
    
    // If there's excess payment, create an advance payment record
    if (excessAmount > 0) {
      const advancePaymentNumber = `${paymentNumber}-ADV`;
      
      advancePayment = await Payment.create({
        paymentNumber: advancePaymentNumber,
        customer: saleRecord.customer,
        amount: excessAmount,
        paymentMethod,
        paymentDate: paymentDate || Date.now(),
        transactionId: transactionId ? `${transactionId}-ADV` : undefined,
        status: status || 'completed',
        notes: notes ? `${notes} (Excess payment - advance for future invoices)` : 'Excess payment - advance for future invoices',
        attachments,
        user: req.user._id,
        isPartial: false,
        currency,
        isAdvancePayment: true
      });
      
      // Create payment journey record for advance payment
      await PaymentJourney.create({
        payment: advancePayment._id,
        user: req.user._id,
        action: 'created',
        changes: [],
        notes: `Excess payment ${advancePaymentNumber} created for customer ${saleRecord.customer.name || saleRecord.customer} for future use`,
      });
    }
    
    res.status(201).json({
      status: 'success',
      data: {
        payment,
        advancePayment,
        excessAmount,
        originalAmount: amount,
        invoiceAmount: regularPaymentAmount,
        remainingBalance: 0, // Since we've fully paid the invoice
        message: excessAmount > 0 ? 
          `Payment of ${regularPaymentAmount} applied to invoice. Excess amount of ${excessAmount} recorded as advance payment.` : 
          `Payment of ${regularPaymentAmount} completed the invoice.`
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get all payments with pagination and filtering
// @route   GET /api/payments
// @access  Private
const getPayments = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      startDate, 
      endDate, 
      sale, 
      paymentMethod,
      status,
      paymentNumber 
    } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    let query = {};

    // Filter by date range
    if (startDate && endDate) {
      query.paymentDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    // Filter by sale
    if (sale) {
      query.sale = sale;
    }

    // Filter by payment method
    if (paymentMethod) {
      query.paymentMethod = paymentMethod;
    }

    // Filter by status
    if (status) {
      query.status = status;
    }

    // Filter by payment number
    if (paymentNumber) {
      query.paymentNumber = { $regex: paymentNumber, $options: 'i' };
    }

    // Count total documents for pagination info
    const totalPayments = await Payment.countDocuments(query);

    // Find payments based on query with pagination
    const payments = await Payment.find(query)
      .populate('sale', 'invoiceNumber grandTotal')
      .populate({
        path: 'sale',
        populate: {
          path: 'customer',
          select: 'name email phoneNumber'
        }
      })
      .populate('user', 'name email')
      .populate('currency', 'name code symbol')
      .limit(limitNum)
      .skip(skip)
      .sort({ paymentDate: -1 });
    
    // Calculate remaining balance for each payment
    const enhancedPayments = await Promise.all(payments.map(async (payment) => {
      const salePayments = await Payment.find({ 
        sale: payment.sale._id,
        paymentDate: { $lte: payment.paymentDate }
      });
      
      const totalPaid = salePayments.reduce((sum, p) => sum + p.amount, 0);
      const remainingBalance = payment.sale.grandTotal - totalPaid;
      
      return {
        ...payment._doc,
        remainingBalance
      };
    }));
    
    res.json({
      status: 'success',
      results: payments.length,
      totalPages: Math.ceil(totalPayments / limitNum),
      currentPage: pageNum,
      totalPayments,
      data: enhancedPayments,
    });
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
    const { 
      amount, 
      paymentMethod, 
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

    // Get the sale
    const saleRecord = await Sales.findById(payment.sale);
    if (!saleRecord) {
      return res.status(404).json({
        status: 'fail',
        message: 'Associated sale not found',
      });
    }

    // Calculate total payments already made for this sale (excluding this payment)
    const existingPayments = await Payment.find({ 
      sale: payment.sale,
      _id: { $ne: payment._id }
    });
    const totalPaid = existingPayments.reduce((sum, p) => sum + p.amount, 0);
    
    // Check if new payment amount is valid
    if (amount && totalPaid + amount > saleRecord.grandTotal) {
      return res.status(400).json({
        status: 'fail',
        message: 'Payment amount exceeds the remaining balance',
      });
    }

    // Track changes for payment journey
    const changes = [];
    
    if (amount !== undefined && amount !== payment.amount) {
      changes.push({
        field: 'amount',
        oldValue: payment.amount,
        newValue: amount
      });
      payment.amount = amount;
    }
    
    if (paymentMethod && paymentMethod !== payment.paymentMethod) {
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
    
    if (attachments) {
      changes.push({
        field: 'attachments',
        oldValue: payment.attachments,
        newValue: attachments
      });
      payment.attachments = attachments;
    }
    
    if (currency && (!payment.currency || currency.toString() !== payment.currency.toString())) {
      changes.push({
        field: 'currency',
        oldValue: payment.currency,
        newValue: currency
      });
      payment.currency = currency;
    }
    
    // Update isPartial status
    if (amount !== undefined) {
      const newIsPartial = totalPaid + amount < saleRecord.grandTotal;
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
      
      // Update sale payment status
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
const getCustomerTransactionHistory = async (req, res) => {
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
        $or: [
          { createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) } }, // For sales
          { paymentDate: { $gte: new Date(startDate), $lte: new Date(endDate) } } // For payments
        ]
      };
    }
    
    // Get all sales for this customer
    const sales = await Sales.find({ 
      customer: customerId,
      ...dateFilter
    }).select('invoiceNumber grandTotal createdAt dueDate notes paymentStatus');
    
    // Get all payments for this customer, sorted by date
    const payments = await Payment.find({
      $or: [
        { customer: customerId, isAdvancePayment: true },
        { customer: customerId, paymentMethod: 'advance' },
        { customer: customerId, paymentMethod: 'advance_adjustment' },
        { sale: { $in: sales.map(sale => sale._id) } }
      ],
      ...dateFilter
    })
    .select('paymentNumber amount paymentDate paymentMethod notes sale isAdvancePayment isAdvanceUsed')
    .populate('sale', 'invoiceNumber grandTotal')
    .sort({ paymentDate: 1 }); // Sort by payment date ascending
    
    // Create transactions array for payment-related transactions only
    const transactions = [];
    
    // Create a map of sales by ID for quick lookup
    const salesMap = {};
    sales.forEach(sale => {
      salesMap[sale._id.toString()] = sale;
    });
    
    // Track running balances for each sale
    const saleBalances = {};
    sales.forEach(sale => {
      saleBalances[sale._id.toString()] = sale.grandTotal;
    });
    
    // Track available advance funds
    let availableAdvance = 0;
    
    // First, calculate initial advance amount (from payments made before the date range)
    if (startDate) {
      const previousAdvancePayments = await Payment.find({
        customer: customerId,
        isAdvancePayment: true,
        paymentDate: { $lt: new Date(startDate) }
      });
      
      availableAdvance = previousAdvancePayments.reduce((sum, payment) => sum + payment.amount, 0);
    }
    
    // Group payments by date and reference to combine related payments
    const paymentGroups = {};
    
    // Process all payments in chronological order
    for (const payment of payments) {
      const paymentDate = payment.paymentDate.toISOString();
      const saleId = payment.sale ? payment.sale._id.toString() : null;
      const invoiceRef = payment.sale ? payment.sale.invoiceNumber : null;
      
      // Create a unique key for grouping related payments
      const groupKey = `${paymentDate}_${invoiceRef || 'advance'}_${payment.paymentMethod}`;
      
      if (!paymentGroups[groupKey]) {
        paymentGroups[groupKey] = {
          payments: [],
          totalAmount: 0,
          date: payment.paymentDate,
          paymentMethod: payment.paymentMethod,
          invoiceReference: invoiceRef,
          saleId: saleId
        };
      }
      
      paymentGroups[groupKey].payments.push(payment);
      paymentGroups[groupKey].totalAmount += payment.amount;
    }
    
    // First process advance payments to establish the initial advance balance
    let advancePaymentsProcessed = [];
    
    // Process each group to create simplified transactions
    for (const groupKey in paymentGroups) {
      const group = paymentGroups[groupKey];
      const firstPayment = group.payments[0];
      
      // Case 1: Pure advance payment (no sale)
      if (!group.saleId && (firstPayment.isAdvancePayment || firstPayment.notes?.includes('advance'))) {
        availableAdvance += group.totalAmount;
        advancePaymentsProcessed.push(group);
        
        transactions.push({
          type: 'payment',
          date: group.date,
          reference: firstPayment.paymentNumber,
          amount: group.totalAmount,
          notes: `Advance payment: ${availableAdvance} available`,
          paymentMethod: group.paymentMethod,
          remainingBalance: -availableAdvance, // Show cumulative advance as negative
          balanceAfter: 0
        });
      }
    }
    
    // Then process payments that use advance funds
    for (const groupKey in paymentGroups) {
      const group = paymentGroups[groupKey];
      const firstPayment = group.payments[0];
      
      // Skip advance payments as they've already been processed
      if (advancePaymentsProcessed.includes(group)) {
        continue;
      }
      
      // Case 2: Payment using advance funds
      if (group.paymentMethod === 'advance') {
        const relatedSale = group.saleId ? salesMap[group.saleId] : null;
        
        if (relatedSale) {
          // Get current balance for this sale before this payment
          const currentBalance = saleBalances[group.saleId] || 0;
          
          // Calculate how much to apply to the sale
          const appliedAmount = Math.min(group.totalAmount, currentBalance);
          
          // Update the sale balance
          saleBalances[group.saleId] = Math.max(0, currentBalance - appliedAmount);
          
          // When using advance payment, reduce the available advance
          availableAdvance -= appliedAmount;
          
          // Create a single transaction for this payment
          transactions.push({
            type: 'payment',
            date: group.date,
            reference: firstPayment.paymentNumber,
            amount: group.totalAmount,
            notes: `Payment: ${saleBalances[group.saleId]} remaining on invoice, ${availableAdvance} advance remaining`,
            paymentMethod: group.paymentMethod,
            invoiceReference: group.invoiceReference,
            remainingBalance: saleBalances[group.saleId],
            balanceAfter: saleBalances[group.saleId],
            advanceBalance: availableAdvance
          });
        }
      }
    }
    
    // Then process advance adjustments
    for (const groupKey in paymentGroups) {
      const group = paymentGroups[groupKey];
      const firstPayment = group.payments[0];
      
      // Skip advance payments as they've already been processed
      if (advancePaymentsProcessed.includes(group)) {
        continue;
      }
      
      // Case 3: Advance adjustment
      if (group.paymentMethod === 'advance_adjustment') {
        // For advance_adjustment, we don't need to modify the available advance again
        // since it was already adjusted when processing the 'advance' payment method
        
        transactions.push({
          type: 'payment',
          date: group.date,
          reference: firstPayment.paymentNumber,
          amount: Math.abs(group.totalAmount), // Display the absolute value for better readability
          notes: firstPayment.notes || `Advance payment used: ${availableAdvance} remaining`,
          paymentMethod: group.paymentMethod,
          remainingBalance: -availableAdvance, // This should reflect the actual remaining advance
          balanceAfter: 0
        });
      }
    }
    
    // Finally process regular payments
    for (const groupKey in paymentGroups) {
      const group = paymentGroups[groupKey];
      const firstPayment = group.payments[0];
      
      // Skip advance payments and advance adjustments as they've already been processed
      if (advancePaymentsProcessed.includes(group) || 
          group.paymentMethod === 'advance' || 
          group.paymentMethod === 'advance_adjustment') {
        continue;
      }
      
      // Case 4: Regular payment for a sale
      if (group.saleId) {
        const relatedSale = salesMap[group.saleId];
        
        if (relatedSale) {
          // Get current balance for this sale before this payment
          const currentBalance = saleBalances[group.saleId] || 0;
          
          // Calculate how much to apply to the sale
          const appliedAmount = Math.min(group.totalAmount, currentBalance);
          
          // Calculate excess amount if any
          const excessAmount = Math.max(0, group.totalAmount - currentBalance);
          
          // Update the sale balance
          saleBalances[group.saleId] = Math.max(0, currentBalance - appliedAmount);
          
          // If there's excess, add it to available advance
          if (excessAmount > 0) {
            availableAdvance += excessAmount;
          }
          
          // Create a single transaction for this payment
          transactions.push({
            type: 'payment',
            date: group.date,
            reference: firstPayment.paymentNumber,
            amount: group.totalAmount,
            notes: excessAmount > 0 
              ? `Payment: ${appliedAmount} applied to invoice, ${excessAmount} added to advance (${availableAdvance} available)`
              : `Payment: ${saleBalances[group.saleId]} remaining on invoice`,
            paymentMethod: group.paymentMethod,
            invoiceReference: group.invoiceReference,
            remainingBalance: saleBalances[group.saleId],
            balanceAfter: saleBalances[group.saleId],
            advanceBalance: availableAdvance
          });
        }
      }
    }
    
    // First sort transactions by date
    transactions.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    // Then re-sort transactions to show invoice payments first, then advance payments
    // For transactions on the same date, prioritize invoice payments over advance payments
    transactions.sort((a, b) => {
      // First compare dates
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      const dateDiff = dateA - dateB;
      
      // If dates are different, maintain chronological order
      if (Math.abs(dateDiff) > 1000) { // Allow 1 second difference
        return dateDiff;
      }
      
      // For same date, prioritize invoice payments (positive or zero remainingBalance) 
      // over advance payments (negative remainingBalance)
      const aIsAdvance = a.remainingBalance < 0;
      const bIsAdvance = b.remainingBalance < 0;
      
      if (aIsAdvance && !bIsAdvance) return 1; // b comes first (invoice payment)
      if (!aIsAdvance && bIsAdvance) return -1; // a comes first (invoice payment)
      
      // If both are the same type, maintain the original order
      return 0;
    });
    
    // Get the final values
    let finalAdvanceBalance = availableAdvance;
    let finalRemainingBalance = Object.values(saleBalances).reduce((sum, balance) => sum + balance, 0);
    
    // Calculate summary
    const totalInvoiced = sales.reduce((sum, sale) => sum + sale.grandTotal, 0);
    
    // Calculate total paid differently - use the actual sales amounts and remaining balance
    const effectiveTotalPaid = totalInvoiced - finalRemainingBalance;
    
    // Calculate additional financial insights
    const paidPercentage = totalInvoiced > 0 ? ((effectiveTotalPaid / totalInvoiced) * 100).toFixed(2) : 0;
    
    // Calculate overdue amount
    const today = new Date();
    const overdueInvoices = sales.filter(sale => 
      sale.dueDate && new Date(sale.dueDate) < today && 
      ['unpaid', 'partially_paid', 'overdue'].includes(sale.paymentStatus)
    );
    
    const totalOverdue = overdueInvoices.reduce((sum, sale) => sum + sale.grandTotal, 0);
    
    // Count invoices by payment status
    const invoiceStatusCounts = {
      paid: sales.filter(sale => sale.paymentStatus === 'paid').length,
      partially_paid: sales.filter(sale => sale.paymentStatus === 'partially_paid').length,
      unpaid: sales.filter(sale => sale.paymentStatus === 'unpaid').length,
      overdue: sales.filter(sale => sale.paymentStatus === 'overdue').length
    };
    
    // Get advance payments (only the positive ones)
    const advancePayments = payments.filter(payment => 
      (payment.isAdvancePayment || payment.notes?.includes('advance')) && 
      payment.amount > 0
    );
    const totalAdvance = advancePayments.reduce((sum, payment) => sum + payment.amount, 0);
    
    // The actual current advance balance is what we've calculated through our transaction processing
    const actualAdvanceBalance = availableAdvance;
    
    res.json({
      status: 'success',
      data: {
        customer: {
          id: customer._id,
          name: customer.name,
          email: customer.email,
          phoneNumber: customer.phoneNumber
        },
        financialSummary: {
          totalInvoiced,
          totalPaid: totalInvoiced - finalRemainingBalance,
          totalRemaining: finalRemainingBalance,
          paidPercentage: totalInvoiced > 0 ? (((totalInvoiced - finalRemainingBalance) / totalInvoiced) * 100).toFixed(2) : 0,
          totalOverdue,
          totalAdvance,
          currentAdvanceBalance: actualAdvanceBalance
        },
        transactionSummary: {
          totalTransactions: transactions.length,
          invoiceCount: sales.length,
          paymentCount: payments.length,
          invoiceStatusCounts
        },
        transactions: transactions
      }
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
  applyAdvancePaymentToSale
}; 