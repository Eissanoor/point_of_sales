const SubCategory = require('../models/subCategoryModel');
const Category = require('../models/categoryModel');
const Product = require('../models/productModel');

// @desc    Fetch all subcategories
// @route   GET /api/subcategories
// @access  Public
const getSubCategories = async (req, res) => {
  try {
    const { category, isActive } = req.query;
    
    // Build query
    const query = {};
    if (category) {
      query.category = category;
    }
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    
    const subCategories = await SubCategory.find(query)
      .populate('category', 'name description')
      .sort({ createdAt: -1 });

    res.json({
      status: 'success',
      results: subCategories.length,
      data: subCategories,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Fetch single subcategory
// @route   GET /api/subcategories/:id
// @access  Public
const getSubCategoryById = async (req, res) => {
  try {
    const subCategory = await SubCategory.findById(req.params.id)
      .populate('category', 'name description');

    if (subCategory) {
      res.json({
        status: 'success',
        data: subCategory,
      });
    } else {
      res.status(404).json({
        status: 'fail',
        message: 'SubCategory not found',
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Create a subcategory
// @route   POST /api/subcategories
// @access  Private/Admin
const createSubCategory = async (req, res) => {
  try {
    const { name, category, description } = req.body;

    // Validate required fields
    if (!name) {
      return res.status(400).json({
        status: 'fail',
        message: 'Please enter subcategory name',
      });
    }

    if (!category) {
      return res.status(400).json({
        status: 'fail',
        message: 'Please select a category',
      });
    }

    // Check if category exists
    const categoryExists = await Category.findById(category);
    if (!categoryExists) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid category',
      });
    }

    // Check if subcategory already exists in this category
    const subCategoryExists = await SubCategory.findOne({ 
      name: name.trim(),
      category: category 
    });
    
    if (subCategoryExists) {
      return res.status(400).json({
        status: 'fail',
        message: 'SubCategory with this name already exists in this category',
      });
    }

    const subCategory = new SubCategory({
      name: name.trim(),
      category,
      description: description || '',
    });

    const createdSubCategory = await subCategory.save();
    
    // Populate category before sending response
    await createdSubCategory.populate('category', 'name description');

    res.status(201).json({
      status: 'success',
      data: createdSubCategory,
      message: 'SubCategory created successfully',
    });
  } catch (error) {
    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({
        status: 'fail',
        message: 'SubCategory with this name already exists in this category',
      });
    }
    
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Update a subcategory
// @route   PUT /api/subcategories/:id
// @access  Private/Admin
const updateSubCategory = async (req, res) => {
  try {
    const { name, description, isActive } = req.body;

    const subCategory = await SubCategory.findById(req.params.id);

    if (!subCategory) {
      return res.status(404).json({
        status: 'fail',
        message: 'SubCategory not found',
      });
    }

    // Update subcategory info
    if (name !== undefined) {
      // Check if new name already exists in the same category
      const existingSubCategory = await SubCategory.findOne({
        name: name.trim(),
        category: subCategory.category,
        _id: { $ne: req.params.id }
      });
      
      if (existingSubCategory) {
        return res.status(400).json({
          status: 'fail',
          message: 'SubCategory with this name already exists in this category',
        });
      }
      
      subCategory.name = name.trim();
    }
    
    if (description !== undefined) {
      subCategory.description = description;
    }
    
    if (isActive !== undefined) {
      subCategory.isActive = isActive;
    }

    const updatedSubCategory = await subCategory.save();
    
    // Populate category before sending response
    await updatedSubCategory.populate('category', 'name description');

    res.json({
      status: 'success',
      data: updatedSubCategory,
      message: 'SubCategory updated successfully',
    });
  } catch (error) {
    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({
        status: 'fail',
        message: 'SubCategory with this name already exists in this category',
      });
    }
    
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Delete a subcategory
// @route   DELETE /api/subcategories/:id
// @access  Private/Admin
const deleteSubCategory = async (req, res) => {
  try {
    const subCategory = await SubCategory.findById(req.params.id);

    if (!subCategory) {
      return res.status(404).json({
        status: 'fail',
        message: 'SubCategory not found',
      });
    }

    // Check if subcategory is being used by any products
    const productsCount = await Product.countDocuments({ 
      subCategory: req.params.id 
    });
    
    if (productsCount > 0) {
      return res.status(400).json({
        status: 'fail',
        message: `Cannot delete subcategory. It is being used by ${productsCount} product(s). Please remove or update these products first.`,
      });
    }

    await SubCategory.deleteOne({ _id: req.params.id });
    
    res.json({
      status: 'success',
      message: 'SubCategory deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get subcategories by category
// @route   GET /api/subcategories/category/:categoryId
// @access  Public
const getSubCategoriesByCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { isActive } = req.query;
    
    // Check if category exists
    const categoryExists = await Category.findById(categoryId);
    if (!categoryExists) {
      return res.status(404).json({
        status: 'fail',
        message: 'Category not found',
      });
    }
    
    // Build query
    const query = { category: categoryId };
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    
    const subCategories = await SubCategory.find(query)
      .populate('category', 'name description')
      .sort({ name: 1 });

    res.json({
      status: 'success',
      results: subCategories.length,
      data: subCategories,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get product count for each subcategory
// @route   GET /api/subcategories/product-count
// @access  Public
const getProductCountBySubCategory = async (req, res) => {
  try {
    // Get all subcategories
    const subCategories = await SubCategory.find({})
      .populate('category', 'name description');
    
    // Create an array to store results
    const results = [];
    
    // For each subcategory, get the product count
    for (const subCategory of subCategories) {
      const count = await Product.countDocuments({ subCategory: subCategory._id });
      
      results.push({
        subCategory: {
          _id: subCategory._id,
          name: subCategory.name,
          description: subCategory.description,
          category: subCategory.category
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
  getSubCategories,
  getSubCategoryById,
  createSubCategory,
  updateSubCategory,
  deleteSubCategory,
  getSubCategoriesByCategory,
  getProductCountBySubCategory
};

