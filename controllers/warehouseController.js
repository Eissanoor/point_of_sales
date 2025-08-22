const Warehouse = require('../models/warehouseModel');
const Product = require('../models/productModel');

// @desc    Create a new warehouse
// @route   POST /api/warehouses
// @access  Private
const createWarehouse = async (req, res) => {
  try {
    const { 
      name, 
      code, 
      branch, 
      country, 
      state, 
      city, 
      zipCode, 
      contactPerson, 
      phoneNumber, 
      email, 
      status 
    } = req.body;

    // Check if warehouse already exists with the same code
    const warehouseExists = await Warehouse.findOne({ code });
    if (warehouseExists) {
      return res.status(400).json({
        status: 'fail',
        message: 'Warehouse with this code already exists',
      });
    }

    // Create new warehouse
    const warehouse = await Warehouse.create({
      name,
      code,
      branch,
      country,
      state,
      city,
      zipCode,
      contactPerson,
      phoneNumber,
      email,
      status: status || 'active',
      user: req.user._id,
    });

    if (warehouse) {
      res.status(201).json({
        status: 'success',
        data: warehouse,
      });
    } else {
      res.status(400).json({
        status: 'fail',
        message: 'Invalid warehouse data',
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get all warehouses or search warehouses by name, code, etc. with pagination
// @route   GET /api/warehouses
// @access  Private
const getWarehouses = async (req, res) => {
  try {
    const { search, page = 1, limit = 10, status } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    let query = {};

    // If search parameter exists, create a search query
    if (search) {
      query = {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { code: { $regex: search, $options: 'i' } },
          { branch: { $regex: search, $options: 'i' } },
          { country: { $regex: search, $options: 'i' } },
          { state: { $regex: search, $options: 'i' } },
          { city: { $regex: search, $options: 'i' } },
          { contactPerson: { $regex: search, $options: 'i' } },
          { phoneNumber: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
        ],
      };
    }

    // Filter by status if provided
    if (status) {
      query.status = status;
    }

    // Count total documents for pagination info
    const totalWarehouses = await Warehouse.countDocuments(query);

    // Find warehouses based on query with pagination
    const warehouses = await Warehouse.find(query)
      .limit(limitNum)
      .skip(skip)
      .sort({ createdAt: -1 });
    
    res.json({
      status: 'success',
      results: warehouses.length,
      totalPages: Math.ceil(totalWarehouses / limitNum),
      currentPage: pageNum,
      totalWarehouses,
      data: warehouses,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get warehouse by ID
// @route   GET /api/warehouses/:id
// @access  Private
const getWarehouseById = async (req, res) => {
  try {
    const warehouse = await Warehouse.findById(req.params.id);

    if (warehouse) {
      res.json({
        status: 'success',
        data: warehouse,
      });
    } else {
      res.status(404).json({
        status: 'fail',
        message: 'Warehouse not found',
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Update warehouse by ID
// @route   PUT /api/warehouses/:id
// @access  Private
const updateWarehouse = async (req, res) => {
  try {
    const warehouse = await Warehouse.findById(req.params.id);

    if (warehouse) {
      // If code is being updated, check if it already exists
      if (req.body.code && req.body.code !== warehouse.code) {
        const codeExists = await Warehouse.findOne({ code: req.body.code });
        if (codeExists) {
          return res.status(400).json({
            status: 'fail',
            message: 'Warehouse with this code already exists',
          });
        }
      }

      warehouse.name = req.body.name || warehouse.name;
      warehouse.code = req.body.code || warehouse.code;
      warehouse.branch = req.body.branch || warehouse.branch;
      warehouse.country = req.body.country || warehouse.country;
      warehouse.state = req.body.state || warehouse.state;
      warehouse.city = req.body.city || warehouse.city;
      warehouse.zipCode = req.body.zipCode || warehouse.zipCode;
      warehouse.contactPerson = req.body.contactPerson || warehouse.contactPerson;
      warehouse.phoneNumber = req.body.phoneNumber || warehouse.phoneNumber;
      warehouse.email = req.body.email || warehouse.email;
      warehouse.status = req.body.status || warehouse.status;

      const updatedWarehouse = await warehouse.save();

      res.json({
        status: 'success',
        data: updatedWarehouse,
      });
    } else {
      res.status(404).json({
        status: 'fail',
        message: 'Warehouse not found',
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Delete warehouse
// @route   DELETE /api/warehouses/:id
// @access  Private
const deleteWarehouse = async (req, res) => {
  try {
    const warehouse = await Warehouse.findById(req.params.id);

    if (warehouse) {
      await Warehouse.deleteOne({ _id: req.params.id });
      res.json({
        status: 'success',
        message: 'Warehouse removed',
      });
    } else {
      res.status(404).json({
        status: 'fail',
        message: 'Warehouse not found',
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get products by warehouse ID
// @route   GET /api/warehouses/:id/products
// @access  Private
const getProductsByWarehouseId = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      page = 1, 
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      keyword = '' 
    } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    // Check if warehouse exists
    const warehouse = await Warehouse.findById(id);
    if (!warehouse) {
      return res.status(404).json({
        status: 'fail',
        message: 'Warehouse not found',
      });
    }
    
    // Build filter object
    const filter = { warehouse: id };
    
    // Search by keyword in name or description
    if (keyword) {
      filter.$or = [
        { name: { $regex: keyword, $options: 'i' } },
        { description: { $regex: keyword, $options: 'i' } }
      ];
    }
    
    // Only show active products
    filter.isActive = true;
    
    // Determine sort options
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    // Count total documents for pagination info
    const totalProducts = await Product.countDocuments(filter);
    
    // Find products based on warehouse ID with pagination and sorting
    const products = await Product.find(filter)
      .populate('category', 'name')
      .populate('supplier', 'name')
      .populate('currency', 'name code symbol')
      .sort(sort)
      .skip(skip)
      .limit(limitNum);
    
    res.json({
      status: 'success',
      results: products.length,
      totalPages: Math.ceil(totalProducts / limitNum),
      currentPage: pageNum,
      totalProducts,
      data: products,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

module.exports = {
  createWarehouse,
  getWarehouses,
  getWarehouseById,
  updateWarehouse,
  deleteWarehouse,
  getProductsByWarehouseId,
};
