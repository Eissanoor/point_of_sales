const express = require('express');
const router = express.Router();
const {
  getProducts,
  getProductById,
  deleteProduct,
  createProduct,
  updateProduct,
  createProductReview,
  getProductJourneyByProductId,
  convertProductPrice,
  getProductsByLocation,
} = require('../controllers/productController');
const { protect, admin } = require('../middlewares/authMiddleware');
const upload = require('../middlewares/uploadMiddleware');

// Public routes
router.route('/')
  .get(getProducts)
  .post(protect, admin, upload.single('image'), createProduct);

router.route('/:id')
  .get(getProductById)
  .put(protect, admin, upload.single('image'), updateProduct)
  .delete(protect, admin, deleteProduct);

router.route('/:id/reviews')
  .post(protect, createProductReview);
  
router.route('/:id/journey')
  .get(protect, admin, getProductJourneyByProductId);

router.route('/:id/convert-price')
  .get(convertProductPrice);

router.route('/location/:locationType/:locationId')
  .get(protect, getProductsByLocation);

module.exports = router; 