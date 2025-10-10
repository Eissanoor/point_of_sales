const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const SupplierJourney = require('../models/supplierJourneyModel');
const Product = require('../models/productModel');
const Supplier = require('../models/supplierModel');
const Purchase = require('../models/purchaseModel');
const SupplierPayment = require('../models/supplierPaymentModel');

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

  // Derive purchased products for this supplier directly from purchases (robust to missing Product.supplier)
  const purchasedAgg = await Purchase.aggregate([
    { $match: { supplier: new mongoose.Types.ObjectId(supplierId), isActive: true } },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.product',
        totalPurchasedQty: { $sum: '$items.quantity' },
        totalPurchasedAmount: { $sum: { $multiply: ['$items.quantity', '$items.purchaseRate'] } }
      }
    }
  ]);

  const purchasedProductIds = purchasedAgg.map(row => row._id);
  const productIdToPurchased = new Map(
    purchasedAgg.map(row => [
      String(row._id),
      {
        qty: row.totalPurchasedQty || 0,
        amount: row.totalPurchasedAmount || 0
      }
    ])
  );

  // Fetch product details for purchased products
  const products = await Product.find({ _id: { $in: purchasedProductIds } })
    .populate('category', 'name')
    .select('name purchaseRate soldOutQuantity category packingUnit');
  
  // Calculate summary statistics
  const productCount = products.length;
  const totalQuantity = products.reduce((sum, product) => {
    const purchased = productIdToPurchased.get(String(product._id));
    const qty = purchased ? purchased.qty : 0;
    return sum + qty;
  }, 0);
  // Use aggregated purchase amounts to avoid depending on Product.purchaseRate accuracy
  const totalAmount = products.reduce((sum, product) => {
    const purchased = productIdToPurchased.get(String(product._id));
    const amount = purchased ? purchased.amount : 0;
    return sum + amount;
  }, 0);
  const soldQuantity = products.reduce((sum, product) => sum + (product.soldOutQuantity || 0), 0);
  const soldAmount = products.reduce((sum, product) => sum + ((product.purchaseRate || 0) * (product.soldOutQuantity || 0)), 0);

  // Calculate total payments made to this supplier (exclude failed/refunded)
  const paymentsAgg = await SupplierPayment.aggregate([
    { 
      $match: { 
        supplier: new mongoose.Types.ObjectId(supplierId), 
        status: { $nin: ['failed', 'refunded'] }
      } 
    },
    { $group: { _id: null, totalPaid: { $sum: '$amount' } } }
  ]);
  const totalPayments = paymentsAgg.length > 0 ? (paymentsAgg[0].totalPaid || 0) : 0;

  // Format product details for response
  const productDetails = products.map(product => {
    const purchased = productIdToPurchased.get(String(product._id));
    const qty = purchased ? purchased.qty : 0;
    const amount = purchased ? purchased.amount : 0;
    return {
      id: product._id,
      name: product.name,
      category: product.category ? product.category.name : 'Uncategorized',
      availableQuantity: qty,
      soldQuantity: product.soldOutQuantity || 0,
      purchaseRate: product.purchaseRate || 0,
      totalValue: amount,
      soldValue: ((product.purchaseRate || 0) * (product.soldOutQuantity || 0)) || 0,
      packingUnit: product.packingUnit || '',
    };
  });

  // Group products by category
  const productsByCategory = products.reduce((acc, product) => {
    const categoryName = product.category ? product.category.name : 'Uncategorized';
    const categoryId = product.category ? product.category._id.toString() : 'uncategorized';
    
    if (!acc[categoryId]) {
      acc[categoryId] = {
        name: categoryName,
        count: 0,
        quantity: 0,
        amount: 0,
        products: []
      };
    }
    
    const purchased = productIdToPurchased.get(String(product._id));
    const qty = purchased ? purchased.qty : 0;
    const value = purchased ? purchased.amount : 0;
    acc[categoryId].count += 1;
    acc[categoryId].quantity += qty;
    acc[categoryId].amount += value;
    acc[categoryId].products.push({
      id: product._id,
      name: product.name,
      quantity: qty,
      value: value
    });
    
    return acc;
  }, {});

  res.status(200).json({
    supplier: {
      id: supplier._id,
      name: supplier.name,
      email: supplier.email,
      phoneNumber: supplier.phoneNumber
    },
    summary: {
      productCount,
      totalQuantity,
      totalAmount,
      soldQuantity,
      soldAmount,
      paidAmount: totalPayments,
      remainingBalance: totalAmount - totalPayments
    },
    products: productDetails,
    productsByCategory
  });
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

  // Get total payments from SupplierPayment (exclude failed/refunded)
  const summaryPaymentsAgg = await SupplierPayment.aggregate([
    { 
      $match: { 
        supplier: new mongoose.Types.ObjectId(supplierId), 
        status: { $nin: ['failed', 'refunded'] }
      } 
    },
    { $group: { _id: null, totalPaid: { $sum: '$amount' } } }
  ]);
  const totalPayments = summaryPaymentsAgg.length > 0 ? (summaryPaymentsAgg[0].totalPaid || 0) : 0;

  // Calculate balance (purchased value - total payments)
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