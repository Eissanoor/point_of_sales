const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const SupplierPayment = require('../models/supplierPaymentModel');
const SupplierJourney = require('../models/supplierJourneyModel');
const Supplier = require('../models/supplierModel');
const Product = require('../models/productModel');
const Purchase = require('../models/purchaseModel');

// @desc    Create a new supplier payment
// @route   POST /api/supplier-payments
// @access  Private
const createSupplierPayment = asyncHandler(async (req, res) => {
  const { 
    supplier, 
    amount, 
    paymentMethod, 
    status, 
    notes, 
    attachments,
    currency,
    products
  } = req.body;

  // Validate supplier exists
  const supplierExists = await Supplier.findById(supplier);
  if (!supplierExists) {
    res.status(404);
    throw new Error('Supplier not found');
  }

  // Generate payment number
  const paymentCount = await SupplierPayment.countDocuments();
  const paymentNumber = `SP-${paymentCount + 1}`;
  
  // Generate transaction ID automatically
  const timestamp = new Date().getTime();
  const randomPart = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  const transactionId = `TRX-${timestamp}-${randomPart}`;
  
  // Set payment date to current date and time
  const paymentDate = new Date();

  // Create payment
  const payment = await SupplierPayment.create({
    paymentNumber,
    supplier,
    amount,
    paymentMethod,
    paymentDate,
    transactionId,
    status: status || 'completed',
    notes,
    attachments,
    user: req.user._id,
    isPartial: status === 'partial',
    currency,
    products: products || []
  });

  // Create supplier journey entry for this payment
  await SupplierJourney.create({
    supplier,
    user: req.user._id,
    action: 'payment_made',
    payment: {
      amount,
      method: paymentMethod,
      date: paymentDate,
      status: status || 'completed',
      transactionId
    },
    notes: `Payment of ${amount} made to supplier via ${paymentMethod}. Transaction ID: ${transactionId}. ${notes || ''}`
  });

  res.status(201).json(payment);
});

// @desc    Get all supplier payments
// @route   GET /api/supplier-payments
// @access  Private
const getSupplierPayments = asyncHandler(async (req, res) => {
  const payments = await SupplierPayment.find({})
    .sort({ createdAt: -1 })
    .populate('supplier', 'name email phoneNumber')
    .populate('user', 'name')
    .populate('currency', 'name symbol')
    .populate({
      path: 'products.product',
      select: 'name purchaseRate'
    });

  res.status(200).json(payments);
});

// @desc    Get supplier payments by supplier ID
// @route   GET /api/supplier-payments/supplier/:supplierId
// @access  Private
const getPaymentsBySupplier = asyncHandler(async (req, res) => {
  const supplierId = req.params.supplierId;

  // Validate supplier exists
  const supplier = await Supplier.findById(supplierId);
  if (!supplier) {
    res.status(404);
    throw new Error('Supplier not found');
  }

  const payments = await SupplierPayment.find({ supplier: supplierId })
    .sort({ paymentDate: -1 })
    .populate('user', 'name')
    .populate('currency', 'name symbol')
    .populate({
      path: 'products.product',
      select: 'name purchaseRate'
    });

  // Calculate total payments
  const totalPayments = payments.reduce((sum, payment) => {
    return sum + payment.amount;
  }, 0);

  // Calculate total purchases for this supplier (active purchases only)
  const purchasesAgg = await Purchase.aggregate([
    { $match: { supplier: new mongoose.Types.ObjectId(supplierId), isActive: true } },
    {
      $group: {
        _id: null,
        totalPurchasesAmount: { $sum: '$totalAmount' }
      }
    }
  ]);
  const totalPurchasesAmount = purchasesAgg.length > 0 ? (purchasesAgg[0].totalPurchasesAmount || 0) : 0;
  const balance = totalPurchasesAmount - totalPayments;

  res.status(200).json({
    supplier: {
      id: supplier._id,
      name: supplier.name,
      email: supplier.email,
      phoneNumber: supplier.phoneNumber
    },
    totalPayments,
    totalPurchasesAmount,
    balance,
    count: payments.length,
    payments
  });
});

// @desc    Get supplier payment by ID
// @route   GET /api/supplier-payments/:id
// @access  Private
const getSupplierPaymentById = asyncHandler(async (req, res) => {
  const payment = await SupplierPayment.findById(req.params.id)
    .populate('supplier', 'name email phoneNumber')
    .populate('user', 'name')
    .populate('currency', 'name symbol')
    .populate({
      path: 'products.product',
      select: 'name purchaseRate'
    });

  if (!payment) {
    res.status(404);
    throw new Error('Payment not found');
  }

  res.status(200).json(payment);
});

