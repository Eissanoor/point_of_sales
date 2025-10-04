const QuantityUnit = require('../models/quantityUnitModel');

// @desc    Get all quantity units
// @route   GET /api/quantity-units
// @access  Public
const getQuantityUnits = async (req, res) => {
  try {
    const { 
      keyword = '', 
      page = 1, 
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      isActive
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    // Build filter object
    const filter = {};
    
    // Search by keyword in name
    if (keyword) {
      filter.name = { $regex: keyword, $options: 'i' };
    }
    
    // Filter by active status
    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }
    
    // Determine sort options
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    // Count total documents for pagination info
    const totalQuantityUnits = await QuantityUnit.countDocuments(filter);
    
    // Find quantity units based on filters with pagination and sorting
    const quantityUnits = await QuantityUnit.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limitNum);

    res.json({
      status: 'success',
      results: quantityUnits.length,
      totalPages: Math.ceil(totalQuantityUnits / limitNum),
      currentPage: pageNum,
      totalQuantityUnits,
      data: quantityUnits,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get quantity unit by ID
// @route   GET /api/quantity-units/:id
// @access  Public
const getQuantityUnitById = async (req, res) => {
  try {
    const quantityUnit = await QuantityUnit.findById(req.params.id);

    if (quantityUnit) {
      res.json({
        status: 'success',
        data: quantityUnit,
      });
    } else {
      res.status(404).json({
        status: 'fail',
        message: 'Quantity unit not found',
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Create quantity unit
// @route   POST /api/quantity-units
// @access  Private/Admin
const createQuantityUnit = async (req, res) => {
  try {
    const { name } = req.body;

    const quantityUnit = await QuantityUnit.create({
      name,
    });

    res.status(201).json({
      status: 'success',
      data: quantityUnit,
    });
  } catch (error) {
    if (error.code === 11000) {
      res.status(400).json({
        status: 'fail',
        message: 'Quantity unit with this name already exists',
      });
    } else {
      res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  }
};

// @desc    Update quantity unit
// @route   PUT /api/quantity-units/:id
// @access  Private/Admin
const updateQuantityUnit = async (req, res) => {
  try {
    const quantityUnit = await QuantityUnit.findById(req.params.id);
    
    if (quantityUnit) {
      // Update fields if provided
      for (const [key, value] of Object.entries(req.body)) {
        if (quantityUnit[key] !== value) {
          quantityUnit[key] = value;
        }
      }
      
      const updatedQuantityUnit = await quantityUnit.save();
      
      res.json({
        status: 'success',
        data: updatedQuantityUnit,
      });
    } else {
      res.status(404).json({
        status: 'fail',
        message: 'Quantity unit not found',
      });
    }
  } catch (error) {
    if (error.code === 11000) {
      res.status(400).json({
        status: 'fail',
        message: 'Quantity unit with this name already exists',
      });
    } else {
      res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  }
};

// @desc    Delete quantity unit
// @route   DELETE /api/quantity-units/:id
// @access  Private/Admin
const deleteQuantityUnit = async (req, res) => {
  try {
    const quantityUnit = await QuantityUnit.findById(req.params.id);

    if (quantityUnit) {
      await QuantityUnit.deleteOne({ _id: req.params.id });
      
      res.json({
        status: 'success',
        message: 'Quantity unit removed',
      });
    } else {
      res.status(404).json({
        status: 'fail',
        message: 'Quantity unit not found',
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

module.exports = {
  getQuantityUnits,
  getQuantityUnitById,
  createQuantityUnit,
  updateQuantityUnit,
  deleteQuantityUnit,
};
