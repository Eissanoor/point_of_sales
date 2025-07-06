const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middlewares/authMiddleware');
const {
  createSale,
  getSales,
  getSaleById,
  updateSale,
  deleteSale,
  getSalesByCustomer,
  getSalesByCustomerId,
} = require('../controllers/salesController');

router.route('/')
  .post(protect, createSale)
  .get(protect, getSales);

router.route('/by-customer')
  .get(protect, getSalesByCustomer);

router.route('/customer/:customerId')
  .get(protect, getSalesByCustomerId);

router.route('/:id')
  .get(protect, getSaleById)
  .put(protect, updateSale)
  .delete(protect, admin, deleteSale);

module.exports = router; 