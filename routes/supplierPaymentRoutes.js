const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const {
  createSupplierPayment,
  getSupplierPayments,
  getPaymentsBySupplier,
  getSupplierPaymentById,
  updateSupplierPayment,
  deleteSupplierPayment,
  getSupplierPaymentSummary
} = require('../controllers/supplierPaymentController');

// Base route is /api/supplier-payments

// Get all supplier payments and create new payment
router.route('/')
  .get(protect, getSupplierPayments)
  .post(protect, createSupplierPayment);

// Get supplier payment summary
router.get('/summary', protect, getSupplierPaymentSummary);

// Get payments by supplier ID
router.get('/supplier/:supplierId', protect, getPaymentsBySupplier);

// Get, update, and delete payment by ID
router.route('/:id')
  .get(protect, getSupplierPaymentById)
  .put(protect, updateSupplierPayment)
  .delete(protect, deleteSupplierPayment);

module.exports = router; 