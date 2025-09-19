const express = require('express');
const router = express.Router();
const {
  getShipments,
  getShipmentById,
  createShipment,
  updateShipment,
  deleteShipment,
  updateShipmentStatus,
  getShipmentAnalytics
} = require('../controllers/shipmentController');

// Import middleware (assuming you have auth middleware)
// const { protect, admin } = require('../middlewares/authMiddleware');

// @route   GET /api/shipments
// @desc    Get all shipments with filtering and pagination
// @access  Private
router.get('/', getShipments);

// @route   GET /api/shipments/analytics
// @desc    Get shipment analytics and summary
// @access  Private
router.get('/analytics', getShipmentAnalytics);

// @route   GET /api/shipments/:id
// @desc    Get single shipment by ID
// @access  Private
router.get('/:id', getShipmentById);

// @route   POST /api/shipments
// @desc    Create new shipment
// @access  Private
router.post('/', createShipment);

// @route   PUT /api/shipments/:id
// @desc    Update shipment
// @access  Private
router.put('/:id', updateShipment);

// @route   PUT /api/shipments/:id/status
// @desc    Update shipment status
// @access  Private
router.put('/:id/status', updateShipmentStatus);

// @route   DELETE /api/shipments/:id
// @desc    Delete shipment (soft delete)
// @access  Private
router.delete('/:id', deleteShipment);

module.exports = router;
