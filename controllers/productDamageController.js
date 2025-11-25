const ProductDamage = require('../models/productDamageModel');
const Product = require('../models/productModel');
const ProductJourney = require('../models/productJourneyModel');
const Warehouse = require('../models/warehouseModel');
const Shop = require('../models/shopModel');
const Currency = require('../models/currencyModel');
const StockTransfer = require('../models/stockTransferModel');
const Purchase = require('../models/purchaseModel');
const cloudinary = require('../config/cloudinary');

// @desc    Get all product damages
// @route   GET /api/product-damages
// @access  Private/Admin
const getProductDamages = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10,
      status,
      damageType,
      warehouse,
      shop,
      product,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    // Build filter object
    const filter = { isActive: true };
    
    if (status) filter.status = status;
    if (damageType) filter.damageType = damageType;
    if (warehouse) filter.warehouse = warehouse;
    if (shop) filter.shop = shop;
    if (product) filter.product = product;
    
    // Determine sort options
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    // Count total documents for pagination info
    const totalDamages = await ProductDamage.countDocuments(filter);
    
    // Find damages with pagination and sorting
    const damages = await ProductDamage.find(filter)
      .populate('product', 'name countInStock')
      .populate('warehouse', 'name code')
      .populate('shop', 'name code')
      .populate('reportedBy', 'name email')
      .populate('approvedBy', 'name email')
      .populate('currency', 'name code symbol')
      .sort(sort)
      .skip(skip)
      .limit(limitNum);

    res.json({
      status: 'success',
      results: damages.length,
      totalPages: Math.ceil(totalDamages / limitNum),
      currentPage: pageNum,
      totalDamages,
      data: damages,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get product damage by ID
// @route   GET /api/product-damages/:id
// @access  Private/Admin
const getProductDamageById = async (req, res) => {
  try {
    const damage = await ProductDamage.findById(req.params.id)
      .populate('product', 'name countInStock')
      .populate('warehouse', 'name code')
      .populate('shop', 'name code')
      .populate('reportedBy', 'name email')
      .populate('approvedBy', 'name email')
      .populate('currency', 'name code symbol');

    if (damage) {
      res.json({
        status: 'success',
        data: damage,
      });
    } else {
      res.status(404).json({
        status: 'fail',
        message: 'Product damage record not found',
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Create new product damage
// @route   POST /api/product-damages
// @access  Private
const createProductDamage = async (req, res) => {
  try {
    const {
      product,
      warehouse,
      shop,
      quantity,
      damageType,
      damageReason,
      damageDescription,
      estimatedLoss,
      currency,
      disposalMethod,
      disposalNotes
    } = req.body;

    // Validate required fields
    if (!product || !quantity || !damageType || !damageReason) {
      return res.status(400).json({
        status: 'fail',
        message: 'Product, quantity, damage type, and damage reason are required',
      });
    }

    // Trim and validate enum values
    const trimmedDamageType = damageType.toString().trim();
    const trimmedDisposalMethod = disposalMethod ? disposalMethod.toString().trim() : 'destroy';
    
    const validDamageTypes = [
      'transport_damage',
      'handling_damage', 
      'storage_damage',
      'manufacturing_defect',
      'expired',
      'broken',
      'contaminated',
      'other'
    ];
    
    const validDisposalMethods = [
      'destroy',
      'return_to_supplier',
      'donate',
      'recycle',
      'other'
    ];

    if (!validDamageTypes.includes(trimmedDamageType)) {
      return res.status(400).json({
        status: 'fail',
        message: `Invalid damage type. Valid options: ${validDamageTypes.join(', ')}`,
      });
    }

    if (!validDisposalMethods.includes(trimmedDisposalMethod)) {
      return res.status(400).json({
        status: 'fail',
        message: `Invalid disposal method. Valid options: ${validDisposalMethods.join(', ')}`,
      });
    }

    // Trim and validate ObjectId
    const trimmedProductId = product.toString().trim();
    if (!trimmedProductId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid product ID format',
      });
    }

    // Check if product exists
    const productExists = await Product.findById(trimmedProductId);
    if (!productExists) {
      return res.status(404).json({
        status: 'fail',
        message: 'Product not found',
      });
    }

    // Validate location (either warehouse or shop)
    if (warehouse && shop) {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot specify both warehouse and shop',
      });
    }

    // Trim and validate warehouse/shop IDs if provided
    let trimmedWarehouseId = null;
    let trimmedShopId = null;

    if (warehouse) {
      trimmedWarehouseId = warehouse.toString().trim();
      if (!trimmedWarehouseId.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({
          status: 'fail',
          message: 'Invalid warehouse ID format',
        });
      }
      const warehouseExists = await Warehouse.findById(trimmedWarehouseId);
      if (!warehouseExists) {
        return res.status(404).json({
          status: 'fail',
          message: 'Warehouse not found',
        });
      }
    }

    if (shop) {
      trimmedShopId = shop.toString().trim();
      if (!trimmedShopId.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({
          status: 'fail',
          message: 'Invalid shop ID format',
        });
      }
      const shopExists = await Shop.findById(trimmedShopId);
      if (!shopExists) {
        return res.status(404).json({
          status: 'fail',
          message: 'Shop not found',
        });
      }
    }

    // Check available stock
    const availableStock = await calculateAvailableStock(trimmedProductId, trimmedWarehouseId, trimmedShopId);
    if (availableStock < quantity) {
      return res.status(400).json({
        status: 'fail',
        message: `Insufficient stock. Available: ${availableStock}, Requested: ${quantity}`,
      });
    }

    // Handle image uploads
    const images = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const result = await cloudinary.uploader.upload(file.path, {
          folder: 'product-damages',
        });
        images.push({
          url: result.secure_url,
          publicId: result.public_id,
        });
      }
    }

    // Create damage record
    const damage = await ProductDamage.create({
      product: trimmedProductId,
      warehouse: trimmedWarehouseId,
      shop: trimmedShopId,
      quantity: parseInt(quantity),
      damageType: trimmedDamageType,
      damageReason: damageReason ? damageReason.toString().trim() : '',
      damageDescription: damageDescription ? damageDescription.toString().trim() : '',
      reportedBy: req.user._id,
      approvedBy: req.user._id, // Auto-approve
      status: 'approved', // Set as approved immediately
      estimatedLoss: parseFloat(estimatedLoss) || 0,
      currency: currency ? currency.toString().trim() : null,
      images,
      disposalMethod: trimmedDisposalMethod,
      disposalNotes: disposalNotes ? disposalNotes.toString().trim() : '',
    });

    // Update product damaged quantity and reduce stock immediately
    const damageQuantity = parseInt(quantity);
    productExists.damagedQuantity = (productExists.damagedQuantity || 0) + damageQuantity;
    productExists.countInStock = Math.max(0, productExists.countInStock - damageQuantity);
    await productExists.save();

    // Create product journey record
    await ProductJourney.create({
      product: productExists._id,
      user: req.user._id,
      action: 'damage_processed',
      changes: [
        {
          field: 'damagedQuantity',
          oldValue: productExists.damagedQuantity - damageQuantity,
          newValue: productExists.damagedQuantity,
        },
        {
          field: 'countInStock',
          oldValue: productExists.countInStock + damageQuantity,
          newValue: productExists.countInStock,
        },
      ],
      notes: `Product damage processed: ${damageReason}`,
    });

    // Populate the response
    const populatedDamage = await ProductDamage.findById(damage._id)
      .populate('product', 'name countInStock')
      .populate('warehouse', 'name code')
      .populate('shop', 'name code')
      .populate('reportedBy', 'name email')
      .populate('currency', 'name code symbol');

    res.status(201).json({
      status: 'success',
      data: populatedDamage,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Update product damage (add notes only)
// @route   PUT /api/product-damages/:id
// @access  Private/Admin
const updateProductDamage = async (req, res) => {
  try {
    const { adminNotes } = req.body;
    
    const damage = await ProductDamage.findById(req.params.id);
    if (!damage) {
      return res.status(404).json({
        status: 'fail',
        message: 'Product damage record not found',
      });
    }
    
    if (adminNotes) {
      damage.disposalNotes = adminNotes;
      await damage.save();
    }

    // Populate the response
    const populatedDamage = await ProductDamage.findById(damage._id)
      .populate('product', 'name countInStock')
      .populate('warehouse', 'name code')
      .populate('shop', 'name code')
      .populate('reportedBy', 'name email')
      .populate('approvedBy', 'name email')
      .populate('currency', 'name code symbol');

    res.json({
      status: 'success',
      data: populatedDamage,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Delete product damage
// @route   DELETE /api/product-damages/:id
// @access  Private/Admin
const deleteProductDamage = async (req, res) => {
  try {
    const damage = await ProductDamage.findById(req.params.id);
    
    if (damage) {
      // Delete images from cloudinary
      if (damage.images && damage.images.length > 0) {
        for (const image of damage.images) {
          if (image.publicId) {
            await cloudinary.uploader.destroy(image.publicId);
          }
        }
      }

      // Restore stock since damage was already processed
      const product = await Product.findById(damage.product);
      if (product) {
        product.countInStock += damage.quantity;
        product.damagedQuantity = Math.max(0, product.damagedQuantity - damage.quantity);
        await product.save();

        // Create product journey record
        await ProductJourney.create({
          product: product._id,
          user: req.user._id,
          action: 'damage_deleted',
          changes: [
            {
              field: 'countInStock',
              oldValue: product.countInStock - damage.quantity,
              newValue: product.countInStock,
            },
            {
              field: 'damagedQuantity',
              oldValue: product.damagedQuantity + damage.quantity,
              newValue: product.damagedQuantity,
            },
          ],
          notes: 'Damage record deleted - stock restored',
        });
      }

      await ProductDamage.deleteOne({ _id: req.params.id });
      
      res.json({
        status: 'success',
        message: 'Product damage record removed',
      });
    } else {
      res.status(404).json({
        status: 'fail',
        message: 'Product damage record not found',
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get damage statistics
// @route   GET /api/product-damages/statistics
// @access  Private/Admin
const getDamageStatistics = async (req, res) => {
  try {
    const { startDate, endDate, warehouse, shop } = req.query;
    
    const filter = { isActive: true };
    
    if (startDate && endDate) {
      filter.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }
    
    if (warehouse) filter.warehouse = warehouse;
    if (shop) filter.shop = shop;

    const stats = await ProductDamage.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalDamages: { $sum: 1 },
          totalQuantity: { $sum: '$quantity' },
          totalLoss: { $sum: '$estimatedLoss' },
          pendingCount: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
          },
          approvedCount: {
            $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] }
          },
          rejectedCount: {
            $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] }
          },
        }
      }
    ]);

    const damageTypeStats = await ProductDamage.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$damageType',
          count: { $sum: 1 },
          totalQuantity: { $sum: '$quantity' },
          totalLoss: { $sum: '$estimatedLoss' },
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.json({
      status: 'success',
      data: {
        overview: stats[0] || {
          totalDamages: 0,
          totalQuantity: 0,
          totalLoss: 0,
          pendingCount: 0,
          approvedCount: 0,
          rejectedCount: 0,
        },
        byDamageType: damageTypeStats,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// Helper function to calculate current stock at a specific location (warehouse/shop)
const calculateAvailableStock = async (productId, warehouseId, shopId) => {
  let currentStock = 0;

  const product = await Product.findById(productId).lean();
  if (!product) return 0;

  // Warehouse-based calculation
  if (warehouseId) {
    // Base stock: if product is originally assigned to this warehouse
    if (product.warehouse && product.warehouse.toString() === warehouseId.toString()) {
      currentStock += Number(product.countInStock || 0);
    }

    // Add purchases in this warehouse for this product
    const purchases = await Purchase.aggregate([
      { $match: { isActive: true, warehouse: new (require('mongoose').Types.ObjectId)(warehouseId) } },
      { $unwind: '$items' },
      { $match: { 'items.product': new (require('mongoose').Types.ObjectId)(productId) } },
      { $group: { _id: null, qty: { $sum: '$items.quantity' } } }
    ]);
    currentStock += purchases.length > 0 ? Number(purchases[0].qty || 0) : 0;

    // Incoming transfers TO this warehouse
    const incoming = await StockTransfer.aggregate([
      { $match: { destinationType: 'warehouse', destinationId: new (require('mongoose').Types.ObjectId)(warehouseId) } },
      { $unwind: '$items' },
      { $match: { 'items.product': new (require('mongoose').Types.ObjectId)(productId) } },
      { $group: { _id: null, qty: { $sum: '$items.quantity' } } }
    ]);
    currentStock += incoming.length > 0 ? Number(incoming[0].qty || 0) : 0;

    // Outgoing transfers FROM this warehouse
    const outgoing = await StockTransfer.aggregate([
      { $match: { sourceType: 'warehouse', sourceId: new (require('mongoose').Types.ObjectId)(warehouseId) } },
      { $unwind: '$items' },
      { $match: { 'items.product': new (require('mongoose').Types.ObjectId)(productId) } },
      { $group: { _id: null, qty: { $sum: '$items.quantity' } } }
    ]);
    currentStock -= outgoing.length > 0 ? Number(outgoing[0].qty || 0) : 0;

    // Subtract already processed damages in this warehouse
    const damages = await ProductDamage.aggregate([
      { $match: { product: new (require('mongoose').Types.ObjectId)(productId), warehouse: new (require('mongoose').Types.ObjectId)(warehouseId), status: 'approved', isActive: { $ne: false } } },
      { $group: { _id: null, qty: { $sum: '$quantity' } } }
    ]);
    currentStock -= damages.length > 0 ? Number(damages[0].qty || 0) : 0;
  }

  // Shop-based calculation
  if (shopId) {
    // Base stock: if product is originally assigned to this shop
    if (product.shop && product.shop.toString() === shopId.toString()) {
      currentStock += Number(product.countInStock || 0);
    }

    // Add purchases in this shop for this product
    const shopPurchases = await Purchase.aggregate([
      { $match: { isActive: true, locationType: 'shop', shop: new (require('mongoose').Types.ObjectId)(shopId) } },
      { $unwind: '$items' },
      { $match: { 'items.product': new (require('mongoose').Types.ObjectId)(productId) } },
      { $group: { _id: null, qty: { $sum: '$items.quantity' } } }
    ]);
    currentStock += shopPurchases.length > 0 ? Number(shopPurchases[0].qty || 0) : 0;

    // Incoming transfers TO this shop
    const incomingShop = await StockTransfer.aggregate([
      { $match: { destinationType: 'shop', destinationId: new (require('mongoose').Types.ObjectId)(shopId) } },
      { $unwind: '$items' },
      { $match: { 'items.product': new (require('mongoose').Types.ObjectId)(productId) } },
      { $group: { _id: null, qty: { $sum: '$items.quantity' } } }
    ]);
    currentStock += incomingShop.length > 0 ? Number(incomingShop[0].qty || 0) : 0;

    // Outgoing transfers FROM this shop
    const outgoingShop = await StockTransfer.aggregate([
      { $match: { sourceType: 'shop', sourceId: new (require('mongoose').Types.ObjectId)(shopId) } },
      { $unwind: '$items' },
      { $match: { 'items.product': new (require('mongoose').Types.ObjectId)(productId) } },
      { $group: { _id: null, qty: { $sum: '$items.quantity' } } }
    ]);
    currentStock -= outgoingShop.length > 0 ? Number(outgoingShop[0].qty || 0) : 0;

    // Subtract already processed damages in this shop
    const damagesShop = await ProductDamage.aggregate([
      { $match: { product: new (require('mongoose').Types.ObjectId)(productId), shop: new (require('mongoose').Types.ObjectId)(shopId), status: 'approved', isActive: { $ne: false } } },
      { $group: { _id: null, qty: { $sum: '$quantity' } } }
    ]);
    currentStock -= damagesShop.length > 0 ? Number(damagesShop[0].qty || 0) : 0;
  }

  return Math.max(0, currentStock);
};

// @desc    Get product damages by warehouse or shop ID
// @route   GET /api/product-damages/by-location/:locationType/:locationId
// @access  Private/Admin
const getProductDamagesByLocation = async (req, res) => {
  try {
    const { locationType, locationId } = req.params;
    const { 
      page = 1, 
      limit = 10,
      status,
      damageType,
      product,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Validate location type
    if (!['warehouse', 'shop'].includes(locationType)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Location type must be either "warehouse" or "shop"',
      });
    }

    // Validate location ID format
    if (!locationId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid location ID format',
      });
    }

    // Check if location exists
    let locationExists;
    if (locationType === 'warehouse') {
      locationExists = await Warehouse.findById(locationId);
    } else {
      locationExists = await Shop.findById(locationId);
    }

    if (!locationExists) {
      return res.status(404).json({
        status: 'fail',
        message: `${locationType} not found`,
      });
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    // Build filter object
    const filter = { isActive: true };
    
    // Add location filter
    if (locationType === 'warehouse') {
      filter.warehouse = locationId;
    } else {
      filter.shop = locationId;
    }
    
    if (status) filter.status = status;
    if (damageType) filter.damageType = damageType;
    if (product) filter.product = product;
    
    // Determine sort options
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    // Count total documents for pagination info
    const totalDamages = await ProductDamage.countDocuments(filter);
    
    // Find damages with pagination and sorting
    const damages = await ProductDamage.find(filter)
      .populate('product', 'name countInStock')
      .populate('warehouse', 'name code')
      .populate('shop', 'name code')
      .populate('reportedBy', 'name email')
      .populate('approvedBy', 'name email')
      .populate('currency', 'name code symbol')
      .sort(sort)
      .skip(skip)
      .limit(limitNum);

    res.json({
      status: 'success',
      results: damages.length,
      totalPages: Math.ceil(totalDamages / limitNum),
      currentPage: pageNum,
      totalDamages,
      location: {
        type: locationType,
        id: locationId,
        name: locationExists.name,
        code: locationExists.code
      },
      data: damages,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

module.exports = {
  getProductDamages,
  getProductDamageById,
  createProductDamage,
  updateProductDamage,
  deleteProductDamage,
  getDamageStatistics,
  getProductDamagesByLocation,
};
