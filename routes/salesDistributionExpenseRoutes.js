const express = require('express');
const router = express.Router();
const {
  getSalesDistributionExpenses,
  getSalesDistributionExpenseById,
  createSalesDistributionExpense,
  updateSalesDistributionExpense,
  deleteSalesDistributionExpense,
  getSalesDistributionExpenseAnalytics
} = require('../controllers/salesDistributionExpenseController');

// Import middleware (assuming you have auth middleware)
// const { protect, admin } = require('../middlewares/authMiddleware');

// @route   GET /api/expenses/sales-distribution
// @desc    Get all sales distribution expenses with filtering and pagination
// @access  Private
router.get('/', getSalesDistributionExpenses);

// @route   GET /api/expenses/sales-distribution/analytics
// @desc    Get sales distribution expense analytics and summary
// @access  Private
router.get('/analytics', getSalesDistributionExpenseAnalytics);

// @route   GET /api/expenses/sales-distribution/:id
// @desc    Get single sales distribution expense by ID
// @access  Private
router.get('/:id', getSalesDistributionExpenseById);

// @route   POST /api/expenses/sales-distribution
// @desc    Create new sales distribution expense
// @access  Private
router.post('/', createSalesDistributionExpense);

// @route   PUT /api/expenses/sales-distribution/:id
// @desc    Update sales distribution expense
// @access  Private
router.put('/:id', updateSalesDistributionExpense);

// @route   DELETE /api/expenses/sales-distribution/:id
// @desc    Delete sales distribution expense (soft delete)
// @access  Private
router.delete('/:id', deleteSalesDistributionExpense);

module.exports = router;
