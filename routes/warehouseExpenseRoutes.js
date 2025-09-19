const express = require('express');
const {
  createWarehouseExpense,
  getWarehouseExpenses,
  getWarehouseExpense,
  updateWarehouseExpense,
  deleteWarehouseExpense,
  getWarehouseExpensesSummary
} = require('../controllers/warehouseExpenseController');
const { protect, admin } = require('../middlewares/authMiddleware');

const router = express.Router();

// Apply authentication middleware to all routes
router.use(protect);

// Routes for /api/warehouse-expenses
router
  .route('/')
  .post(protect, admin, createWarehouseExpense)
  .get(protect, getWarehouseExpenses);

// Routes for /api/warehouse-expenses/summary
router
  .route('/summary')
  .get(protect, admin, getWarehouseExpensesSummary);

// Routes for /api/warehouse-expenses/:id
router
  .route('/:id')
  .get(protect, getWarehouseExpense)
  .put(protect, admin, updateWarehouseExpense)
  .delete(protect, admin, deleteWarehouseExpense);

module.exports = router;
