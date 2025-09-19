const express = require('express');
const {
  createMiscellaneousExpense,
  getMiscellaneousExpenses,
  getMiscellaneousExpense,
  updateMiscellaneousExpense,
  deleteMiscellaneousExpense,
  getMiscellaneousExpensesSummary
} = require('../controllers/miscellaneousExpenseController');
const { protect, admin } = require('../middlewares/authMiddleware');

const router = express.Router();

// Apply authentication middleware to all routes
router.use(protect);

// Routes for /api/expenses/miscellaneous
router
  .route('/')
  .post(admin, createMiscellaneousExpense)
  .get(getMiscellaneousExpenses);

// Routes for /api/expenses/miscellaneous/summary
router
  .route('/summary')
  .get(admin, getMiscellaneousExpensesSummary);

// Routes for /api/expenses/miscellaneous/:id
router
  .route('/:id')
  .get(getMiscellaneousExpense)
  .put(admin, updateMiscellaneousExpense)
  .delete(admin, deleteMiscellaneousExpense);

module.exports = router;
