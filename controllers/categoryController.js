const Category = require('../models/categoryModel');

// @desc    Fetch all categories
// @route   GET /api/categories
// @access  Public
const getCategories = async (req, res) => {
  try {
    const categories = await Category.find({});

    res.json({
      status: 'success',
      results: categories.length,
      data: categories,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Fetch single category
// @route   GET /api/categories/:id
// @access  Public
const getCategoryById = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);

    if (category) {
      res.json({
        status: 'success',
        data: category,
      });
    } else {
      res.status(404).json({
        status: 'fail',
        message: 'Category not found',
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Create a category
// @route   POST /api/categories
// @access  Private/Admin
const createCategory = async (req, res) => {
  try {
    const { name, description } = req.body;

    // Check if category already exists
    const categoryExists = await Category.findOne({ name });
    if (categoryExists) {
      return res.status(400).json({
        status: 'fail',
        message: 'Category already exists',
      });
    }

    const category = new Category({
      name,
      description,
    });

    const createdCategory = await category.save();

    res.status(201).json({
      status: 'success',
      data: createdCategory,
      message: 'Category created successfully',
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Update a category
// @route   PUT /api/categories/:id
// @access  Private/Admin
const updateCategory = async (req, res) => {
  try {
    const { name, description } = req.body;

    const category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({
        status: 'fail',
        message: 'Category not found',
      });
    }

    // Update category info
    category.name = name || category.name;
    category.description = description || category.description;

    const updatedCategory = await category.save();

    res.json({
      status: 'success',
      data: updatedCategory,
      message: 'Category updated successfully',
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Delete a category
// @route   DELETE /api/categories/:id
// @access  Private/Admin
const deleteCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);

    if (category) {
      await Category.deleteOne({ _id: req.params.id });
      
      res.json({
        status: 'success',
        message: 'Category removed',
      });
    } else {
      res.status(404).json({
        status: 'fail',
        message: 'Category not found',
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get product count for each category
// @route   GET /api/categories/product-count
// @access  Public
const getProductCountByCategory = async (req, res) => {
  try {
    const Product = require('../models/productModel');
    
    // Get all categories
    const categories = await Category.find({});
    
    // Create an array to store results
    const results = [];
    
    // For each category, get the product count
    for (const category of categories) {
      const count = await Product.countDocuments({ category: category._id });
      
      results.push({
        category: {
          _id: category._id,
          name: category.name,
          description: category.description
        },
        productCount: count
      });
    }
    
    res.json({
      status: 'success',
      results: results.length,
      data: results
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

module.exports = {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  getProductCountByCategory
}; 