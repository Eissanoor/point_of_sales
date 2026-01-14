const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const {
  getPropertyAccounts,
  getPropertyAccountById,
  createPropertyAccount,
  updatePropertyAccount,
  deletePropertyAccount,
} = require('../controllers/propertyAccountController');

// @route   GET /api/property-accounts
// @desc    Get all property accounts
// @access  Private
router.route('/').get(protect, getPropertyAccounts);

// @route   POST /api/property-accounts
// @desc    Create new property account
// @access  Private
router.route('/').post(protect, createPropertyAccount);

// @route   GET /api/property-accounts/:id
// @desc    Get property account by ID
// @access  Private
router.route('/:id').get(protect, getPropertyAccountById);

// @route   PUT /api/property-accounts/:id
// @desc    Update property account
// @access  Private
router.route('/:id').put(protect, updatePropertyAccount);

// @route   DELETE /api/property-accounts/:id
// @desc    Delete property account
// @access  Private
router.route('/:id').delete(protect, deletePropertyAccount);

module.exports = router;

