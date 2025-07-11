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
  getCustomerPaymentAnalytics
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

router.route('/sale/:saleId')
  .get(protect, getPaymentsBySaleId);

router.route('/customer/:customerId/analytics')
  .get(protect, getCustomerPaymentAnalytics);

router.route('/:id')
  .get(protect, getPaymentById)
  .put(protect, updatePayment)
  .delete(protect, admin, deletePayment);

router.route('/:id/journey')
  .get(protect, getPaymentJourney);

module.exports = router; 