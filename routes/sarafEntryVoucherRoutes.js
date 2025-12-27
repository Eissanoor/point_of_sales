const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middlewares/authMiddleware');
const { uploadSingleAttachment } = require('../middlewares/uploadMiddleware');
const {
  getSarafEntryVouchers,
  getSarafEntryVoucherById,
  createSarafEntryVoucher,
  updateSarafEntryVoucher,
  approveSarafEntryVoucher,
  rejectSarafEntryVoucher,
  completeSarafEntryVoucher,
  cancelSarafEntryVoucher,
  deleteSarafEntryVoucher,
  getVouchersByCurrency,
} = require('../controllers/sarafEntryVoucherController');

// @route   GET /api/saraf-entry-vouchers
// @desc    Get all saraf entry vouchers
// @access  Private
router.route('/').get(protect, getSarafEntryVouchers);

// @route   POST /api/saraf-entry-vouchers
// @desc    Create new saraf entry voucher (supports file upload)
// @access  Private
// @field   attachment - File field name for uploading a single attachment file
router.route('/').post(protect, uploadSingleAttachment, createSarafEntryVoucher);

// @route   GET /api/saraf-entry-vouchers/currency/:currencyId
// @desc    Get saraf entry vouchers by currency
// @access  Private
router.route('/currency/:currencyId').get(protect, getVouchersByCurrency);

// @route   GET /api/saraf-entry-vouchers/:id
// @desc    Get saraf entry voucher by ID
// @access  Private
router.route('/:id').get(protect, getSarafEntryVoucherById);

// @route   PUT /api/saraf-entry-vouchers/:id
// @desc    Update saraf entry voucher (supports file upload)
// @access  Private
// @field   attachment - File field name for uploading a single attachment file
router.route('/:id').put(protect, uploadSingleAttachment, updateSarafEntryVoucher);

// @route   DELETE /api/saraf-entry-vouchers/:id
// @desc    Delete saraf entry voucher
// @access  Private
router.route('/:id').delete(protect, deleteSarafEntryVoucher);

// @route   PUT /api/saraf-entry-vouchers/:id/approve
// @desc    Approve saraf entry voucher
// @access  Private
router.route('/:id/approve').put(protect, approveSarafEntryVoucher);

// @route   PUT /api/saraf-entry-vouchers/:id/reject
// @desc    Reject saraf entry voucher
// @access  Private
router.route('/:id/reject').put(protect, rejectSarafEntryVoucher);

// @route   PUT /api/saraf-entry-vouchers/:id/complete
// @desc    Complete saraf entry voucher
// @access  Private
router.route('/:id/complete').put(protect, completeSarafEntryVoucher);

// @route   PUT /api/saraf-entry-vouchers/:id/cancel
// @desc    Cancel saraf entry voucher
// @access  Private
router.route('/:id/cancel').put(protect, cancelSarafEntryVoucher);

module.exports = router;

