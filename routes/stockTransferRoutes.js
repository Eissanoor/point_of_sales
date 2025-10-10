const express = require('express');
const router = express.Router();
const {
  createStockTransfer,
  getStockTransfers,
  getStockTransferById,
  updateStockTransferStatus,
  deleteStockTransfer,
  getProductStockInLocation
} = require('../controllers/stockTransferController');
const { protect, admin } = require('../middlewares/authMiddleware');

// All stock transfer routes require authentication
router.route('/')
  .post(protect, createStockTransfer)
  .get(protect, getStockTransfers);

router.route('/:id')
  .get(protect, getStockTransferById)
  .delete(protect, deleteStockTransfer);

// Update stock transfer status
router.route('/:id/status')
  .put(protect, updateStockTransferStatus);

// Get product stock in location
router.route('/stock/:productId/:locationType/:locationId')
  .get(protect, getProductStockInLocation);

module.exports = router;
