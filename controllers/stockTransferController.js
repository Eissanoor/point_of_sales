const StockTransfer = require('../models/stockTransferModel');
const Product = require('../models/productModel');
const Warehouse = require('../models/warehouseModel');

// @desc    Create a new stock transfer
// @route   POST /api/stock-transfers
// @access  Private
const createStockTransfer = async (req, res) => {
  try {
    const {
      sourceWarehouse,
      destinationWarehouse,
      transferDate,
      items,
      status,
      notes
    } = req.body;

    // Check if source and destination warehouses exist
    const sourceWarehouseExists = await Warehouse.findById(sourceWarehouse);
    const destinationWarehouseExists = await Warehouse.findById(destinationWarehouse);

    if (!sourceWarehouseExists) {
      return res.status(404).json({
        status: 'fail',
        message: 'Source warehouse not found'
      });
    }

    if (!destinationWarehouseExists) {
      return res.status(404).json({
        status: 'fail',
        message: 'Destination warehouse not found'
      });
    }

    // Check if source and destination are different
    if (sourceWarehouse === destinationWarehouse) {
      return res.status(400).json({
        status: 'fail',
        message: 'Source and destination warehouses cannot be the same'
      });
    }

    // Validate items
    if (!items || items.length === 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'At least one item is required for stock transfer'
      });
    }

    // Check if all products exist and have sufficient stock in source warehouse
    for (const item of items) {
      const product = await Product.findById(item.product);
      
      if (!product) {
        return res.status(404).json({
          status: 'fail',
          message: `Product with ID ${item.product} not found`
        });
      }

      // Check if product belongs to source warehouse
      if (product.warehouse.toString() !== sourceWarehouse) {
        return res.status(400).json({
          status: 'fail',
          message: `Product ${product.name} does not belong to the source warehouse`
        });
      }

      // Check if there's enough stock
      if (product.countInStock < item.quantity) {
        return res.status(400).json({
          status: 'fail',
          message: `Insufficient stock for product ${product.name}. Available: ${product.countInStock}, Requested: ${item.quantity}`
        });
      }
    }

    // Generate transfer number (format: TR-YYYYMMDD-XXX)
    const date = new Date();
    const dateString = date.toISOString().slice(0, 10).replace(/-/g, '');
    
    // Get count of transfers created today to generate sequential number
    const todayStart = new Date(date.setHours(0, 0, 0, 0));
    const todayEnd = new Date(date.setHours(23, 59, 59, 999));
    
    const transferCount = await StockTransfer.countDocuments({
      createdAt: { $gte: todayStart, $lte: todayEnd }
    });
    
    const sequentialNumber = String(transferCount + 1).padStart(3, '0');
    const transferNumber = `TR-${dateString}-${sequentialNumber}`;

    // Create stock transfer
    const stockTransfer = await StockTransfer.create({
      transferNumber,
      sourceWarehouse,
      destinationWarehouse,
      transferDate: transferDate || Date.now(),
      items,
      status: status || 'pending',
      notes,
      user: req.user._id
    });

    if (stockTransfer) {
      res.status(201).json({
        status: 'success',
        data: stockTransfer
      });
    } else {
      res.status(400).json({
        status: 'fail',
        message: 'Invalid stock transfer data'
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// @desc    Get all stock transfers with pagination and filtering
// @route   GET /api/stock-transfers
// @access  Private
const getStockTransfers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      sourceWarehouse,
      destinationWarehouse,
      startDate,
      endDate,
      search
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build query object
    let query = {};

    // Filter by status
    if (status) {
      query.status = status;
    }

    // Filter by source warehouse
    if (sourceWarehouse) {
      query.sourceWarehouse = sourceWarehouse;
    }

    // Filter by destination warehouse
    if (destinationWarehouse) {
      query.destinationWarehouse = destinationWarehouse;
    }

    // Filter by date range
    if (startDate || endDate) {
      query.transferDate = {};
      if (startDate) {
        query.transferDate.$gte = new Date(startDate);
      }
      if (endDate) {
        query.transferDate.$lte = new Date(endDate);
      }
    }

    // Search by transfer number
    if (search) {
      query.transferNumber = { $regex: search, $options: 'i' };
    }

    // Count total documents for pagination info
    const totalTransfers = await StockTransfer.countDocuments(query);

    // Find stock transfers based on query with pagination
    const stockTransfers = await StockTransfer.find(query)
      .populate('sourceWarehouse', 'name code')
      .populate('destinationWarehouse', 'name code')
      .populate('user', 'name')
      .populate({
        path: 'items.product',
        select: 'name image'
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    res.json({
      status: 'success',
      results: stockTransfers.length,
      totalPages: Math.ceil(totalTransfers / limitNum),
      currentPage: pageNum,
      totalTransfers,
      data: stockTransfers
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// @desc    Get stock transfer by ID
// @route   GET /api/stock-transfers/:id
// @access  Private
const getStockTransferById = async (req, res) => {
  try {
    const stockTransfer = await StockTransfer.findById(req.params.id)
      .populate('sourceWarehouse', 'name code branch contactPerson phoneNumber email')
      .populate('destinationWarehouse', 'name code branch contactPerson phoneNumber email')
      .populate('user', 'name email')
      .populate({
        path: 'items.product',
        select: 'name image description packingUnit additionalUnit'
      });

    if (stockTransfer) {
      res.json({
        status: 'success',
        data: stockTransfer
      });
    } else {
      res.status(404).json({
        status: 'fail',
        message: 'Stock transfer not found'
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// @desc    Update stock transfer status
// @route   PUT /api/stock-transfers/:id/status
// @access  Private
const updateStockTransferStatus = async (req, res) => {
  try {
    const { status } = req.body;
    
    // Validate status
    const validStatuses = ['pending', 'in-transit', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        status: 'fail',
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }
    
    const stockTransfer = await StockTransfer.findById(req.params.id);
    
    if (!stockTransfer) {
      return res.status(404).json({
        status: 'fail',
        message: 'Stock transfer not found'
      });
    }
    
    // If transfer is already completed or cancelled, don't allow status change
    if (stockTransfer.status === 'completed' || stockTransfer.status === 'cancelled') {
      return res.status(400).json({
        status: 'fail',
        message: `Cannot change status of a ${stockTransfer.status} transfer`
      });
    }
    
    // Handle status change to 'completed'
    if (status === 'completed' && stockTransfer.status !== 'completed') {
      // Update product warehouse and stock counts
      for (const item of stockTransfer.items) {
        const product = await Product.findById(item.product);
        
        if (product) {
          // Reduce stock in source warehouse
          if (product.warehouse.toString() === stockTransfer.sourceWarehouse.toString()) {
            product.countInStock -= item.quantity;
            
            // Create a clone of the product for destination warehouse
            const newProduct = new Product({
              ...product.toObject(),
              _id: undefined,
              warehouse: stockTransfer.destinationWarehouse,
              countInStock: item.quantity,
              user: req.user._id
            });
            
            await newProduct.save();
          }
          
          await product.save();
        }
      }
    }
    
    // Update transfer status
    stockTransfer.status = status;
    const updatedTransfer = await stockTransfer.save();
    
    res.json({
      status: 'success',
      data: updatedTransfer
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// @desc    Delete stock transfer
// @route   DELETE /api/stock-transfers/:id
// @access  Private
const deleteStockTransfer = async (req, res) => {
  try {
    const stockTransfer = await StockTransfer.findById(req.params.id);
    
    if (!stockTransfer) {
      return res.status(404).json({
        status: 'fail',
        message: 'Stock transfer not found'
      });
    }
    
    // Only allow deletion of pending transfers
    if (stockTransfer.status !== 'pending') {
      return res.status(400).json({
        status: 'fail',
        message: `Cannot delete a ${stockTransfer.status} transfer. Only pending transfers can be deleted.`
      });
    }
    
    await StockTransfer.deleteOne({ _id: req.params.id });
    
    res.json({
      status: 'success',
      message: 'Stock transfer removed'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

module.exports = {
  createStockTransfer,
  getStockTransfers,
  getStockTransferById,
  updateStockTransferStatus,
  deleteStockTransfer
};
