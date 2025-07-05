const express = require('express');
const router = express.Router();
const {
  getCurrencies,
  getCurrencyById,
  createCurrency,
  updateCurrency,
  deleteCurrency
} = require('../controllers/currencyController');
const { protect, admin } = require('../middlewares/authMiddleware');

// Public routes
router.route('/')
  .get(getCurrencies)
  .post(protect, admin, createCurrency);

router.route('/:id')
  .get(getCurrencyById)
  .put(protect, admin, updateCurrency)
  .delete(protect, admin, deleteCurrency);

module.exports = router; 