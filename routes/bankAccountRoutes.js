const express = require('express');
const router = express.Router();
const {
  getBankAccounts,
  getBankAccountById,
  createBankAccount,
  updateBankAccount,
  deleteBankAccount,
  getAccountBalance
} = require('../controllers/bankAccountController');

// Import auth middleware
const { protect, admin } = require('../middlewares/authMiddleware');

// Apply protect middleware to all routes
router.use(protect);

// Routes
router
  .route('/')
  .get(getBankAccounts)  // Get all bank accounts
  .post(admin, createBankAccount);  // Create new bank account (admin only)

router
  .route('/:id')
  .get(getBankAccountById)  // Get single bank account
  .put(admin, updateBankAccount)  // Update bank account (admin only)
  .delete(admin, deleteBankAccount);  // Delete bank account (admin only)

// Get account balance
router.get('/:id/balance', getAccountBalance);

module.exports = router;
