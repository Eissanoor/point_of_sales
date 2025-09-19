const express = require('express');
const router = express.Router();
const {
  getLogisticsExpenses,
  getLogisticsExpenseById,
  createLogisticsExpense,
  updateLogisticsExpense,
  deleteLogisticsExpense,
  updateTransportStatus,
  getLogisticsExpensesByRoute
} = require('../controllers/logisticsExpenseController');

// @route   GET /api/logistics-expenses
// @desc    Get all logistics expenses with filtering and pagination
// @access  Private
router.get('/', getLogisticsExpenses);

// @route   GET /api/logistics-expenses/route/:route
// @desc    Get logistics expenses by route
// @access  Private
router.get('/route/:route', getLogisticsExpensesByRoute);

// @route   GET /api/logistics-expenses/:id
// @desc    Get single logistics expense by ID
// @access  Private
router.get('/:id', getLogisticsExpenseById);

// @route   POST /api/logistics-expenses
// @desc    Create new logistics expense
// @access  Private
router.post('/', createLogisticsExpense);

// @route   PUT /api/logistics-expenses/:id
// @desc    Update logistics expense
// @access  Private
router.put('/:id', updateLogisticsExpense);

// @route   PUT /api/logistics-expenses/:id/status
// @desc    Update transport status
// @access  Private
router.put('/:id/status', updateTransportStatus);

// @route   DELETE /api/logistics-expenses/:id
// @desc    Delete logistics expense (soft delete)
// @access  Private
router.delete('/:id', deleteLogisticsExpense);

module.exports = router;
