const express = require('express');
const router = express.Router();
const {
  getTransporters,
  getTransporterById,
  createTransporter,
  updateTransporter,
  deleteTransporter
} = require('../controllers/transporterController');

// @route   GET /api/transporters
// @desc    Get all transporters with filtering and pagination
// @access  Private
router.get('/', getTransporters);

// @route   GET /api/transporters/:id
// @desc    Get single transporter by ID
// @access  Private
router.get('/:id', getTransporterById);

// @route   POST /api/transporters
// @desc    Create new transporter
// @access  Private
router.post('/', createTransporter);

// @route   PUT /api/transporters/:id
// @desc    Update transporter
// @access  Private
router.put('/:id', updateTransporter);

// @route   DELETE /api/transporters/:id
// @desc    Delete transporter (soft delete)
// @access  Private
router.delete('/:id', deleteTransporter);

module.exports = router;
