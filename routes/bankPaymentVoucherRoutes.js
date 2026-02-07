const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middlewares/authMiddleware');
const { uploadSingleAttachment } = require('../middlewares/uploadMiddleware');
const {
  getBankPaymentVouchers,
  getBankPaymentVoucherById,
  createBankPaymentVoucher,
  updateBankPaymentVoucher,
  approveBankPaymentVoucher,
  rejectBankPaymentVoucher,
  completeBankPaymentVoucher,
  cancelBankPaymentVoucher,
  deleteBankPaymentVoucher,
  getVouchersByBankAccount,
  createMissingTransaction,
  createMissingTransactionsForAll,
} = require('../controllers/bankPaymentVoucherController');

// @route   GET /api/bank-payment-vouchers
// @desc    Get all bank payment vouchers
// @access  Private
router.route('/').get(protect, getBankPaymentVouchers);

// @route   POST /api/bank-payment-vouchers
// @desc    Create new bank payment voucher (supports file upload)
// @access  Private
// @field   attachment - File field name for uploading a single attachment file
router.route('/').post(protect, uploadSingleAttachment, createBankPaymentVoucher);

// @route   GET /api/bank-payment-vouchers/bank-account/:bankAccountId
// @desc    Get vouchers by bank account
// @access  Private
router.route('/bank-account/:bankAccountId').get(protect, getVouchersByBankAccount);

// @route   GET /api/bank-payment-vouchers/:id
// @desc    Get bank payment voucher by ID
// @access  Private
router.route('/:id').get(protect, getBankPaymentVoucherById);

// @route   PUT /api/bank-payment-vouchers/:id
// @desc    Update bank payment voucher (supports file upload)
// @access  Private
// @field   attachment - File field name for uploading a single attachment file
router.route('/:id').put(protect, uploadSingleAttachment, updateBankPaymentVoucher);

// @route   DELETE /api/bank-payment-vouchers/:id
// @desc    Delete bank payment voucher
// @access  Private
router.route('/:id').delete(protect, deleteBankPaymentVoucher);

// @route   PUT /api/bank-payment-vouchers/:id/approve
// @desc    Approve bank payment voucher
// @access  Private
router.route('/:id/approve').put(protect, approveBankPaymentVoucher);

// @route   PUT /api/bank-payment-vouchers/:id/reject
// @desc    Reject bank payment voucher
// @access  Private
router.route('/:id/reject').put(protect, rejectBankPaymentVoucher);

// @route   PUT /api/bank-payment-vouchers/:id/complete
// @desc    Complete bank payment voucher
// @access  Private
router.route('/:id/complete').put(protect, completeBankPaymentVoucher);

// @route   PUT /api/bank-payment-vouchers/:id/cancel
// @desc    Cancel bank payment voucher
// @access  Private
router.route('/:id/cancel').put(protect, cancelBankPaymentVoucher);

// @route   POST /api/bank-payment-vouchers/:id/create-transaction
// @desc    Create missing Payment/SupplierPayment transaction for a voucher
// @access  Private
router.route('/:id/create-transaction').post(protect, createMissingTransaction);

// @route   POST /api/bank-payment-vouchers/create-missing-transactions
// @desc    Create missing transactions for all vouchers without transactions
// @access  Private/Admin
router.route('/create-missing-transactions').post(protect, admin, createMissingTransactionsForAll);

module.exports = router;

