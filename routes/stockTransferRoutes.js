const express = require('express');
const router = express.Router();
const {
  createStockTransfer,
  getStockTransfers,
  getStockTransferById,
  updateStockTransferStatus,
  deleteStockTransfer,
  getProductStockInLocation,
  getProductStockLocations,
  testStockCalculation,
  getStockTransfersByLocation
} = require('../controllers/stockTransferController');
const { protect, admin } = require('../middlewares/authMiddleware');

// All stock transfer routes require authentication
router.route('/')
  .post(protect, createStockTransfer)
  .get(protect, getStockTransfers);

// Get stock transfers by location
router.route('/by-location/:locationType/:locationId')
  .get(protect, getStockTransfersByLocation);

router.route('/:id')
  .get(protect, getStockTransferById)
  .delete(protect, deleteStockTransfer);

// Update stock transfer status
router.route('/:id/status')
  .put(protect, updateStockTransferStatus);

// Get product stock in location
router.route('/stock/:productId/:locationType/:locationId')
  .get(protect, getProductStockInLocation);

// Get all locations where a product has stock
router.route('/product-locations/:productId')
  .get(protect, getProductStockLocations);

// Test stock calculation for debugging
router.route('/test-stock/:productId/:locationType/:locationId')
  .get(protect, testStockCalculation);

module.exports = router;
