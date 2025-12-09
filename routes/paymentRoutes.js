const express = require('express');
const router = express.Router();
const { 
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
} = require('../controllers/paymentController');
const { protect } = require('../middlewares/authMiddleware');
const { uploadMultiple } = require('../middlewares/uploadMiddleware');

// Routes that don't need a specific ID
router.route('/')
  .get(protect, getPayments)
  .post(protect, uploadMultiple, createPayment);

router.route('/stats')
  .get(protect, getPaymentStats);

router.route('/summary')
  .get(protect, getPaymentSummary);

router.route('/analytics')
  .get(protect, getPaymentAnalytics);

router.route('/check-overdue')
  .get(protect, checkOverduePayments);

router.route('/customer')
  .post(protect, uploadMultiple, createCustomerPayment);

router.route('/apply-customer-advance')
  .post(protect, applyAdvancePaymentToSale);

// Routes that need a specific ID
router.route('/:id')
  .get(protect, getPaymentById)
  .put(protect, uploadMultiple, updatePayment)
  .delete(protect, deletePayment);

router.route('/:id/journey')
  .get(protect, getPaymentJourney);

router.route('/sale/:saleId')
  .get(protect, getPaymentsBySaleId);

router.route('/customer/:customerId')
  .get(protect, getPaymentsByCustomer);

router.route('/customer/:customerId/analytics')
  .get(protect, getCustomerPaymentAnalytics);

router.route('/customer/:customerId/advance')
  .get(protect, getCustomerAdvancePayments);

// Routes for customer payment journey
router.route('/customer/:customerId/journey')
  .get(protect, getPaymentJourneyByCustomerId);

// Route for simplified customer transaction history
router.route('/customer/:customerId/transactions')
  .get(protect, getCustomerTransactionHistory);

// Refund routes
router.route('/:id/refund')
  .post(protect, createRefund);

module.exports = router; 