const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const {
  createFinancialPayment,
  getFinancialPayments,
  getFinancialPaymentById,
  updateFinancialPayment,
  deleteFinancialPayment,
  getFinancialPaymentsByRelated,
} = require('../controllers/financialPaymentController');

// @route   GET /api/financial-payments
// @desc    Get all financial payments
// @access  Private
router.route('/').get(protect, getFinancialPayments);

// @route   POST /api/financial-payments
// @desc    Create new financial payment
// @access  Private
router.route('/').post(protect, createFinancialPayment);

// @route   GET /api/financial-payments/related/:relatedModel/:relatedId
// @desc    Get financial payments by related model and id
// @access  Private
router
  .route('/related/:relatedModel/:relatedId')
  .get(protect, getFinancialPaymentsByRelated);

// @route   GET /api/financial-payments/:id
// @desc    Get financial payment by ID
// @access  Private
router.route('/:id').get(protect, getFinancialPaymentById);

// @route   PUT /api/financial-payments/:id
// @desc    Update financial payment
// @access  Private
router.route('/:id').put(protect, updateFinancialPayment);

// @route   DELETE /api/financial-payments/:id
// @desc    Delete financial payment
// @access  Private
router.route('/:id').delete(protect, deleteFinancialPayment);

module.exports = router;

