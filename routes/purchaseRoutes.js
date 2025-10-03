const express = require('express');
const router = express.Router();
const {
  getPurchases,
  getPurchaseById,
  createPurchase,
  updatePurchase,
  deletePurchase,
  getPurchaseStats,
  getPurchasesByProduct,
} = require('../controllers/purchaseController');
const { protect, admin } = require('../middlewares/authMiddleware');

// @route   GET /api/purchases
// @desc    Get all purchases
// @access  Private
router.route('/').get(protect, getPurchases);

// @route   POST /api/purchases
// @desc    Create new purchase
// @access  Private
router.route('/').post(protect, createPurchase);

// @route   GET /api/purchases/stats
// @desc    Get purchase statistics
// @access  Private
router.route('/stats').get(protect, getPurchaseStats);

// @route   GET /api/purchases/product/:productId
// @desc    Get purchases by product
// @access  Private
router.route('/product/:productId').get(protect, getPurchasesByProduct);

// @route   GET /api/purchases/:id
// @desc    Get purchase by ID
// @access  Private
router.route('/:id').get(protect, getPurchaseById);

// @route   PUT /api/purchases/:id
// @desc    Update purchase
// @access  Private
router.route('/:id').put(protect, updatePurchase);

// @route   DELETE /api/purchases/:id
// @desc    Delete purchase
// @access  Private
router.route('/:id').delete(protect, deletePurchase);

module.exports = router;
