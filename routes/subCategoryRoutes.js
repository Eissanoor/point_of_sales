const express = require('express');
const router = express.Router();
const {
  getSubCategories,
  getSubCategoryById,
  createSubCategory,
  updateSubCategory,
  deleteSubCategory,
  getSubCategoriesByCategory,
  getProductCountBySubCategory
} = require('../controllers/subCategoryController');
const { protect, admin } = require('../middlewares/authMiddleware');

// Public routes
router.route('/')
  .get(getSubCategories)
  .post(protect, admin, createSubCategory);

router.route('/product-count')
  .get(getProductCountBySubCategory);

router.route('/category/:categoryId')
  .get(getSubCategoriesByCategory);

router.route('/:id')
  .get(getSubCategoryById)
  .put(protect, admin, updateSubCategory)
  .delete(protect, admin, deleteSubCategory);

module.exports = router;

