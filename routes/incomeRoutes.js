const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const {
  getIncomes,
  getIncomeById,
  createIncome,
  updateIncome,
  deleteIncome,
} = require('../controllers/incomeController');

// @route   GET /api/incomes
// @desc    Get all incomes
// @access  Private
router.route('/').get(protect, getIncomes);

// @route   POST /api/incomes
// @desc    Create new income
// @access  Private
router.route('/').post(protect, createIncome);

// @route   GET /api/incomes/:id
// @desc    Get income by ID
// @access  Private
router.route('/:id').get(protect, getIncomeById);

// @route   PUT /api/incomes/:id
// @desc    Update income
// @access  Private
router.route('/:id').put(protect, updateIncome);

// @route   DELETE /api/incomes/:id
// @desc    Delete income
// @access  Private
router.route('/:id').delete(protect, deleteIncome);

module.exports = router;

