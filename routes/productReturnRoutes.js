const express = require('express');
const router = express.Router();
const {
  getProductReturns,
  getProductReturnById,
  createProductReturn,
  updateProductReturn,
  deleteProductReturn,
  getReturnStatistics,
  getProductReturnsByLocation,
} = require('../controllers/productReturnController');
const { protect, admin } = require('../middlewares/authMiddleware');
const { uploadMultiple } = require('../middlewares/uploadMiddleware');

// @route   GET /api/product-returns/statistics
// @desc    Get return statistics
// @access  Private/Admin
router.get('/statistics', protect, admin, getReturnStatistics);

// @route   GET /api/product-returns/by-location/:locationType/:locationId
// @desc    Get product returns by warehouse or shop ID
// @access  Private/Admin
router.get('/by-location/:locationType/:locationId', protect, admin, getProductReturnsByLocation);

// @route   GET /api/product-returns
// @desc    Get all product returns
// @access  Private/Admin
router.get('/', protect, admin, getProductReturns);

// @route   GET /api/product-returns/:id
// @desc    Get product return by ID
// @access  Private/Admin
router.get('/:id', protect, admin, getProductReturnById);

// @route   POST /api/product-returns
// @desc    Create new product return (auto-processed)
// @access  Private
router.post('/', protect,  createProductReturn);

// @route   PUT /api/product-returns/:id
// @desc    Update product return (add notes only)
// @access  Private/Admin
router.put('/:id', protect, admin, updateProductReturn);

// @route   DELETE /api/product-returns/:id
// @desc    Delete product return
// @access  Private/Admin
router.delete('/:id', protect, admin, deleteProductReturn);

module.exports = router;
