const express = require('express');
const router = express.Router();
const {
  getProductDamages,
  getProductDamageById,
  createProductDamage,
  updateProductDamage,
  deleteProductDamage,
  getDamageStatistics,
} = require('../controllers/productDamageController');
const { protect, admin } = require('../middlewares/authMiddleware');
const { uploadMultiple } = require('../middlewares/uploadMiddleware');

// @route   GET /api/product-damages/statistics
// @desc    Get damage statistics
// @access  Private/Admin
router.get('/statistics', protect, admin, getDamageStatistics);

// @route   GET /api/product-damages
// @desc    Get all product damages
// @access  Private/Admin
router.get('/', protect, admin, getProductDamages);

// @route   GET /api/product-damages/:id
// @desc    Get product damage by ID
// @access  Private/Admin
router.get('/:id', protect, admin, getProductDamageById);

// @route   POST /api/product-damages
// @desc    Create new product damage (auto-processed)
// @access  Private
router.post('/', protect, uploadMultiple, createProductDamage);

// @route   PUT /api/product-damages/:id
// @desc    Update product damage (add notes only)
// @access  Private/Admin
router.put('/:id', protect, admin, updateProductDamage);

// @route   DELETE /api/product-damages/:id
// @desc    Delete product damage
// @access  Private/Admin
router.delete('/:id', protect, admin, deleteProductDamage);

module.exports = router;
