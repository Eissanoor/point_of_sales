const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middlewares/authMiddleware');
const { uploadSingleAttachment } = require('../middlewares/uploadMiddleware');
const {
  getReconcileBankAccountsVouchers,
  getReconcileBankAccountsVoucherById,
  createReconcileBankAccountsVoucher,
  updateReconcileBankAccountsVoucher,
  reconcileBankAccountsVoucher,
  approveReconcileBankAccountsVoucher,
  rejectReconcileBankAccountsVoucher,
  completeReconcileBankAccountsVoucher,
  cancelReconcileBankAccountsVoucher,
  deleteReconcileBankAccountsVoucher,
  getVouchersByBankAccount,
} = require('../controllers/reconcileBankAccountsVoucherController');

// @route   GET /api/reconcile-bank-accounts-vouchers
// @desc    Get all reconcile bank accounts vouchers
// @access  Private
router.route('/').get(protect, getReconcileBankAccountsVouchers);

// @route   POST /api/reconcile-bank-accounts-vouchers
// @desc    Create new reconcile bank accounts voucher (supports file upload)
// @access  Private
// @field   attachment - File field name for uploading a single attachment file
router.route('/').post(protect, uploadSingleAttachment, createReconcileBankAccountsVoucher);

// @route   GET /api/reconcile-bank-accounts-vouchers/bank-account/:bankAccountId
// @desc    Get vouchers by bank account
// @access  Private
router.route('/bank-account/:bankAccountId').get(protect, getVouchersByBankAccount);

// @route   GET /api/reconcile-bank-accounts-vouchers/:id
// @desc    Get reconcile bank accounts voucher by ID
// @access  Private
router.route('/:id').get(protect, getReconcileBankAccountsVoucherById);

// @route   PUT /api/reconcile-bank-accounts-vouchers/:id
// @desc    Update reconcile bank accounts voucher (supports file upload)
// @access  Private
// @field   attachment - File field name for uploading a single attachment file
router.route('/:id').put(protect, uploadSingleAttachment, updateReconcileBankAccountsVoucher);

// @route   DELETE /api/reconcile-bank-accounts-vouchers/:id
// @desc    Delete reconcile bank accounts voucher
// @access  Private
router.route('/:id').delete(protect, deleteReconcileBankAccountsVoucher);

// @route   PUT /api/reconcile-bank-accounts-vouchers/:id/reconcile
// @desc    Reconcile bank accounts voucher (mark as reconciled)
// @access  Private
router.route('/:id/reconcile').put(protect, reconcileBankAccountsVoucher);

// @route   PUT /api/reconcile-bank-accounts-vouchers/:id/approve
// @desc    Approve reconcile bank accounts voucher
// @access  Private
router.route('/:id/approve').put(protect, approveReconcileBankAccountsVoucher);

// @route   PUT /api/reconcile-bank-accounts-vouchers/:id/reject
// @desc    Reject reconcile bank accounts voucher
// @access  Private
router.route('/:id/reject').put(protect, rejectReconcileBankAccountsVoucher);

// @route   PUT /api/reconcile-bank-accounts-vouchers/:id/complete
// @desc    Complete reconcile bank accounts voucher
// @access  Private
router.route('/:id/complete').put(protect, completeReconcileBankAccountsVoucher);

// @route   PUT /api/reconcile-bank-accounts-vouchers/:id/cancel
// @desc    Cancel reconcile bank accounts voucher
// @access  Private
router.route('/:id/cancel').put(protect, cancelReconcileBankAccountsVoucher);

module.exports = router;

