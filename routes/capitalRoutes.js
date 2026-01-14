const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const {
  getCapitals,
  getCapitalById,
  createCapital,
  updateCapital,
  deleteCapital,
} = require('../controllers/capitalController');

// @route   GET /api/capitals
// @desc    Get all capital entries
// @access  Private
router.route('/').get(protect, getCapitals);

// @route   POST /api/capitals
// @desc    Create new capital entry
// @access  Private
router.route('/').post(protect, createCapital);

// @route   GET /api/capitals/:id
// @desc    Get capital entry by ID
// @access  Private
router.route('/:id').get(protect, getCapitalById);

// @route   PUT /api/capitals/:id
// @desc    Update capital entry
// @access  Private
router.route('/:id').put(protect, updateCapital);

// @route   DELETE /api/capitals/:id
// @desc    Delete capital entry
// @access  Private
router.route('/:id').delete(protect, deleteCapital);

module.exports = router;

