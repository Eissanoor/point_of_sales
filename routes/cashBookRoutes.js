const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const {
  getCashBooks,
  getCashBookById,
  createCashBook,
  updateCashBook,
  deleteCashBook,
} = require('../controllers/cashBookController');

// @route   GET /api/cash-books
// @desc    Get all cash book entries
// @access  Private
router.route('/').get(protect, getCashBooks);

// @route   POST /api/cash-books
// @desc    Create new cash book entry
// @access  Private
router.route('/').post(protect, createCashBook);

// @route   GET /api/cash-books/:id
// @desc    Get cash book entry by ID
// @access  Private
router.route('/:id').get(protect, getCashBookById);

// @route   PUT /api/cash-books/:id
// @desc    Update cash book entry
// @access  Private
router.route('/:id').put(protect, updateCashBook);

// @route   DELETE /api/cash-books/:id
// @desc    Delete cash book entry
// @access  Private
router.route('/:id').delete(protect, deleteCashBook);

module.exports = router;
