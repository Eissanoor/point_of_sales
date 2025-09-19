const express = require('express');
const {
  createOperationalExpense,
  getOperationalExpenses,
  getOperationalExpense,
  updateOperationalExpense,
  deleteOperationalExpense,
  getOperationalExpensesSummary
} = require('../controllers/operationalExpenseController');
const { protect, admin } = require('../middlewares/authMiddleware');

const router = express.Router();

// Apply authentication middleware to all routes
router.use(protect);

// Routes for /api/expenses/operational
router
  .route('/')
  .post(admin, createOperationalExpense)
  .get(getOperationalExpenses);

// Routes for /api/expenses/operational/summary
router
  .route('/summary')
  .get(admin, getOperationalExpensesSummary);

// Routes for /api/expenses/operational/:id
router
  .route('/:id')
  .get(getOperationalExpense)
  .put(admin, updateOperationalExpense)
  .delete(admin, deleteOperationalExpense);

module.exports = router;
