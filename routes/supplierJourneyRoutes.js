const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const {
  getSupplierJourney,
  getSupplierProducts,
  getSupplierPayments,
  createSupplierJourneyEntry,
  getSupplierJourneySummary
} = require('../controllers/supplierJourneyController');

// Base route is /api/supplier-journey

// Get all journey entries for a supplier
router.get('/:supplierId', protect, getSupplierJourney);

// Get supplier products summary
router.get('/:supplierId/products', protect, getSupplierProducts);

// Get supplier payments summary
router.get('/:supplierId/payments', protect, getSupplierPayments);

// Get supplier journey summary
router.get('/:supplierId/summary', protect, getSupplierJourneySummary);

// Create a new journey entry
router.post('/', protect, createSupplierJourneyEntry);

module.exports = router; 