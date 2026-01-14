const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const {
  getPartnershipAccounts,
  getPartnershipAccountById,
  createPartnershipAccount,
  updatePartnershipAccount,
  deletePartnershipAccount,
} = require('../controllers/partnershipAccountController');

// @route   GET /api/partnership-accounts
// @desc    Get all partnership accounts
// @access  Private
router.route('/').get(protect, getPartnershipAccounts);

// @route   POST /api/partnership-accounts
// @desc    Create new partnership account
// @access  Private
router.route('/').post(protect, createPartnershipAccount);

// @route   GET /api/partnership-accounts/:id
// @desc    Get partnership account by ID
// @access  Private
router.route('/:id').get(protect, getPartnershipAccountById);

// @route   PUT /api/partnership-accounts/:id
// @desc    Update partnership account
// @access  Private
router.route('/:id').put(protect, updatePartnershipAccount);

// @route   DELETE /api/partnership-accounts/:id
// @desc    Delete partnership account
// @access  Private
router.route('/:id').delete(protect, deletePartnershipAccount);

module.exports = router;

