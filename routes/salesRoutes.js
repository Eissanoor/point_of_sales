const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middlewares/authMiddleware');
const {
  createSale,
  getSales,
  getSalesByLocation,
  getSaleById,
  getSaleInvoiceById,
  updateSale,
  deleteSale,
  getSalesByCustomer,
  getSalesByCustomerId,
} = require('../controllers/salesController');

router.route('/')
  .post(protect, createSale)
  .get(protect, getSales);

router.route('/by-location/:locationType/:locationId')
  .get(protect, getSalesByLocation);

router.route('/by-customer')
  .get(protect, getSalesByCustomer);

router.route('/customer/:customerId')
  .get(protect, getSalesByCustomerId);

router.route('/invoice/:saleId')
  .get(protect, getSaleInvoiceById);

router.route('/:id')
  .get(protect, getSaleById)
  .put(protect, updateSale)
  .delete(protect, admin, deleteSale);

module.exports = router; 