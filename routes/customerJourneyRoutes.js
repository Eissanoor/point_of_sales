const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const {
  getCustomerJourney,
  getCustomerPayments
} = require('../controllers/customerJourneyController');

// Base: /api/customer-journey

router.route('/:customerId')
  .get(protect, getCustomerJourney);

router.route('/:customerId/payments')
  .get(protect, getCustomerPayments);

module.exports = router;


