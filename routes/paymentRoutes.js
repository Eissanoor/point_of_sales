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
  getCustomerAdvancePayments
} = require('../controllers/paymentController');
const { protect, admin } = require('../middlewares/authMiddleware');

// Routes for payments
router.route('/')
  .post(protect, createPayment)
  .get(protect, getPayments);

router.route('/stats')
  .get(protect, getPaymentStats);

router.route('/check-overdue')
  .get(protect, admin, checkOverduePayments);

// New route for creating payment by customer ID
router.route('/customer')
  .post(protect, createCustomerPayment);

router.route('/sale/:saleId')
  .get(protect, getPaymentsBySaleId);

router.route('/customer/:customerId/analytics')
  .get(protect, getCustomerPaymentAnalytics);

// New route for getting customer advance payments
router.route('/customer/:customerId/advance')
  .get(protect, getCustomerAdvancePayments);

router.route('/:id')
  .get(protect, getPaymentById)
  .put(protect, updatePayment)
  .delete(protect, admin, deletePayment);

router.route('/:id/journey')
  .get(protect, getPaymentJourney);

module.exports = router; 