const express = require('express');
const router = express.Router();
const {
  getCurrencies,
  getCurrencyById,
  createCurrency,
  updateCurrency,
  deleteCurrency,
  getBaseCurrency,
  getExchangeRateHistory,
  updateExchangeRate,
  getExchangeRateAtDate,
  convertCurrency,
  bulkUpdateExchangeRates
} = require('../controllers/currencyController');
const { protect, admin } = require('../middlewares/authMiddleware');

// Public routes
router.route('/')
  .get(getCurrencies)
  .post(protect, admin, createCurrency);

router.route('/base')
  .get(getBaseCurrency);

router.route('/convert')
  .get(convertCurrency);

router.route('/bulk-update-rates')
  .post(protect, admin, bulkUpdateExchangeRates);

router.route('/:id')
  .get(getCurrencyById)
  .put(protect, admin, updateCurrency)
  .delete(protect, admin, deleteCurrency);

// Exchange rate routes
router.route('/:id/exchange-history')
  .get(protect, getExchangeRateHistory);

router.route('/:id/exchange-rate')
  .post(protect, admin, updateExchangeRate);

router.route('/:id/exchange-rate-at-date')
  .get(protect, getExchangeRateAtDate);

module.exports = router; 