const ProductReturn = require('../models/productReturnModel');
const Product = require('../models/productModel');
const Sales = require('../models/salesModel');
const Customer = require('../models/customerModel');
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
      productQuantities,
      returnReason,
      returnReasons,
      condition,
      conditions,
      customerNotes,
      warehouse,
      shop,
      refundMethod
    } = req.body;

    // Validate required fields - support both old format (products array) and new format (products + productQuantities arrays)
    let productsArray = [];
    let quantitiesArray = [];
    let returnReasonsArray = [];
    let conditionsArray = [];

    // Check if new format is being used (products and productQuantities as separate arrays)
    if (products && Array.isArray(products) && productQuantities && Array.isArray(productQuantities)) {
      // New format: products and productQuantities as separate arrays
      if (products.length === 0 || productQuantities.length === 0) {
        return res.status(400).json({
          status: 'fail',
          message: 'Products and productQuantities arrays cannot be empty',
        });
      }
      if (products.length !== productQuantities.length) {
        return res.status(400).json({
          status: 'fail',
          message: 'Products and productQuantities arrays must have the same length',
        });
      }
      productsArray = products;
      quantitiesArray = productQuantities;
      
      // Handle returnReasons and conditions as arrays or single values
      if (returnReasons && Array.isArray(returnReasons)) {
        if (returnReasons.length !== products.length) {
          return res.status(400).json({
            status: 'fail',
            message: 'returnReasons array must have the same length as products array',
          });
        }
        returnReasonsArray = returnReasons;
      } else if (returnReason) {
        // Single returnReason applied to all products
        returnReasonsArray = new Array(products.length).fill(returnReason);
      } else {
        return res.status(400).json({
          status: 'fail',
          message: 'returnReason or returnReasons array is required',
        });
      }

      if (conditions && Array.isArray(conditions)) {
        if (conditions.length !== products.length) {
          return res.status(400).json({
            status: 'fail',
            message: 'conditions array must have the same length as products array',
          });
        }
        conditionsArray = conditions;
      } else if (condition) {
        // Single condition applied to all products
        conditionsArray = new Array(products.length).fill(condition);
      } else {
        return res.status(400).json({
          status: 'fail',
          message: 'condition or conditions array is required',
        });
      }
    } else if (products && Array.isArray(products) && products.length > 0) {
      // Old format: products as array of objects
      productsArray = products.map(p => p.product);
      quantitiesArray = products.map(p => p.quantity);
      returnReasonsArray = products.map(p => p.returnReason);
      conditionsArray = products.map(p => p.condition);
    } else {
      return res.status(400).json({
        status: 'fail',
        message: 'Customer and products are required. Use either products array (old format) or products + productQuantities arrays (new format)',
      });
    }

    if (!customer) {
      return res.status(400).json({
        status: 'fail',
        message: 'Customer is required',
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
    let linkedSale = null;
    if (originalSale) {
      const trimmedSaleId = originalSale.toString().trim();
      if (!trimmedSaleId.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({
          status: 'fail',
          message: 'Invalid original sale ID format',
        });
      }
      linkedSale = await Sales.findById(trimmedSaleId);
      if (!linkedSale) {
        return res.status(404).json({
          status: 'fail',
          message: 'Original sale not found',
        });
      }
    }

    // Validate products and calculate refund amounts
    let totalRefundAmount = 0;
    const validatedProducts = [];
    const productDetailMap = new Map();

    // Process each product with its quantity, returnReason, and condition
    for (let i = 0; i < productsArray.length; i++) {
      const product = productsArray[i];
      const quantity = quantitiesArray[i];
      const productReturnReason = returnReasonsArray[i];
      const productCondition = conditionsArray[i];

      if (!product || !quantity || !productReturnReason || !productCondition) {
        return res.status(400).json({
          status: 'fail',
          message: `Product, quantity, return reason, and condition are required for item at index ${i}`,
        });
      }

      // Trim and validate product ID
      const trimmedProductId = product.toString().trim();
      if (!trimmedProductId.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({
          status: 'fail',
          message: `Invalid product ID format at index ${i}`,
        });
      }

      // Trim and validate enum values for product
      const trimmedProductReturnReason = productReturnReason.toString().trim();
      const trimmedCondition = productCondition.toString().trim();
      
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
      // Use product's saleRate as originalPrice (fallback)
      let originalPrice = productExists.saleRate || 0;
      
      // If linked to a sale, use the actual sale item price (most accurate)
      if (linkedSale) {
        const saleItem = (linkedSale.items || []).find(
          item => item.product && item.product.toString() === trimmedProductId
        );
        if (saleItem && saleItem.price) {
          originalPrice = Number(saleItem.price || 0);
        }
      }
      
      // Check if old format was used (products array contains objects with originalPrice)
      if (products && Array.isArray(products) && products.length > 0 && typeof products[0] === 'object' && 'originalPrice' in products[0]) {
        // Old format: products is array of objects, check if originalPrice was provided
        const oldFormatProduct = products.find(p => p.product && p.product.toString().trim() === trimmedProductId);
        if (oldFormatProduct && oldFormatProduct.originalPrice) {
          originalPrice = oldFormatProduct.originalPrice;
        }
      }
      
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
      productDetailMap.set(trimmedProductId, {
        name: productExists.name || 'Unknown Product',
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

    // Before creating return, ensure sale (if provided) contains the products/quantities being returned
    if (linkedSale) {
      const saleItemMap = new Map();
      for (const item of linkedSale.items || []) {
        if (item && item.product) {
          saleItemMap.set(item.product.toString(), item);
        }
      }

      for (const productReturn of validatedProducts) {
        const saleItem = saleItemMap.get(productReturn.product);
        const productName = productDetailMap.get(productReturn.product)?.name || productReturn.product;
        if (!saleItem) {
          return res.status(400).json({
            status: 'fail',
            message: `Original sale does not include product ${productName}`,
          });
        }
        if (Number(saleItem.quantity || 0) < Number(productReturn.quantity || 0)) {
          return res.status(400).json({
            status: 'fail',
            message: `Cannot return ${productReturn.quantity} units of ${productName}. Sale only contains ${saleItem.quantity}.`,
          });
        }
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
        
        // Reduce soldOutQuantity since items are being returned
        const currentSoldOut = Number(product.soldOutQuantity || 0);
        product.soldOutQuantity = Math.max(0, currentSoldOut - Number(productReturn.quantity));
        
        // If restockable, add back to available stock
        if (productReturn.restockable) {
          product.countInStock = (product.countInStock || 0) + productReturn.quantity;
        }
        
        await product.save();
      }
    }

    // If linked to a sale, adjust the sale quantities and totals
    if (linkedSale) {
      const saleChanges = [];
      for (const productReturn of validatedProducts) {
        const saleItem = (linkedSale.items || []).find(
          item => item.product && item.product.toString() === productReturn.product
        );
        if (!saleItem) {
          continue; // Shouldn't happen due to earlier validation, but guard anyway
        }
        const prevQuantity = Number(saleItem.quantity || 0);
        const newQuantity = Math.max(0, prevQuantity - Number(productReturn.quantity || 0));
        if (newQuantity !== prevQuantity) {
          saleChanges.push({
            field: `item:${saleItem.product.toString()}`,
            oldValue: prevQuantity,
            newValue: newQuantity,
          });
        }
        saleItem.quantity = newQuantity;
        saleItem.total = Number(saleItem.price || 0) * Number(saleItem.quantity || 0);
      }

      // Remove any zero-quantity items
      linkedSale.items = (linkedSale.items || []).filter(item => Number(item.quantity || 0) > 0);

      // If all items were returned, set totals to 0
      const previousTotalAmount = Number(linkedSale.totalAmount || 0);
      const previousGrandTotal = Number(linkedSale.grandTotal || 0);

      if (linkedSale.items.length === 0) {
        linkedSale.totalAmount = 0;
        linkedSale.grandTotal = 0;
      } else {
        linkedSale.totalAmount = (linkedSale.items || []).reduce(
          (sum, item) => sum + Number(item.total || 0),
          0
        );
        linkedSale.grandTotal =
          Number(linkedSale.totalAmount || 0) -
          Number(linkedSale.discount || 0) +
          Number(linkedSale.tax || 0);
      }

      if (previousTotalAmount !== linkedSale.totalAmount) {
        saleChanges.push({
          field: 'totalAmount',
          oldValue: previousTotalAmount,
          newValue: linkedSale.totalAmount,
        });
      }

      if (previousGrandTotal !== linkedSale.grandTotal) {
        saleChanges.push({
          field: 'grandTotal',
          oldValue: previousGrandTotal,
          newValue: linkedSale.grandTotal,
        });
      }

      // Always save the sale if we made any modifications
      // (saleChanges will have at least item quantity changes if we processed returns)
      await linkedSale.save();
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

// @desc    Update product return
// @route   PUT /api/product-returns/:id
// @access  Private/Admin
const updateProductReturn = async (req, res) => {
  try {
    const {
      adminNotes,
      products,
      productQuantities,
      returnReason,
      returnReasons,
      condition,
      conditions,
      customerNotes,
      warehouse,
      shop,
      refundMethod,
      status,
      refundStatus
    } = req.body;
    
    const returnRecord = await ProductReturn.findById(req.params.id);
    if (!returnRecord) {
      return res.status(404).json({
        status: 'fail',
        message: 'Product return record not found',
      });
    }

    // Store old products for stock reversal if needed
    const oldProducts = returnRecord.products;
    const wasProcessed = returnRecord.status === 'processed' || returnRecord.status === 'refunded';
    let productsUpdated = false;

    // Handle products update with new array format
    if (products && productQuantities) {
      productsUpdated = true;
      
      // Validate required fields - support both old format (products array) and new format (products + productQuantities arrays)
      let productsArray = [];
      let quantitiesArray = [];
      let returnReasonsArray = [];
      let conditionsArray = [];

      // Check if new format is being used (products and productQuantities as separate arrays)
      if (products && Array.isArray(products) && productQuantities && Array.isArray(productQuantities)) {
        // New format: products and productQuantities as separate arrays
        if (products.length === 0 || productQuantities.length === 0) {
          return res.status(400).json({
            status: 'fail',
            message: 'Products and productQuantities arrays cannot be empty',
          });
        }
        if (products.length !== productQuantities.length) {
          return res.status(400).json({
            status: 'fail',
            message: 'Products and productQuantities arrays must have the same length',
          });
        }
        productsArray = products;
        quantitiesArray = productQuantities;
        
        // Handle returnReasons and conditions as arrays or single values
        if (returnReasons && Array.isArray(returnReasons)) {
          if (returnReasons.length !== products.length) {
            return res.status(400).json({
              status: 'fail',
              message: 'returnReasons array must have the same length as products array',
            });
          }
          returnReasonsArray = returnReasons;
        } else if (returnReason) {
          // Single returnReason applied to all products
          returnReasonsArray = new Array(products.length).fill(returnReason);
        } else {
          // Use existing returnReasons from old products if available
          returnReasonsArray = oldProducts.map(p => p.returnReason);
        }

        if (conditions && Array.isArray(conditions)) {
          if (conditions.length !== products.length) {
            return res.status(400).json({
              status: 'fail',
              message: 'conditions array must have the same length as products array',
            });
          }
          conditionsArray = conditions;
        } else if (condition) {
          // Single condition applied to all products
          conditionsArray = new Array(products.length).fill(condition);
        } else {
          // Use existing conditions from old products if available
          conditionsArray = oldProducts.map(p => p.condition);
        }
      } else if (products && Array.isArray(products) && products.length > 0) {
        // Old format: products as array of objects
        productsArray = products.map(p => p.product);
        quantitiesArray = products.map(p => p.quantity);
        returnReasonsArray = products.map(p => p.returnReason);
        conditionsArray = products.map(p => p.condition);
      } else {
        return res.status(400).json({
          status: 'fail',
          message: 'Invalid products format. Use either products array (old format) or products + productQuantities arrays (new format)',
        });
      }

      // Validate products and calculate refund amounts
      let totalRefundAmount = 0;
      const validatedProducts = [];

      // Process each product with its quantity, returnReason, and condition
      for (let i = 0; i < productsArray.length; i++) {
        const product = productsArray[i];
        const quantity = quantitiesArray[i];
        const productReturnReason = returnReasonsArray[i];
        const productCondition = conditionsArray[i];

        if (!product || !quantity || !productReturnReason || !productCondition) {
          return res.status(400).json({
            status: 'fail',
            message: `Product, quantity, return reason, and condition are required for item at index ${i}`,
          });
        }

        // Trim and validate product ID
        const trimmedProductId = product.toString().trim();
        if (!trimmedProductId.match(/^[0-9a-fA-F]{24}$/)) {
          return res.status(400).json({
            status: 'fail',
            message: `Invalid product ID format at index ${i}`,
          });
        }

        // Trim and validate enum values for product
        const trimmedProductReturnReason = productReturnReason.toString().trim();
        const trimmedCondition = productCondition.toString().trim();
        
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
            message: `Invalid return reason at index ${i}. Valid options: ${validReturnReasons.join(', ')}`,
          });
        }

        if (!validConditions.includes(trimmedCondition)) {
          return res.status(400).json({
            status: 'fail',
            message: `Invalid condition at index ${i}. Valid options: ${validConditions.join(', ')}`,
          });
        }

        // Check if product exists
        const productExists = await Product.findById(trimmedProductId);
        if (!productExists) {
          return res.status(404).json({
            status: 'fail',
            message: `Product ${trimmedProductId} not found at index ${i}`,
          });
        }

        // Calculate refund amount based on condition
        let refundAmount = 0;
        // Use product's saleRate as originalPrice (old format may have provided originalPrice in product object)
        let originalPrice = productExists.saleRate || 0;
        // Check if old format was used (products array contains objects with originalPrice)
        if (products && Array.isArray(products) && products.length > 0 && typeof products[0] === 'object' && 'originalPrice' in products[0]) {
          // Old format: products is array of objects, check if originalPrice was provided
          const oldFormatProduct = products.find(p => p.product && p.product.toString().trim() === trimmedProductId);
          if (oldFormatProduct && oldFormatProduct.originalPrice) {
            originalPrice = oldFormatProduct.originalPrice;
          }
        }
        
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

      // If return was already processed, reverse old stock changes first
      if (wasProcessed) {
        for (const oldProductReturn of oldProducts) {
          const product = await Product.findById(oldProductReturn.product);
          if (product) {
            // Reverse returned quantity
            product.returnedQuantity = Math.max(0, (product.returnedQuantity || 0) - oldProductReturn.quantity);
            
            // If was restocked, remove from available stock
            if (oldProductReturn.restockable) {
              product.countInStock = Math.max(0, (product.countInStock || 0) - oldProductReturn.quantity);
            }
            
            await product.save();
          }
        }
      }

      // Update products and totalRefundAmount
      returnRecord.products = validatedProducts;
      returnRecord.totalRefundAmount = totalRefundAmount;

      // Apply new stock changes if was processed
      if (wasProcessed) {
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
          }
        }
      }
    }

    // Update other fields
    if (adminNotes !== undefined) {
      returnRecord.adminNotes = adminNotes;
    }
    
    if (customerNotes !== undefined) {
      returnRecord.customerNotes = customerNotes;
    }

    if (returnReason !== undefined && !productsUpdated) {
      returnRecord.returnReason = returnReason;
    }

    // Validate and update warehouse/shop
    if (warehouse !== undefined || shop !== undefined) {
      if (warehouse && shop) {
        return res.status(400).json({
          status: 'fail',
          message: 'Cannot specify both warehouse and shop',
        });
      }

      if (warehouse) {
        const trimmedWarehouseId = warehouse.toString().trim();
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
        returnRecord.warehouse = trimmedWarehouseId;
        returnRecord.shop = null;
      }

      if (shop) {
        const trimmedShopId = shop.toString().trim();
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
        returnRecord.shop = trimmedShopId;
        returnRecord.warehouse = null;
      }
    }

    // Validate and update refund method
    if (refundMethod !== undefined) {
      const trimmedRefundMethod = refundMethod.toString().trim();
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
      returnRecord.refundMethod = trimmedRefundMethod;
    }

    // Validate and update status
    if (status !== undefined) {
      const validStatuses = ['pending', 'approved', 'rejected', 'processed', 'refunded'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          status: 'fail',
          message: `Invalid status. Valid options: ${validStatuses.join(', ')}`,
        });
      }
      returnRecord.status = status;
      
      if (status === 'processed' && !returnRecord.processedAt) {
        returnRecord.processedAt = new Date();
        returnRecord.processedBy = req.user._id;
      }
    }

    // Validate and update refund status
    if (refundStatus !== undefined) {
      const validRefundStatuses = ['pending', 'processed', 'completed'];
      if (!validRefundStatuses.includes(refundStatus)) {
        return res.status(400).json({
          status: 'fail',
          message: `Invalid refund status. Valid options: ${validRefundStatuses.join(', ')}`,
        });
      }
      returnRecord.refundStatus = refundStatus;
      
      if (refundStatus === 'completed' && !returnRecord.refundedAt) {
        returnRecord.refundedAt = new Date();
      }
    }

    await returnRecord.save();

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
