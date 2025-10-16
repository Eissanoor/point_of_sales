const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Product = require('../models/productModel');
const Customer = require('../models/customerModel');
const Sales = require('../models/salesModel');
const Payment = require('../models/paymentModel');

// @desc    Get customer journey by customer ID (overview similar to supplier journey)
// @route   GET /api/customer-journey/:customerId
// @access  Private
const getCustomerJourney = asyncHandler(async (req, res) => {
  const customerId = req.params.customerId;

  // Validate customer exists
  const customer = await Customer.findById(customerId);
  if (!customer) {
    res.status(404);
    throw new Error('Customer not found');
  }

  // Aggregate sold products for this customer from Sales
  const soldAgg = await Sales.aggregate([
    { $match: { customer: new mongoose.Types.ObjectId(customerId), isActive: true } },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.product',
        totalSoldQty: { $sum: '$items.quantity' },
        totalSoldAmount: { $sum: '$items.total' }
      }
    }
  ]);

  const soldProductIds = soldAgg.map(row => row._id);
  const productIdToSold = new Map(
    soldAgg.map(row => [
      String(row._id),
      {
        qty: row.totalSoldQty || 0,
        amount: row.totalSoldAmount || 0
      }
    ])
  );

  // Fetch product details
  const products = await Product.find({ _id: { $in: soldProductIds } })
    .populate('category', 'name')
    .select('name saleRate category packingUnit');

  // Calculate summary statistics
  const productCount = products.length;
  const totalQuantity = products.reduce((sum, product) => {
    const sold = productIdToSold.get(String(product._id));
    const qty = sold ? sold.qty : 0;
    return sum + qty;
  }, 0);
  const totalAmount = products.reduce((sum, product) => {
    const sold = productIdToSold.get(String(product._id));
    const amount = sold ? sold.amount : 0;
    return sum + amount;
  }, 0);

  // Total payments received from this customer (exclude failed/refunded)
  const paymentsAgg = await Payment.aggregate([
    {
      $match: {
        customer: new mongoose.Types.ObjectId(customerId),
        status: { $nin: ['failed', 'refunded'] }
      }
    },
    { $group: { _id: null, totalPaid: { $sum: '$amount' } } }
  ]);
  const totalPayments = paymentsAgg.length > 0 ? (paymentsAgg[0].totalPaid || 0) : 0;

  // Format product details
  const productDetails = products.map(product => {
    const sold = productIdToSold.get(String(product._id));
    const qty = sold ? sold.qty : 0;
    const amount = sold ? sold.amount : 0;
    return {
      id: product._id,
      name: product.name,
      category: product.category ? product.category.name : 'Uncategorized',
      soldQuantity: qty,
      saleRate: product.saleRate || 0,
      totalValue: amount,
      packingUnit: product.packingUnit || ''
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

    const sold = productIdToSold.get(String(product._id));
    const qty = sold ? sold.qty : 0;
    const value = sold ? sold.amount : 0;
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
    customer: {
      id: customer._id,
      name: customer.name,
      email: customer.email,
      phoneNumber: customer.phoneNumber
    },
    summary: {
      productCount,
      totalQuantity,
      totalAmount,
      paidAmount: totalPayments,
      remainingBalance: totalAmount - totalPayments
    },
    products: productDetails,
    productsByCategory
  });
});

// @desc    Get customer payment summary (similar shape to supplier payments)
// @route   GET /api/customer-journey/:customerId/payments
// @access  Private
const getCustomerPayments = asyncHandler(async (req, res) => {
  const customerId = req.params.customerId;

  // Validate customer exists
  const customer = await Customer.findById(customerId);
  if (!customer) {
    res.status(404);
    throw new Error('Customer not found');
  }

  // Fetch payments for this customer
  const paymentEntries = await Payment.find({ customer: customerId })
    .sort({ paymentDate: -1 })
    .select('paymentNumber amount status notes paymentDate paymentMethod user')
    .populate('user', 'name');

  const totalPayments = paymentEntries.reduce((sum, p) => sum + (p.amount || 0), 0);

  const paymentsByStatus = paymentEntries.reduce((acc, p) => {
    const status = p.status || 'unknown';
    if (!acc[status]) acc[status] = 0;
    acc[status] += p.amount || 0;
    return acc;
  }, {});

  res.status(200).json({
    totalPayments,
    paymentsByStatus,
    paymentEntries
  });
});

module.exports = {
  getCustomerJourney,
  getCustomerPayments
};


