const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middlewares/authMiddleware');
const { uploadSingleAttachment } = require('../middlewares/uploadMiddleware');
const {
  getBankAccountTransferVouchers,
  getBankAccountTransferVoucherById,
  createBankAccountTransferVoucher,
  updateBankAccountTransferVoucher,
  initiateBankAccountTransfer,
  completeBankAccountTransfer,
  failBankAccountTransfer,
  approveBankAccountTransferVoucher,
  rejectBankAccountTransferVoucher,
  cancelBankAccountTransferVoucher,
  deleteBankAccountTransferVoucher,
  getVouchersByBankAccount,
} = require('../controllers/bankAccountTransferVoucherController');

// @route   GET /api/bank-account-transfer-vouchers
// @desc    Get all bank account transfer vouchers
// @access  Private
router.route('/').get(protect, getBankAccountTransferVouchers);

// @route   POST /api/bank-account-transfer-vouchers
// @desc    Create new bank account transfer voucher (supports file upload)
// @access  Private
// @field   attachment - File field name for uploading a single attachment file
router.route('/').post(protect, uploadSingleAttachment, createBankAccountTransferVoucher);

// @route   GET /api/bank-account-transfer-vouchers/bank-account/:bankAccountId
// @desc    Get transfer vouchers by bank account
// @access  Private
router.route('/bank-account/:bankAccountId').get(protect, getVouchersByBankAccount);

// @route   GET /api/bank-account-transfer-vouchers/:id
// @desc    Get bank account transfer voucher by ID
// @access  Private
router.route('/:id').get(protect, getBankAccountTransferVoucherById);

// @route   PUT /api/bank-account-transfer-vouchers/:id
// @desc    Update bank account transfer voucher (supports file upload)
// @access  Private
// @field   attachment - File field name for uploading a single attachment file
router.route('/:id').put(protect, uploadSingleAttachment, updateBankAccountTransferVoucher);

// @route   DELETE /api/bank-account-transfer-vouchers/:id
// @desc    Delete bank account transfer voucher
// @access  Private
router.route('/:id').delete(protect, deleteBankAccountTransferVoucher);

// @route   PUT /api/bank-account-transfer-vouchers/:id/initiate
// @desc    Initiate bank account transfer
// @access  Private
router.route('/:id/initiate').put(protect, initiateBankAccountTransfer);

// @route   PUT /api/bank-account-transfer-vouchers/:id/complete
// @desc    Complete bank account transfer
// @access  Private
router.route('/:id/complete').put(protect, completeBankAccountTransfer);

// @route   PUT /api/bank-account-transfer-vouchers/:id/fail
// @desc    Mark bank account transfer as failed
// @access  Private
router.route('/:id/fail').put(protect, failBankAccountTransfer);

// @route   PUT /api/bank-account-transfer-vouchers/:id/approve
// @desc    Approve bank account transfer voucher
// @access  Private
router.route('/:id/approve').put(protect, approveBankAccountTransferVoucher);

// @route   PUT /api/bank-account-transfer-vouchers/:id/reject
// @desc    Reject bank account transfer voucher
// @access  Private
router.route('/:id/reject').put(protect, rejectBankAccountTransferVoucher);

// @route   PUT /api/bank-account-transfer-vouchers/:id/cancel
// @desc    Cancel bank account transfer voucher
// @access  Private
router.route('/:id/cancel').put(protect, cancelBankAccountTransferVoucher);

module.exports = router;

