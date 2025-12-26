const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middlewares/authMiddleware');
const { uploadSingleAttachment } = require('../middlewares/uploadMiddleware');
const {
  getCashPaymentVouchers,
  getCashPaymentVoucherById,
  createCashPaymentVoucher,
  updateCashPaymentVoucher,
  approveCashPaymentVoucher,
  rejectCashPaymentVoucher,
  completeCashPaymentVoucher,
  cancelCashPaymentVoucher,
  deleteCashPaymentVoucher,
  getVouchersByCashAccount,
} = require('../controllers/cashPaymentVoucherController');

// @route   GET /api/cash-payment-vouchers
// @desc    Get all cash payment vouchers
// @access  Private
router.route('/').get(protect, getCashPaymentVouchers);

// @route   POST /api/cash-payment-vouchers
// @desc    Create new cash payment voucher (supports file upload)
// @access  Private
// @field   attachment - File field name for uploading a single attachment file
router.route('/').post(protect, uploadSingleAttachment, createCashPaymentVoucher);

// @route   GET /api/cash-payment-vouchers/cash-account/:cashAccount
// @desc    Get vouchers by cash account
// @access  Private
router.route('/cash-account/:cashAccount').get(protect, getVouchersByCashAccount);

// @route   GET /api/cash-payment-vouchers/:id
// @desc    Get cash payment voucher by ID
// @access  Private
router.route('/:id').get(protect, getCashPaymentVoucherById);

// @route   PUT /api/cash-payment-vouchers/:id
// @desc    Update cash payment voucher (supports file upload)
// @access  Private
// @field   attachment - File field name for uploading a single attachment file
router.route('/:id').put(protect, uploadSingleAttachment, updateCashPaymentVoucher);

// @route   DELETE /api/cash-payment-vouchers/:id
// @desc    Delete cash payment voucher
// @access  Private
router.route('/:id').delete(protect, deleteCashPaymentVoucher);

// @route   PUT /api/cash-payment-vouchers/:id/approve
// @desc    Approve cash payment voucher
// @access  Private
router.route('/:id/approve').put(protect, approveCashPaymentVoucher);

// @route   PUT /api/cash-payment-vouchers/:id/reject
// @desc    Reject cash payment voucher
// @access  Private
router.route('/:id/reject').put(protect, rejectCashPaymentVoucher);

// @route   PUT /api/cash-payment-vouchers/:id/complete
// @desc    Complete cash payment voucher
// @access  Private
router.route('/:id/complete').put(protect, completeCashPaymentVoucher);

// @route   PUT /api/cash-payment-vouchers/:id/cancel
// @desc    Cancel cash payment voucher
// @access  Private
router.route('/:id/cancel').put(protect, cancelCashPaymentVoucher);

module.exports = router;

