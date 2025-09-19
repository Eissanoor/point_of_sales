const express = require('express');
const router = express.Router();
const {
  getFinancialExpenses,
  getFinancialExpenseById,
  createFinancialExpense,
  updateFinancialExpense,
  deleteFinancialExpense
} = require('../controllers/financialExpenseController');

// Import auth middleware
const { protect, admin } = require('../middlewares/authMiddleware');

// Apply protect middleware to all routes
router.use(protect);

// Routes
router
  .route('/')
  .get(admin, getFinancialExpenses)
  .post(admin, createFinancialExpense);

router
  .route('/:id')
  .get(getFinancialExpenseById)
  .put(admin, updateFinancialExpense)
  .delete(admin, deleteFinancialExpense);

module.exports = router;
