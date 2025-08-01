const asyncHandler = require('express-async-handler');
const SupplierJourney = require('../models/supplierJourneyModel');
const Product = require('../models/productModel');
const Supplier = require('../models/supplierModel');

// @desc    Get supplier journey by supplier ID
// @route   GET /api/supplier-journey/:supplierId
// @access  Private
const getSupplierJourney = asyncHandler(async (req, res) => {
  const supplierId = req.params.supplierId;

  // Validate supplier exists
  const supplier = await Supplier.findById(supplierId);
  if (!supplier) {
    res.status(404);
    throw new Error('Supplier not found');
  }

  // Get all journey entries for this supplier
  const journeyEntries = await SupplierJourney.find({ supplier: supplierId })
    .sort({ createdAt: -1 })
    .populate('user', 'name')
    .populate('product', 'name price purchaseRate')
    .populate('supplier', 'name');

  res.status(200).json(journeyEntries);
});

// @desc    Get supplier product summary
// @route   GET /api/supplier-journey/:supplierId/products
// @access  Private
const getSupplierProducts = asyncHandler(async (req, res) => {
  const supplierId = req.params.supplierId;

  // Validate supplier exists
  const supplier = await Supplier.findById(supplierId);
  if (!supplier) {
    res.status(404);
    throw new Error('Supplier not found');
  }

  // Get all products for this supplier
  const products = await Product.find({ supplier: supplierId })
    .select('name purchaseRate availableQuantity soldOutQuantity createdAt')
    .sort({ createdAt: -1 });

  // Calculate total products and total value
  const totalProducts = products.length;
  const totalValue = products.reduce((sum, product) => {
    return sum + (product.purchaseRate * product.availableQuantity);
  }, 0);

  const totalSoldValue = products.reduce((sum, product) => {
    return sum + (product.purchaseRate * product.soldOutQuantity);
  }, 0);

  res.status(200).json({
    totalProducts,
    totalValue,
    totalSoldValue,
    products
  });
});

// @desc    Get supplier payment summary
// @route   GET /api/supplier-journey/:supplierId/payments
// @access  Private
const getSupplierPayments = asyncHandler(async (req, res) => {
  const supplierId = req.params.supplierId;

  // Validate supplier exists
  const supplier = await Supplier.findById(supplierId);
  if (!supplier) {
    res.status(404);
    throw new Error('Supplier not found');
  }

  // Get all payment entries for this supplier
  const paymentEntries = await SupplierJourney.find({ 
    supplier: supplierId,
    action: { $in: ['payment_made', 'payment_updated'] }
  })
  .sort({ 'payment.date': -1 })
  .select('payment notes createdAt user')
  .populate('user', 'name');

  // Calculate total payments
  const totalPayments = paymentEntries.reduce((sum, entry) => {
    return sum + (entry.payment?.amount || 0);
  }, 0);

  // Group payments by status
  const paymentsByStatus = paymentEntries.reduce((acc, entry) => {
    const status = entry.payment?.status || 'unknown';
    if (!acc[status]) {
      acc[status] = 0;
    }
    acc[status] += entry.payment?.amount || 0;
    return acc;
  }, {});

  res.status(200).json({
    totalPayments,
    paymentsByStatus,
    paymentEntries
  });
});

// @desc    Create a supplier journey entry
// @route   POST /api/supplier-journey
// @access  Private
const createSupplierJourneyEntry = asyncHandler(async (req, res) => {
  const { 
    supplier, 
    action, 
    product, 
    payment, 
    changes, 
    notes 
  } = req.body;

  // Validate supplier exists
  const supplierExists = await Supplier.findById(supplier);
  if (!supplierExists) {
    res.status(404);
    throw new Error('Supplier not found');
  }

  // Validate product if provided
  if (product) {
    const productExists = await Product.findById(product);
    if (!productExists) {
      res.status(404);
      throw new Error('Product not found');
    }
    
    // Check if product belongs to this supplier
    if (productExists.supplier.toString() !== supplier) {
      res.status(400);
      throw new Error('Product does not belong to this supplier');
    }
  }

  // Create journey entry
  const journeyEntry = await SupplierJourney.create({
    supplier,
    user: req.user._id,
    action,
    product,
    payment,
    changes,
    notes
  });

  res.status(201).json(journeyEntry);
});

// @desc    Get supplier journey summary
// @route   GET /api/supplier-journey/:supplierId/summary
// @access  Private
const getSupplierJourneySummary = asyncHandler(async (req, res) => {
  const supplierId = req.params.supplierId;

  // Validate supplier exists
  const supplier = await Supplier.findById(supplierId);
  if (!supplier) {
    res.status(404);
    throw new Error('Supplier not found');
  }

  // Get product count and total value
  const products = await Product.find({ supplier: supplierId });
  const totalProducts = products.length;
  const totalProductValue = products.reduce((sum, product) => {
    return sum + (product.purchaseRate * product.availableQuantity);
  }, 0);

  // Get total sold products value
  const totalSoldValue = products.reduce((sum, product) => {
    return sum + (product.purchaseRate * product.soldOutQuantity);
  }, 0);

  // Get payment information
  const paymentEntries = await SupplierJourney.find({ 
    supplier: supplierId,
    action: { $in: ['payment_made', 'payment_updated'] }
  });

  const totalPayments = paymentEntries.reduce((sum, entry) => {
    return sum + (entry.payment?.amount || 0);
  }, 0);

  // Calculate balance (total product value - total payments)
  const balance = totalProductValue - totalPayments;

  // Get recent activity
  const recentActivity = await SupplierJourney.find({ supplier: supplierId })
    .sort({ createdAt: -1 })
    .limit(5)
    .populate('user', 'name')
    .populate('product', 'name');

  res.status(200).json({
    supplier: {
      id: supplier._id,
      name: supplier.name,
      email: supplier.email,
      phoneNumber: supplier.phoneNumber,
    },
    summary: {
      totalProducts,
      totalProductValue,
      totalSoldValue,
      totalPayments,
      balance
    },
    recentActivity
  });
});

module.exports = {
  getSupplierJourney,
  getSupplierProducts,
  getSupplierPayments,
  createSupplierJourneyEntry,
  getSupplierJourneySummary
}; 