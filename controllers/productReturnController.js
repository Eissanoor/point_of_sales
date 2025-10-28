const ProductReturn = require('../models/productReturnModel');
const Product = require('../models/productModel');
const Sales = require('../models/salesModel');
const Customer = require('../models/customerModel');
const ProductJourney = require('../models/productJourneyModel');
const Warehouse = require('../models/warehouseModel');
const Shop = require('../models/shopModel');
const Currency = require('../models/currencyModel');
const cloudinary = require('../config/cloudinary');

// @desc    Get all product returns
// @route   GET /api/product-returns
// @access  Private/Admin
const getProductReturns = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10,
      status,
      customer,
      returnReason,
      warehouse,
      shop,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    // Build filter object
    const filter = { isActive: true };
    
    if (status) filter.status = status;
    if (customer) filter.customer = customer;
    if (warehouse) filter.warehouse = warehouse;
    if (shop) filter.shop = shop;
    
    // Filter by return reason in products array
    if (returnReason) {
      filter['products.returnReason'] = returnReason;
    }
    
    // Determine sort options
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    // Count total documents for pagination info
    const totalReturns = await ProductReturn.countDocuments(filter);
    
    // Find returns with pagination and sorting
    const returns = await ProductReturn.find(filter)
      .populate('customer', 'name email phoneNumber')
      .populate('originalSale', 'invoiceNumber')
      .populate('products.product', 'name countInStock')
      .populate('warehouse', 'name code')
      .populate('shop', 'name code')
      .populate('requestedBy', 'name email')
      .populate('reviewedBy', 'name email')
      .populate('processedBy', 'name email')
      .populate('currency', 'name code symbol')
      .sort(sort)
      .skip(skip)
      .limit(limitNum);

    res.json({
      status: 'success',
      results: returns.length,
      totalPages: Math.ceil(totalReturns / limitNum),
      currentPage: pageNum,
      totalReturns,
      data: returns,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get product return by ID
// @route   GET /api/product-returns/:id
// @access  Private/Admin
const getProductReturnById = async (req, res) => {
  try {
    const returnRecord = await ProductReturn.findById(req.params.id)
      .populate('customer', 'name email phoneNumber')
      .populate('originalSale', 'invoiceNumber')
      .populate('products.product', 'name countInStock')
      .populate('warehouse', 'name code')
      .populate('shop', 'name code')
      .populate('requestedBy', 'name email')
      .populate('reviewedBy', 'name email')
      .populate('processedBy', 'name email')
      .populate('currency', 'name code symbol');

    if (returnRecord) {
      res.json({
        status: 'success',
        data: returnRecord,
      });
    } else {
      res.status(404).json({
        status: 'fail',
        message: 'Product return record not found',
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Create new product return
// @route   POST /api/product-returns
// @access  Private
const createProductReturn = async (req, res) => {
  try {
    const {
      customer,
      originalSale,
      products,
      returnReason,
      customerNotes,
      warehouse,
      shop,
      refundMethod
    } = req.body;

    // Validate required fields
    if (!customer || !products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'Customer and products are required',
      });
    }

    // Trim and validate enum values
    const trimmedReturnReason = returnReason ? returnReason.toString().trim() : '';
    const trimmedRefundMethod = refundMethod ? refundMethod.toString().trim() : 'credit';
    
    const validRefundMethods = [
      'cash',
      'credit',
      'bank_transfer',
      'store_credit'
    ];

    if (!validRefundMethods.includes(trimmedRefundMethod)) {
      return res.status(400).json({
        status: 'fail',
        message: `Invalid refund method. Valid options: ${validRefundMethods.join(', ')}`,
      });
    }

    // Trim and validate customer ID
    const trimmedCustomerId = customer.toString().trim();
    if (!trimmedCustomerId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid customer ID format',
      });
    }

    // Check if customer exists
    const customerExists = await Customer.findById(trimmedCustomerId);
    if (!customerExists) {
      return res.status(404).json({
        status: 'fail',
        message: 'Customer not found',
      });
    }

    // Validate original sale if provided
    if (originalSale) {
      const trimmedSaleId = originalSale.toString().trim();
      if (!trimmedSaleId.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({
          status: 'fail',
          message: 'Invalid original sale ID format',
        });
      }
      const saleExists = await Sales.findById(trimmedSaleId);
      if (!saleExists) {
        return res.status(404).json({
          status: 'fail',
          message: 'Original sale not found',
        });
      }
    }

    // Validate products and calculate refund amounts
    let totalRefundAmount = 0;
    const validatedProducts = [];

    for (const productReturn of products) {
      const { product, quantity, returnReason: productReturnReason, condition } = productReturn;

      if (!product || !quantity || !productReturnReason || !condition) {
        return res.status(400).json({
          status: 'fail',
          message: 'Product, quantity, return reason, and condition are required for each item',
        });
      }

      // Trim and validate product ID
      const trimmedProductId = product.toString().trim();
      if (!trimmedProductId.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({
          status: 'fail',
          message: 'Invalid product ID format',
        });
      }

      // Trim and validate enum values for product
      const trimmedProductReturnReason = productReturnReason.toString().trim();
      const trimmedCondition = condition.toString().trim();
      
      const validReturnReasons = [
        'defective_product',
        'wrong_item',
        'damaged_during_shipping',
        'not_as_described',
        'customer_changed_mind',
        'expired_product',
        'quality_issue',
        'other'
      ];
      
      const validConditions = [
        'new',
        'used',
        'damaged',
        'defective'
      ];

      if (!validReturnReasons.includes(trimmedProductReturnReason)) {
        return res.status(400).json({
          status: 'fail',
          message: `Invalid return reason. Valid options: ${validReturnReasons.join(', ')}`,
        });
      }

      if (!validConditions.includes(trimmedCondition)) {
        return res.status(400).json({
          status: 'fail',
          message: `Invalid condition. Valid options: ${validConditions.join(', ')}`,
        });
      }

      // Check if product exists
      const productExists = await Product.findById(trimmedProductId);
      if (!productExists) {
        return res.status(404).json({
          status: 'fail',
          message: `Product ${trimmedProductId} not found`,
        });
      }

      // Calculate refund amount based on condition
      let refundAmount = 0;
      const originalPrice = productReturn.originalPrice || productExists.saleRate || 0;
      
      switch (trimmedCondition) {
        case 'new':
          refundAmount = originalPrice * parseInt(quantity);
          break;
        case 'used':
          refundAmount = originalPrice * parseInt(quantity) * 0.8; // 80% refund
          break;
        case 'damaged':
          refundAmount = originalPrice * parseInt(quantity) * 0.5; // 50% refund
          break;
        case 'defective':
          refundAmount = originalPrice * parseInt(quantity); // Full refund
          break;
        default:
          refundAmount = 0;
      }

      validatedProducts.push({
        product: trimmedProductId,
        quantity: parseInt(quantity),
        originalPrice,
        returnReason: trimmedProductReturnReason,
        condition: trimmedCondition,
        refundAmount,
        restockable: trimmedCondition === 'new' || trimmedCondition === 'used',
      });

      totalRefundAmount += refundAmount;
    }

    // Validate location
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

    // Handle image uploads
    const images = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const result = await cloudinary.uploader.upload(file.path, {
          folder: 'product-returns',
        });
        images.push({
          url: result.secure_url,
          publicId: result.public_id,
        });
      }
    }

    // Create return record
    const returnRecord = await ProductReturn.create({
      customer: trimmedCustomerId,
      originalSale: originalSale ? originalSale.toString().trim() : null,
      products: validatedProducts,
      totalRefundAmount,
      returnReason: trimmedReturnReason,
      customerNotes: customerNotes ? customerNotes.toString().trim() : '',
      requestedBy: req.user._id,
      reviewedBy: req.user._id, // Auto-approve
      processedBy: req.user._id, // Auto-process
      status: 'processed', // Set as processed immediately
      warehouse: trimmedWarehouseId,
      shop: trimmedShopId,
      refundMethod: trimmedRefundMethod,
      refundStatus: 'completed', // Auto-complete refund
      images,
      processedAt: new Date(),
      refundedAt: new Date(),
    });

    // Update product quantities immediately
    for (const productReturn of validatedProducts) {
      const product = await Product.findById(productReturn.product);
      if (product) {
        // Update returned quantity
        product.returnedQuantity = (product.returnedQuantity || 0) + productReturn.quantity;
        
        // If restockable, add back to available stock
        if (productReturn.restockable) {
          product.countInStock = (product.countInStock || 0) + productReturn.quantity;
        }
        
        await product.save();

        // Create product journey record
        await ProductJourney.create({
          product: product._id,
          user: req.user._id,
          action: 'return_processed',
          changes: [
            {
              field: 'returnedQuantity',
              oldValue: product.returnedQuantity - productReturn.quantity,
              newValue: product.returnedQuantity,
            },
            ...(productReturn.restockable ? [{
              field: 'countInStock',
              oldValue: product.countInStock - productReturn.quantity,
              newValue: product.countInStock,
            }] : []),
          ],
          notes: `Return processed: ${productReturn.returnReason}`,
        });
      }
    }

    // Populate the response
    const populatedReturn = await ProductReturn.findById(returnRecord._id)
      .populate('customer', 'name email phoneNumber')
      .populate('originalSale', 'invoiceNumber')
      .populate('products.product', 'name countInStock')
      .populate('warehouse', 'name code')
      .populate('shop', 'name code')
      .populate('requestedBy', 'name email')
      .populate('currency', 'name code symbol');

    res.status(201).json({
      status: 'success',
      data: populatedReturn,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Update product return (add notes only)
// @route   PUT /api/product-returns/:id
// @access  Private/Admin
const updateProductReturn = async (req, res) => {
  try {
    const { adminNotes } = req.body;
    
    const returnRecord = await ProductReturn.findById(req.params.id);
    if (!returnRecord) {
      return res.status(404).json({
        status: 'fail',
        message: 'Product return record not found',
      });
    }
    
    if (adminNotes) {
      returnRecord.adminNotes = adminNotes;
      await returnRecord.save();
    }

    // Populate the response
    const populatedReturn = await ProductReturn.findById(returnRecord._id)
      .populate('customer', 'name email phoneNumber')
      .populate('originalSale', 'invoiceNumber')
      .populate('products.product', 'name countInStock')
      .populate('warehouse', 'name code')
      .populate('shop', 'name code')
      .populate('requestedBy', 'name email')
      .populate('reviewedBy', 'name email')
      .populate('processedBy', 'name email')
      .populate('currency', 'name code symbol');

    res.json({
      status: 'success',
      data: populatedReturn,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Delete product return
// @route   DELETE /api/product-returns/:id
// @access  Private/Admin
const deleteProductReturn = async (req, res) => {
  try {
    const returnRecord = await ProductReturn.findById(req.params.id);
    
    if (returnRecord) {
      // Delete images from cloudinary
      if (returnRecord.images && returnRecord.images.length > 0) {
        for (const image of returnRecord.images) {
          if (image.publicId) {
            await cloudinary.uploader.destroy(image.publicId);
          }
        }
      }

      // Reverse the stock changes since return was already processed
      for (const productReturn of returnRecord.products) {
        const product = await Product.findById(productReturn.product);
        if (product) {
          // Reverse returned quantity
          product.returnedQuantity = Math.max(0, product.returnedQuantity - productReturn.quantity);
          
          // If was restocked, remove from available stock
          if (productReturn.restockable) {
            product.countInStock = Math.max(0, product.countInStock - productReturn.quantity);
          }
          
          await product.save();

          // Create product journey record
          await ProductJourney.create({
            product: product._id,
            user: req.user._id,
            action: 'return_deleted',
            changes: [
              {
                field: 'returnedQuantity',
                oldValue: product.returnedQuantity + productReturn.quantity,
                newValue: product.returnedQuantity,
              },
              ...(productReturn.restockable ? [{
                field: 'countInStock',
                oldValue: product.countInStock + productReturn.quantity,
                newValue: product.countInStock,
              }] : []),
            ],
            notes: 'Return record deleted - stock adjustments reversed',
          });
        }
      }

      await ProductReturn.deleteOne({ _id: req.params.id });
      
      res.json({
        status: 'success',
        message: 'Product return record removed',
      });
    } else {
      res.status(404).json({
        status: 'fail',
        message: 'Product return record not found',
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get return statistics
// @route   GET /api/product-returns/statistics
// @access  Private/Admin
const getReturnStatistics = async (req, res) => {
  try {
    const { startDate, endDate, customer, warehouse, shop } = req.query;
    
    const filter = { isActive: true };
    
    if (startDate && endDate) {
      filter.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }
    
    if (customer) filter.customer = customer;
    if (warehouse) filter.warehouse = warehouse;
    if (shop) filter.shop = shop;

    const stats = await ProductReturn.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalReturns: { $sum: 1 },
          totalRefundAmount: { $sum: '$totalRefundAmount' },
          pendingCount: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
          },
          approvedCount: {
            $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] }
          },
          rejectedCount: {
            $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] }
          },
          processedCount: {
            $sum: { $cond: [{ $eq: ['$status', 'processed'] }, 1, 0] }
          },
        }
      }
    ]);

    const returnReasonStats = await ProductReturn.aggregate([
      { $match: filter },
      { $unwind: '$products' },
      {
        $group: {
          _id: '$products.returnReason',
          count: { $sum: 1 },
          totalQuantity: { $sum: '$products.quantity' },
          totalRefundAmount: { $sum: '$products.refundAmount' },
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.json({
      status: 'success',
      data: {
        overview: stats[0] || {
          totalReturns: 0,
          totalRefundAmount: 0,
          pendingCount: 0,
          approvedCount: 0,
          rejectedCount: 0,
          processedCount: 0,
        },
        byReturnReason: returnReasonStats,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get product returns by warehouse or shop ID
// @route   GET /api/product-returns/by-location/:locationType/:locationId
// @access  Private/Admin
const getProductReturnsByLocation = async (req, res) => {
  try {
    const { locationType, locationId } = req.params;
    const { 
      page = 1, 
      limit = 10,
      status,
      customer,
      returnReason,
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
    if (customer) filter.customer = customer;
    
    // Filter by return reason in products array
    if (returnReason) {
      filter['products.returnReason'] = returnReason;
    }
    
    // Determine sort options
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    // Count total documents for pagination info
    const totalReturns = await ProductReturn.countDocuments(filter);
    
    // Find returns with pagination and sorting
    const returns = await ProductReturn.find(filter)
      .populate('customer', 'name email phoneNumber')
      .populate('originalSale', 'invoiceNumber')
      .populate('products.product', 'name countInStock')
      .populate('warehouse', 'name code')
      .populate('shop', 'name code')
      .populate('requestedBy', 'name email')
      .populate('reviewedBy', 'name email')
      .populate('processedBy', 'name email')
      .populate('currency', 'name code symbol')
      .sort(sort)
      .skip(skip)
      .limit(limitNum);

    res.json({
      status: 'success',
      results: returns.length,
      totalPages: Math.ceil(totalReturns / limitNum),
      currentPage: pageNum,
      totalReturns,
      location: {
        type: locationType,
        id: locationId,
        name: locationExists.name,
        code: locationExists.code
      },
      data: returns,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

module.exports = {
  getProductReturns,
  getProductReturnById,
  createProductReturn,
  updateProductReturn,
  deleteProductReturn,
  getReturnStatistics,
  getProductReturnsByLocation,
};
