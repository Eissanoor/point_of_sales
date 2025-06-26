const express = require('express');
const router = express.Router();
const {
  getProducts,
  getProductById,
  deleteProduct,
  createProduct,
  updateProduct,
  createProductReview,
} = require('../controllers/productController');
const { protect, admin } = require('../middlewares/authMiddleware');

// Public routes
router.route('/')
  .get(getProducts)
  .post(protect, admin, createProduct);

router.route('/:id')
  .get(getProductById)
  .put(protect, admin, updateProduct)
  .delete(protect, admin, deleteProduct);

router.route('/:id/reviews')
  .post(protect, createProductReview);

module.exports = router; 