const StockTransfer = require('../models/stockTransferModel');
const Product = require('../models/productModel');
const Warehouse = require('../models/warehouseModel');
const Shop = require('../models/shopModel');

// @desc    Create a new stock transfer
// @route   POST /api/stock-transfers
// @access  Private
const createStockTransfer = async (req, res) => {
  try {
    const {
      sourceType,
      sourceId,
      destinationType,
      destinationId,
      transferDate,
      items,
      status,
      notes
    } = req.body;

    // Validate source and destination types
    if (!['warehouse', 'shop'].includes(sourceType) || !['warehouse', 'shop'].includes(destinationType)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Source and destination types must be either "warehouse" or "shop"'
      });
    }

    // Check if source exists
    let sourceExists;
    if (sourceType === 'warehouse') {
      sourceExists = await Warehouse.findById(sourceId);
    } else {
      sourceExists = await Shop.findById(sourceId);
    }

    if (!sourceExists) {
      return res.status(404).json({
        status: 'fail',
        message: `Source ${sourceType} not found`
      });
    }

    // Check if destination exists
    let destinationExists;
    if (destinationType === 'warehouse') {
      destinationExists = await Warehouse.findById(destinationId);
    } else {
      destinationExists = await Shop.findById(destinationId);
    }

    if (!destinationExists) {
      return res.status(404).json({
        status: 'fail',
        message: `Destination ${destinationType} not found`
      });
    }

    // Check if source and destination are different
    if (sourceType === destinationType && sourceId === destinationId) {
      return res.status(400).json({
        status: 'fail',
        message: 'Source and destination cannot be the same'
      });
    }

    // Validate items
    if (!items || items.length === 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'At least one item is required for stock transfer'
      });
    }

    // Check if all products exist and have sufficient stock in source
    for (const item of items) {
      const product = await Product.findById(item.product);
      
      if (!product) {
        return res.status(404).json({
          status: 'fail',
          message: `Product with ID ${item.product} not found`
        });
      }

      // Check if product belongs to source warehouse
      if (sourceType === 'warehouse') {
        if (product.warehouse && product.warehouse.toString() !== sourceId) {
          return res.status(400).json({
            status: 'fail',
            message: `Product ${product.name} does not belong to the source warehouse`
          });
        }

        // Check if there's enough stock in warehouse
        if (product.countInStock < item.quantity) {
          return res.status(400).json({
            status: 'fail',
            message: `Insufficient stock for product ${product.name}. Available: ${product.countInStock}, Requested: ${item.quantity}`
          });
        }
      } else {
        // Check if product exists in shop inventory
        const shop = await Shop.findById(sourceId);
        const inventoryItem = shop.inventory.find(
          invItem => invItem.product.toString() === item.product
        );

        if (!inventoryItem) {
          return res.status(400).json({
            status: 'fail',
            message: `Product ${product.name} does not exist in the source shop inventory`
          });
        }

        // Check if there's enough stock in shop
        if (inventoryItem.quantity < item.quantity) {
          return res.status(400).json({
            status: 'fail',
            message: `Insufficient stock for product ${product.name} in shop. Available: ${inventoryItem.quantity}, Requested: ${item.quantity}`
          });
        }
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
      sourceType,
      sourceId,
      destinationType,
      destinationId,
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
      sourceType,
      sourceId,
      destinationType,
      destinationId,
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

    // Filter by source
    if (sourceType) {
      query.sourceType = sourceType;
    }
    if (sourceId) {
      query.sourceId = sourceId;
    }

    // Filter by destination
    if (destinationType) {
      query.destinationType = destinationType;
    }
    if (destinationId) {
      query.destinationId = destinationId;
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
      .populate({
        path: 'sourceId',
        select: 'name code',
        model: doc => doc.sourceType === 'warehouse' ? 'Warehouse' : 'Shop'
      })
      .populate({
        path: 'destinationId',
        select: 'name code',
        model: doc => doc.destinationType === 'warehouse' ? 'Warehouse' : 'Shop'
      })
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
    const stockTransfer = await StockTransfer.findById(req.params.id);
    
    if (!stockTransfer) {
      return res.status(404).json({
        status: 'fail',
        message: 'Stock transfer not found'
      });
    }
    
    // Populate source based on type
    let populatedTransfer;
    if (stockTransfer.sourceType === 'warehouse') {
      populatedTransfer = await StockTransfer.findById(req.params.id)
        .populate('sourceId', 'name code branch contactPerson phoneNumber email')
        .populate('destinationId', 'name code branch contactPerson phoneNumber email')
        .populate('user', 'name email')
        .populate({
          path: 'items.product',
          select: 'name image description packingUnit additionalUnit'
        });
    } else {
      populatedTransfer = await StockTransfer.findById(req.params.id)
        .populate('sourceId', 'name code location contactPerson phoneNumber email')
        .populate('destinationId', 'name code location contactPerson phoneNumber email')
        .populate('user', 'name email')
        .populate({
          path: 'items.product',
          select: 'name image description packingUnit additionalUnit'
        });
    }

    res.json({
      status: 'success',
      data: populatedTransfer
    });
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
      // Update product stock counts based on source and destination types
      for (const item of stockTransfer.items) {
        const product = await Product.findById(item.product);
        
        if (product) {
          // Handle source inventory reduction
          if (stockTransfer.sourceType === 'warehouse') {
            // Reduce stock in source warehouse
            if (product.warehouse && product.warehouse.toString() === stockTransfer.sourceId.toString()) {
              product.countInStock -= item.quantity;
              await product.save();
            }
          } else {
            // Reduce stock in source shop
            const sourceShop = await Shop.findById(stockTransfer.sourceId);
            if (sourceShop) {
              const inventoryItem = sourceShop.inventory.find(
                invItem => invItem.product.toString() === item.product.toString()
              );
              
              if (inventoryItem) {
                inventoryItem.quantity -= item.quantity;
                await sourceShop.save();
              }
            }
          }
          
          // Handle destination inventory increase
          if (stockTransfer.destinationType === 'warehouse') {
            // Check if product exists in destination warehouse
            const existingProduct = await Product.findOne({
              name: product.name,
              warehouse: stockTransfer.destinationId
            });
            
            if (existingProduct) {
              // Update existing product quantity
              existingProduct.countInStock += item.quantity;
              await existingProduct.save();
            } else {
              // Create a clone of the product for destination warehouse
              const newProduct = new Product({
                ...product.toObject(),
                _id: undefined,
                warehouse: stockTransfer.destinationId,
                countInStock: item.quantity,
                user: req.user._id
              });
              
              await newProduct.save();
            }
          } else {
            // Add or update product in destination shop inventory
            const destinationShop = await Shop.findById(stockTransfer.destinationId);
            
            if (destinationShop) {
              const existingItem = destinationShop.inventory.find(
                invItem => invItem.product.toString() === item.product.toString()
              );
              
              if (existingItem) {
                // Update existing inventory item
                existingItem.quantity += item.quantity;
              } else {
                // Add new inventory item
                destinationShop.inventory.push({
                  product: item.product,
                  quantity: item.quantity,
                  minimumStockLevel: 5 // Default minimum stock level
                });
              }
              
              await destinationShop.save();
            }
          }
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