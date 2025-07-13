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
  getCustomerTransactionHistory
} = require('../controllers/paymentController');
const { protect } = require('../middlewares/authMiddleware');

// Routes that don't need a specific ID
router.route('/')
  .get(protect, getPayments)
  .post(protect, createPayment);

router.route('/stats')
  .get(protect, getPaymentStats);

router.route('/check-overdue')
  .get(protect, checkOverduePayments);

router.route('/customer')
  .post(protect, createCustomerPayment);

// Routes that need a specific ID
router.route('/:id')
  .get(protect, getPaymentById)
  .put(protect, updatePayment)
  .delete(protect, deletePayment);

router.route('/:id/journey')
  .get(protect, getPaymentJourney);

router.route('/sale/:saleId')
  .get(protect, getPaymentsBySaleId);

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

module.exports = router; 