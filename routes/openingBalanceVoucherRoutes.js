const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middlewares/authMiddleware');
const { uploadSingleAttachment } = require('../middlewares/uploadMiddleware');
const {
  getOpeningBalanceVouchers,
  getOpeningBalanceVoucherById,
  createOpeningBalanceVoucher,
  updateOpeningBalanceVoucher,
  approveOpeningBalanceVoucher,
  rejectOpeningBalanceVoucher,
  postOpeningBalanceVoucher,
  cancelOpeningBalanceVoucher,
  deleteOpeningBalanceVoucher,
} = require('../controllers/openingBalanceVoucherController');

// @route   GET /api/opening-balance-vouchers
// @desc    Get all opening balance vouchers
// @access  Private
router.route('/').get(protect, getOpeningBalanceVouchers);

// @route   POST /api/opening-balance-vouchers
// @desc    Create new opening balance voucher (supports file upload)
// @access  Private
// @field   attachment - File field name for uploading a single attachment file
router.route('/').post(protect, uploadSingleAttachment, createOpeningBalanceVoucher);

// @route   GET /api/opening-balance-vouchers/:id
// @desc    Get opening balance voucher by ID
// @access  Private
router.route('/:id').get(protect, getOpeningBalanceVoucherById);

// @route   PUT /api/opening-balance-vouchers/:id
// @desc    Update opening balance voucher (supports file upload)
// @access  Private
// @field   attachment - File field name for uploading a single attachment file
router.route('/:id').put(protect, uploadSingleAttachment, updateOpeningBalanceVoucher);

// @route   DELETE /api/opening-balance-vouchers/:id
// @desc    Delete opening balance voucher
// @access  Private
router.route('/:id').delete(protect, deleteOpeningBalanceVoucher);

// @route   PUT /api/opening-balance-vouchers/:id/approve
// @desc    Approve opening balance voucher
// @access  Private
router.route('/:id/approve').put(protect, approveOpeningBalanceVoucher);

// @route   PUT /api/opening-balance-vouchers/:id/reject
// @desc    Reject opening balance voucher
// @access  Private
router.route('/:id/reject').put(protect, rejectOpeningBalanceVoucher);

// @route   PUT /api/opening-balance-vouchers/:id/post
// @desc    Post opening balance voucher to ledger
// @access  Private
router.route('/:id/post').put(protect, postOpeningBalanceVoucher);

// @route   PUT /api/opening-balance-vouchers/:id/cancel
// @desc    Cancel opening balance voucher
// @access  Private
router.route('/:id/cancel').put(protect, cancelOpeningBalanceVoucher);

module.exports = router;