// @desc    Update supplier payment
// @route   PUT /api/supplier-payments/:id
// @access  Private
const updateSupplierPayment = asyncHandler(async (req, res) => {
  const payment = await SupplierPayment.findById(req.params.id);

  if (!payment) {
    res.status(404);
    throw new Error('Payment not found');
  }

  const { 
    amount, 
    paymentMethod, 
    paymentDate, 
    transactionId, 
    status, 
    notes, 
    attachments,
    currency,
    products
  } = req.body;

  // Track changes for journey entry
  const changes = [];
  if (amount !== undefined && amount !== payment.amount) {
    changes.push({
      field: 'amount',
      oldValue: payment.amount,
      newValue: amount
    });
  }

  if (paymentMethod !== undefined && paymentMethod !== payment.paymentMethod) {
    changes.push({
      field: 'paymentMethod',
      oldValue: payment.paymentMethod,
      newValue: paymentMethod
    });
  }

  if (status !== undefined && status !== payment.status) {
    changes.push({
      field: 'status',
      oldValue: payment.status,
      newValue: status
    });
  }

  // Update payment
  const updatedPayment = await SupplierPayment.findByIdAndUpdate(
    req.params.id,
    {
      amount: amount || payment.amount,
      paymentMethod: paymentMethod || payment.paymentMethod,
      paymentDate: paymentDate || payment.paymentDate,
      transactionId: transactionId || payment.transactionId,
      status: status || payment.status,
      notes: notes || payment.notes,
      attachments: attachments || payment.attachments,
      isPartial: status === 'partial',
      currency: currency || payment.currency,
      products: products || payment.products
    },
    { new: true }
  )
    .populate('supplier', 'name email phoneNumber')
    .populate('user', 'name')
    .populate('currency', 'name symbol')
    .populate({
      path: 'products.product',
      select: 'name purchaseRate'
    });

  // Create supplier journey entry for this payment update
  if (changes.length > 0) {
    await SupplierJourney.create({
      supplier: payment.supplier,
      user: req.user._id,
      action: 'payment_updated',
      payment: {
        amount: amount || payment.amount,
        method: paymentMethod || payment.paymentMethod,
        date: paymentDate || payment.paymentDate,
        status: status || payment.status,
        transactionId: transactionId || payment.transactionId
      },
      changes,
      notes: `Payment updated. ${notes || ''}`
    });
  }

  res.status(200).json(updatedPayment);
});

// @desc    Delete supplier payment
// @route   DELETE /api/supplier-payments/:id
// @access  Private
const deleteSupplierPayment = asyncHandler(async (req, res) => {
  const payment = await SupplierPayment.findById(req.params.id);

  if (!payment) {
    res.status(404);
    throw new Error('Payment not found');
  }

  await payment.remove();

  // Create supplier journey entry for payment deletion
  await SupplierJourney.create({
    supplier: payment.supplier,
    user: req.user._id,
    action: 'payment_updated',
    payment: {
      amount: payment.amount,
      method: payment.paymentMethod,
      date: payment.paymentDate,
      status: 'deleted',
      transactionId: payment.transactionId
    },
    notes: `Payment deleted.`
  });

  res.status(200).json({ message: 'Payment removed' });
});

// @desc    Get supplier payment summary
// @route   GET /api/supplier-payments/summary
// @access  Private
const getSupplierPaymentSummary = asyncHandler(async (req, res) => {
  // Get total payments
  const totalPayments = await SupplierPayment.aggregate([
    {
      $group: {
        _id: null,
        total: { $sum: '$amount' }
      }
    }
  ]);

  // Get payments by method
  const paymentsByMethod = await SupplierPayment.aggregate([
    {
      $group: {
        _id: '$paymentMethod',
        total: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    }
  ]);

  // Get payments by status
  const paymentsByStatus = await SupplierPayment.aggregate([
    {
      $group: {
        _id: '$status',
        total: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    }
  ]);

  // Get recent payments
  const recentPayments = await SupplierPayment.find({})
    .sort({ paymentDate: -1 })
    .limit(5)
    .populate('supplier', 'name')
    .populate('user', 'name');

  res.status(200).json({
    totalAmount: totalPayments.length > 0 ? totalPayments[0].total : 0,
    paymentsByMethod,
    paymentsByStatus,
    recentPayments
  });
});

module.exports = {
  createSupplierPayment,
  getSupplierPayments,
  getPaymentsBySupplier,
  getSupplierPaymentById,
  updateSupplierPayment,
  deleteSupplierPayment,
  getSupplierPaymentSummary
}; 