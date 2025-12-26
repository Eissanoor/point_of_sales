const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middlewares/authMiddleware');
const { uploadSingleAttachment } = require('../middlewares/uploadMiddleware');
const {
  getJournalPaymentVouchers,
  getJournalPaymentVoucherById,
  createJournalPaymentVoucher,
  updateJournalPaymentVoucher,
  approveJournalPaymentVoucher,
  rejectJournalPaymentVoucher,
  postJournalPaymentVoucher,
  cancelJournalPaymentVoucher,
  deleteJournalPaymentVoucher,
} = require('../controllers/journalPaymentVoucherController');

// @route   GET /api/journal-payment-vouchers
// @desc    Get all journal payment vouchers
// @access  Private
router.route('/').get(protect, getJournalPaymentVouchers);

// @route   POST /api/journal-payment-vouchers
// @desc    Create new journal payment voucher (supports file upload)
// @access  Private
// @field   attachment - File field name for uploading a single attachment file
router.route('/').post(protect, uploadSingleAttachment, createJournalPaymentVoucher);

// @route   GET /api/journal-payment-vouchers/:id
// @desc    Get journal payment voucher by ID
// @access  Private
router.route('/:id').get(protect, getJournalPaymentVoucherById);

// @route   PUT /api/journal-payment-vouchers/:id
// @desc    Update journal payment voucher (supports file upload)
// @access  Private
// @field   attachment - File field name for uploading a single attachment file
router.route('/:id').put(protect, uploadSingleAttachment, updateJournalPaymentVoucher);

// @route   DELETE /api/journal-payment-vouchers/:id
// @desc    Delete journal payment voucher
// @access  Private
router.route('/:id').delete(protect, deleteJournalPaymentVoucher);

// @route   PUT /api/journal-payment-vouchers/:id/approve
// @desc    Approve journal payment voucher
// @access  Private
router.route('/:id/approve').put(protect, approveJournalPaymentVoucher);

// @route   PUT /api/journal-payment-vouchers/:id/reject
// @desc    Reject journal payment voucher
// @access  Private
router.route('/:id/reject').put(protect, rejectJournalPaymentVoucher);

// @route   PUT /api/journal-payment-vouchers/:id/post
// @desc    Post journal payment voucher to ledger
// @access  Private
router.route('/:id/post').put(protect, postJournalPaymentVoucher);

// @route   PUT /api/journal-payment-vouchers/:id/cancel
// @desc    Cancel journal payment voucher
// @access  Private
router.route('/:id/cancel').put(protect, cancelJournalPaymentVoucher);

module.exports = router;

