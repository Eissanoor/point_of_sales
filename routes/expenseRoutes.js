const express = require('express');
const router = express.Router();
const {
  getExpenses,
  getExpenseById,
  createExpense,
  updateExpense,
  deleteExpense,
  approveExpense,
  getExpenseAnalytics
} = require('../controllers/expenseController');

// Import middleware (assuming you have auth middleware)
// const { protect, admin } = require('../middlewares/authMiddleware');

// @route   GET /api/expenses
// @desc    Get all expenses with filtering and pagination
// @access  Private
router.get('/', getExpenses);

// @route   GET /api/expenses/analytics
// @desc    Get expense analytics and summary
// @access  Private
router.get('/analytics', getExpenseAnalytics);

// @route   GET /api/expenses/:id
// @desc    Get single expense by ID
// @access  Private
router.get('/:id', getExpenseById);

// @route   POST /api/expenses
// @desc    Create new expense
// @access  Private
router.post('/', createExpense);

// @route   PUT /api/expenses/:id
// @desc    Update expense
// @access  Private
router.put('/:id', updateExpense);

// @route   PUT /api/expenses/:id/approve
// @desc    Approve expense
// @access  Private/Admin
router.put('/:id/approve', approveExpense);

// @route   DELETE /api/expenses/:id
// @desc    Delete expense (soft delete)
// @access  Private
router.delete('/:id', deleteExpense);

module.exports = router;
