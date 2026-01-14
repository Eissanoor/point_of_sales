const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const {
  getLiabilities,
  getLiabilityById,
  createLiability,
  updateLiability,
  deleteLiability,
} = require('../controllers/liabilityController');

// @route   GET /api/liabilities
// @desc    Get all liabilities
// @access  Private
router.route('/').get(protect, getLiabilities);

// @route   POST /api/liabilities
// @desc    Create new liability
// @access  Private
router.route('/').post(protect, createLiability);

// @route   GET /api/liabilities/:id
// @desc    Get liability by ID
// @access  Private
router.route('/:id').get(protect, getLiabilityById);

// @route   PUT /api/liabilities/:id
// @desc    Update liability
// @access  Private
router.route('/:id').put(protect, updateLiability);

// @route   DELETE /api/liabilities/:id
// @desc    Delete liability
// @access  Private
router.route('/:id').delete(protect, deleteLiability);

module.exports = router;

