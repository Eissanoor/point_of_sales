const express = require('express');
const router = express.Router();
const {
  getProcurementExpenses,
  getProcurementExpenseById,
  createProcurementExpense,
  updateProcurementExpense,
  deleteProcurementExpense,
  updatePaymentStatus,
  getProcurementExpensesBySupplier
} = require('../controllers/procurementExpenseController');

// @route   GET /api/procurement-expenses
// @desc    Get all procurement expenses with filtering and pagination
// @access  Private
router.get('/', getProcurementExpenses);

// @route   GET /api/procurement-expenses/supplier/:supplierId
// @desc    Get procurement expenses by supplier
// @access  Private
router.get('/supplier/:supplierId', getProcurementExpensesBySupplier);

// @route   GET /api/procurement-expenses/:id
// @desc    Get single procurement expense by ID
// @access  Private
router.get('/:id', getProcurementExpenseById);

// @route   POST /api/procurement-expenses
// @desc    Create new procurement expense
// @access  Private
router.post('/', createProcurementExpense);

// @route   PUT /api/procurement-expenses/:id
// @desc    Update procurement expense
// @access  Private
router.put('/:id', updateProcurementExpense);

// @route   PUT /api/procurement-expenses/:id/payment
// @desc    Update payment status
// @access  Private
router.put('/:id/payment', updatePaymentStatus);

// @route   DELETE /api/procurement-expenses/:id
// @desc    Delete procurement expense (soft delete)
// @access  Private
router.delete('/:id', deleteProcurementExpense);

module.exports = router;
