const Product = require('../models/productModel');
const ProductJourney = require('../models/productJourneyModel');
const Category = require('../models/categoryModel');
const Currency = require('../models/currencyModel');
const QuantityUnit = require('../models/quantityUnitModel');
const PackingUnit = require('../models/packingUnitModel');
const Pochues = require('../models/pochuesModel');
const cloudinary = require('../config/cloudinary');
const currencyUtils = require('../utils/currencyUtils');
const StockTransfer = require('../models/stockTransferModel');
const Shop = require('../models/shopModel');
const Purchase = require('../models/purchaseModel');

// Helper function to clean up orphaned product references
const cleanupOrphanedReferences = async () => {
  try {
    // Clean up purchases with null product references
    const purchasesWithNullProducts = await Purchase.find({
      'items.product': { $exists: false }
    });
    
    if (purchasesWithNullProducts.length > 0) {
      console.log(`Found ${purchasesWithNullProducts.length} purchases with null product references`);
      // You can implement cleanup logic here if needed
    }
    
    // Clean up stock transfers with null product references
    const transfersWithNullProducts = await StockTransfer.find({
      'items.product': { $exists: false }
    });
    
    if (transfersWithNullProducts.length > 0) {
      console.log(`Found ${transfersWithNullProducts.length} stock transfers with null product references`);
      // You can implement cleanup logic here if needed
    }
  } catch (error) {
    console.error('Error cleaning up orphaned references:', error);
  }
};

// @desc    Get all products
// @route   GET /api/products
// @access  Public
const getProducts = async (req, res) => {
  try {
    const { 
      keyword = '', 
      category,
      supplier,
      warehouse,
      page = 1, 
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      minPrice,
      maxPrice,
      inStock
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    // Build filter object
    const filter = {};
    
    // Search by keyword in name or description
    if (keyword) {
      filter.$or = [
        { name: { $regex: keyword, $options: 'i' } },
        { description: { $regex: keyword, $options: 'i' } }
      ];
    }
    
    // Filter by category
    if (category) {
      filter.category = category;
    }
    
    // Filter by supplier
    if (supplier) {
      filter.supplier = supplier;
    }
    
    // Filter by warehouse
    if (warehouse) {
      filter.warehouse = warehouse;
    }
    
    // Filter by price range
    if (minPrice || maxPrice) {
      filter.saleRate = {};
      if (minPrice) filter.saleRate.$gte = parseFloat(minPrice);
      if (maxPrice) filter.saleRate.$lte = parseFloat(maxPrice);
    }
    
    // Filter by stock availability (considering damaged and returned quantities)
    if (inStock === 'true') {
      filter.$expr = {
        $gt: [
          { $subtract: [
            { $subtract: ['$countInStock', { $ifNull: ['$damagedQuantity', 0] }] },
            { $ifNull: ['$returnedQuantity', 0] }
          ]},
          0
        ]
      };
    } else if (inStock === 'false') {
      filter.$expr = {
        $lte: [
          { $subtract: [
            { $subtract: ['$countInStock', { $ifNull: ['$damagedQuantity', 0] }] },
            { $ifNull: ['$returnedQuantity', 0] }
          ]},
          0
        ]
      };
    }
    
    // Only show active products
    filter.isActive = true;
    
    // Determine sort options
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    // Count total documents for pagination info
    const totalProducts = await Product.countDocuments(filter);
    
    // Find products based on filters with pagination and sorting
    const products = await Product.find(filter)
      .populate('category', 'name')
      .populate('supplier', 'name')
      .populate('warehouse', 'name code')
      .populate('currency', 'name code symbol')
      .populate('quantityUnit', 'name')
      .populate('packingUnit', 'name')
      .populate('pochues', 'name')
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

// @desc    Get product by ID
// @route   GET /api/products/:id
// @access  Public
const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('category', 'name')
      .populate('supplier', 'name email phoneNumber')
      .populate('warehouse', 'name code')
      .populate('currency', 'name code symbol')
      .populate('quantityUnit', 'name')
      .populate('packingUnit', 'name')
      .populate('pochues', 'name')
      .populate('reviews.user', 'name email');

    if (product) {
      res.json({
        status: 'success',
        data: product,
      });
    } else {
      res.status(404).json({
        status: 'fail',
        message: 'Product not found',
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Delete product
// @route   DELETE /api/products/:id
// @access  Private/Admin
const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (product) {
      // Delete product image from cloudinary if exists
      if (product.imagePublicId) {
        await cloudinary.uploader.destroy(product.imagePublicId);
      }
      
      // Create product journey record before deleting
      await ProductJourney.create({
        product: product._id,
        user: req.user._id,
        action: 'deleted',
        changes: [],
        notes: `Product ${product.name} deleted`,
      });
      
      await Product.deleteOne({ _id: req.params.id });
      
      res.json({
        status: 'success',
        message: 'Product removed',
      });
    } else {
      res.status(404).json({
        status: 'fail',
        message: 'Product not found',
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Create product
// @route   POST /api/products
// @access  Private/Admin
const createProduct = async (req, res) => {
  try {
    const {
      name,
      category,
      supplier,
      warehouse,
      currency,
      description,
      purchaseRate,
      saleRate,
      wholesaleRate,
      retailRate,
      size,
      color,
      quantityUnit,
      packingUnit,
      pochues,
      pouchesOrPieces,
      countInStock
    } = req.body;
    
    // Check if category exists (only if provided)
    if (category) {
      const categoryExists = await Category.findById(category);
      if (!categoryExists) {
        return res.status(400).json({
          status: 'fail',
          message: 'Invalid category',
        });
      }
    }

    // Check if quantity unit exists (only if provided)
    if (quantityUnit) {
      const quantityUnitExists = await QuantityUnit.findById(quantityUnit);
      if (!quantityUnitExists) {
        return res.status(400).json({
          status: 'fail',
          message: 'Invalid quantity unit',
        });
      }
    }

    // Check if packing unit exists (only if provided)
    if (packingUnit) {
      const packingUnitExists = await PackingUnit.findById(packingUnit);
      if (!packingUnitExists) {
        return res.status(400).json({
          status: 'fail',
          message: 'Invalid packing unit',
        });
      }
    }

    // Check if pochues exists (only if provided)
    if (pochues) {
      const pochuesExists = await Pochues.findById(pochues);
      if (!pochuesExists) {
        return res.status(400).json({
          status: 'fail',
          message: 'Invalid pochues',
        });
      }
    }
    
    // Upload image to cloudinary if provided
    let imageUrl = '';
    let imagePublicId = '';
    
    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: 'products',
      });
      
      imageUrl = result.secure_url;
      imagePublicId = result.public_id;
    }
    
    // Get currency exchange rate if currency is provided
    let currencyExchangeRate = 1;
    if (currency) {
      const currencyDoc = await Currency.findById(currency);
      if (currencyDoc) {
        currencyExchangeRate = currencyDoc.exchangeRate;
      }
    }

    const product = await Product.create({
      user: req.user._id,
      name,
      image: imageUrl,
      imagePublicId,
      category: category || null,
      supplier: supplier || null,
      warehouse: warehouse || null,
      currency: currency || null,
      currencyExchangeRate,
      description: description || '',
      purchaseRate: purchaseRate || 0,
      saleRate: saleRate || 0,
      wholesaleRate: wholesaleRate || 0,
      retailRate: retailRate || 0,
      size: size || '',
      color: color || '',
      quantityUnit: quantityUnit || null,
      packingUnit: packingUnit || null,
      pochues: pochues || null,
      pouchesOrPieces: pouchesOrPieces || 0,
      countInStock: countInStock || 0,
    });
    
    // Create product journey record
    await ProductJourney.create({
      product: product._id,
      user: req.user._id,
      action: 'created',
      changes: [],
      notes: 'Product created',
    });
    
    if (product) {
    res.status(201).json({
      status: 'success',
        data: product,
      });
    } else {
      res.status(400).json({
        status: 'fail',
        message: 'Invalid product data',
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Update product
// @route   PUT /api/products/:id
// @access  Private/Admin
const updateProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (product) {
      const oldProduct = { ...product.toObject() };
      const changes = [];
      
      // Update fields if provided
      for (const [key, value] of Object.entries(req.body)) {
        if (key !== 'image' && product[key] !== value) {
          changes.push({
            field: key,
            oldValue: product[key],
            newValue: value,
          });
          product[key] = value;
          
          // If currency is being updated, also update the exchange rate
          if (key === 'currency' && value) {
            const currencyDoc = await Currency.findById(value);
            if (currencyDoc) {
              changes.push({
                field: 'currencyExchangeRate',
                oldValue: product.currencyExchangeRate,
                newValue: currencyDoc.exchangeRate,
              });
              product.currencyExchangeRate = currencyDoc.exchangeRate;
            }
          }

          // Validate unit relationships if being updated
          if (key === 'quantityUnit' && value) {
            const quantityUnitExists = await QuantityUnit.findById(value);
            if (!quantityUnitExists) {
              return res.status(400).json({
                status: 'fail',
                message: 'Invalid quantity unit',
              });
            }
          }

          if (key === 'packingUnit' && value) {
            const packingUnitExists = await PackingUnit.findById(value);
            if (!packingUnitExists) {
              return res.status(400).json({
                status: 'fail',
                message: 'Invalid packing unit',
              });
            }
          }

          if (key === 'pochues' && value) {
            const pochuesExists = await Pochues.findById(value);
            if (!pochuesExists) {
              return res.status(400).json({
                status: 'fail',
                message: 'Invalid pochues',
              });
            }
          }
        }
      }
      
      // Upload new image if provided
      if (req.file) {
        // Delete old image from cloudinary if exists
        if (product.imagePublicId) {
          await cloudinary.uploader.destroy(product.imagePublicId);
        }
        
        // Upload new image
        const result = await cloudinary.uploader.upload(req.file.path, {
          folder: 'products',
        });
        
        changes.push({
          field: 'image',
          oldValue: product.image,
          newValue: result.secure_url,
        });
        
        product.image = result.secure_url;
        product.imagePublicId = result.public_id;
      }
      
      // Create product journey record
        await ProductJourney.create({
          product: product._id,
          user: req.user._id,
          action: 'updated',
        changes,
        notes: 'Product updated',
      });
      
      const updatedProduct = await product.save();
      
      res.json({
        status: 'success',
        data: updatedProduct,
      });
    } else {
      res.status(404).json({
        status: 'fail',
        message: 'Product not found',
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Create product review
// @route   POST /api/products/:id/reviews
// @access  Private
const createProductReview = async (req, res) => {
  try {
    const { rating, comment } = req.body;

    const product = await Product.findById(req.params.id);

    if (product) {
      // Check if user already reviewed this product
      const alreadyReviewed = product.reviews.find(
        (review) => review.user.toString() === req.user._id.toString()
      );

      if (alreadyReviewed) {
        return res.status(400).json({
          status: 'fail',
          message: 'Product already reviewed',
        });
      }

      const review = {
        user: req.user._id,
        name: req.user.name,
        rating: Number(rating),
        comment,
      };

      product.reviews.push(review);
      product.numReviews = product.reviews.length;
      product.rating =
        product.reviews.reduce((acc, item) => item.rating + acc, 0) /
        product.reviews.length;

      await product.save();
      
      // Create product journey record
      await ProductJourney.create({
        product: product._id,
        user: req.user._id,
        action: 'review_added',
        changes: [
          {
            field: 'reviews',
            oldValue: null,
            newValue: review,
          },
        ],
        notes: 'Review added',
      });
      
      res.status(201).json({
        status: 'success',
        message: 'Review added',
      });
    } else {
      res.status(404).json({
        status: 'fail',
        message: 'Product not found',
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get product journey by product ID
// @route   GET /api/products/:id/journey
// @access  Private/Admin
const getProductJourneyByProductId = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 10 } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    // Check if product exists
    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({
        status: 'fail',
        message: 'Product not found',
      });
    }
    
    // Count total documents for pagination info
    const totalJourneys = await ProductJourney.countDocuments({ product: id });
    
    // Get journey records
    const journeys = await ProductJourney.find({ product: id })
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);
      
    res.json({
      status: 'success',
      results: journeys.length,
      totalPages: Math.ceil(totalJourneys / limitNum),
      currentPage: pageNum,
      totalJourneys,
      data: journeys,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Convert product prices to a different currency
// @route   GET /api/products/:id/convert-price
// @access  Public
const convertProductPrice = async (req, res) => {
  try {
    const { targetCurrencyId, date } = req.query;
    
    if (!targetCurrencyId) {
      return res.status(400).json({
        status: 'fail',
        message: 'Please provide a target currency ID',
      });
    }

    const product = await Product.findById(req.params.id)
      .populate('currency', 'name code symbol exchangeRate');

    if (!product) {
      return res.status(404).json({
        status: 'fail',
        message: 'Product not found',
      });
    }

    if (!product.currency) {
      return res.status(400).json({
        status: 'fail',
        message: 'Product does not have a currency assigned',
      });
    }

    // Use the utility function for currency conversion
    const conversionDate = date ? new Date(date) : null;
    
    // Convert each price type
    const purchaseRateConversion = await currencyUtils.convertAmount(
      product.currency._id, 
      targetCurrencyId, 
      product.purchaseRate,
      conversionDate
    );
    
    const saleRateConversion = await currencyUtils.convertAmount(
      product.currency._id, 
      targetCurrencyId, 
      product.saleRate,
      conversionDate
    );
    
    const wholesaleRateConversion = await currencyUtils.convertAmount(
      product.currency._id, 
      targetCurrencyId, 
      product.wholesaleRate,
      conversionDate
    );
    
    const retailRateConversion = await currencyUtils.convertAmount(
      product.currency._id, 
      targetCurrencyId, 
      product.retailRate,
      conversionDate
    );

    // Format the response
    const convertedPrices = {
      purchaseRate: purchaseRateConversion.to.amount,
      saleRate: saleRateConversion.to.amount,
      wholesaleRate: wholesaleRateConversion.to.amount,
      retailRate: retailRateConversion.to.amount,
    };

    const formattedPrices = {
      purchaseRate: currencyUtils.formatAmountWithCurrency(
        convertedPrices.purchaseRate, 
        purchaseRateConversion.to.currency
      ),
      saleRate: currencyUtils.formatAmountWithCurrency(
        convertedPrices.saleRate, 
        saleRateConversion.to.currency
      ),
      wholesaleRate: currencyUtils.formatAmountWithCurrency(
        convertedPrices.wholesaleRate, 
        wholesaleRateConversion.to.currency
      ),
      retailRate: currencyUtils.formatAmountWithCurrency(
        convertedPrices.retailRate, 
        retailRateConversion.to.currency
      ),
    };

    res.json({
      status: 'success',
      data: {
        product: {
          _id: product._id,
          name: product.name,
          originalCurrency: product.currency,
          originalPrices: {
            purchaseRate: product.purchaseRate,
            saleRate: product.saleRate,
            wholesaleRate: product.wholesaleRate,
            retailRate: product.retailRate,
          },
          targetCurrency: purchaseRateConversion.to.currency,
          convertedPrices,
          formattedPrices,
          conversionRate: purchaseRateConversion.rate,
          conversionDate: purchaseRateConversion.date
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get products by location (warehouse or shop)
// @route   GET /api/products/location/:locationType/:locationId
// @access  Private
const getProductsByLocation = async (req, res) => {
  try {
    const { locationType, locationId } = req.params;
    
    // Optional: Run cleanup for orphaned references (can be commented out in production)
    // await cleanupOrphanedReferences();
    
    if (!['warehouse', 'shop'].includes(locationType)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Location type must be either "warehouse" or "shop"'
      });
    }
    
    let products = [];
    
    // Case 1: Get products for shop (same logic as warehouse)
    if (locationType === 'shop') {
      // First check if shop exists
      const shop = await Shop.findById(locationId);
      if (!shop) {
        return res.status(404).json({ status: 'fail', message: 'Shop not found' });
      }
      
      // Create a product map to track quantities
      const productMap = {};
      
      // Step 1: Handle incoming transfers TO this shop
      const incomingTransfers = await StockTransfer.find({
        destinationType: 'shop',
        destinationId: locationId,
        'items.product': { $exists: true, $ne: null }
      }).populate({
        path: 'items.product',
        match: { _id: { $exists: true } }
      });
      
      incomingTransfers.forEach(transfer => {
        transfer.items.forEach(item => {
          // Check if product exists and is not null
          if (!item.product || !item.product._id) {
            console.warn(`Stock transfer ${transfer._id} has null product reference in item`);
            return; // Skip this item
          }
          
          const productId = item.product._id.toString();
          
          if (productMap[productId]) {
            // Product already exists in map, add to its quantity
            productMap[productId].currentStock += item.quantity;
          } else {
            // Product is new to this shop via transfer
            const productData = item.product.toObject();
            productMap[productId] = {
              ...productData,
              initialStock: 0, // Not originally in this shop
              currentStock: item.quantity,
            };
          }
        });
      });
      
      // Step 2: Handle outgoing transfers FROM this shop
      const outgoingTransfers = await StockTransfer.find({
        sourceType: 'shop',
        sourceId: locationId,
        
      });
      
      outgoingTransfers.forEach(transfer => {
        transfer.items.forEach(item => {
          const productId = item.product.toString();
          
          if (productMap[productId]) {
            // Reduce the quantity for outgoing transfers
            productMap[productId].currentStock -= item.quantity;
          }
        });
      });
      
      // Convert map back to array and only include products with available stock > 0
      products = Object.values(productMap).filter(product => {
        const availableStock = product.currentStock - (product.damagedQuantity || 0) - (product.returnedQuantity || 0);
        return availableStock > 0;
      });
    } 
    // Case 2: Get products from warehouse 
    else {
      // Step 1: Get products originally assigned to this warehouse
      const originalProducts = await Product.find({ warehouse: locationId }).lean();
      
      // Create a map for faster lookups
      const productMap = {};
      originalProducts.forEach(product => {
        productMap[product._id.toString()] = {
          ...product,
          initialStock: product.countInStock,
          currentStock: product.countInStock,
        };
      });
      
      // Step 2: Add purchases for this warehouse
      const purchases = await Purchase.find({
        warehouse: locationId,
        'items.product': { $exists: true, $ne: null },
        isActive: true
      }).populate({
        path: 'items.product',
        match: { _id: { $exists: true } }
      });
      
      purchases.forEach(purchase => {
        purchase.items.forEach(item => {
          // Check if product exists and is not null
          if (!item.product || !item.product._id) {
            console.warn(`Purchase ${purchase._id} has null product reference in item`);
            return; // Skip this item
          }
          
          const productId = item.product._id.toString();
          
          if (productMap[productId]) {
            // Product already exists in this warehouse, add purchase quantity
            productMap[productId].currentStock += item.quantity;
          } else {
            // Product is new to this warehouse via purchase
            const productData = item.product.toObject();
            productMap[productId] = {
              ...productData,
              initialStock: 0, // Not originally in this warehouse
              currentStock: item.quantity,
            };
          }
        });
      });
      
      // Step 3: Handle incoming transfers (adding stock to this warehouse)
      const incomingTransfers = await StockTransfer.find({
        destinationType: 'warehouse',
        destinationId: locationId,
        'items.product': { $exists: true, $ne: null }
      }).populate({
        path: 'items.product',
        match: { _id: { $exists: true } }
      });
      
      incomingTransfers.forEach(transfer => {
        transfer.items.forEach(item => {
          // Check if product exists and is not null
          if (!item.product || !item.product._id) {
            console.warn(`Stock transfer ${transfer._id} has null product reference in item`);
            return; // Skip this item
          }
          
          const productId = item.product._id.toString();
          
          if (productMap[productId]) {
            // Product already exists in this warehouse, add to its quantity
            productMap[productId].currentStock += item.quantity;
          } else {
            // Product is new to this warehouse via transfer
            const productData = item.product.toObject();
            productMap[productId] = {
              ...productData,
              initialStock: 0, // Not originally in this warehouse
              currentStock: item.quantity,
            };
          }
        });
      });
      
      // Step 4: Handle outgoing transfers (removing stock from this warehouse)
      const outgoingTransfers = await StockTransfer.find({
        sourceType: 'warehouse',
        sourceId: locationId
        
      });
      
      outgoingTransfers.forEach(transfer => {
        transfer.items.forEach(item => {
          const productId = item.product.toString();
          
          if (productMap[productId]) {
            // Reduce the quantity for outgoing transfers
            productMap[productId].currentStock -= item.quantity;
          }
        });
      });
      
      // Convert map back to array and only include products with available stock > 0
      products = Object.values(productMap).filter(product => {
        const availableStock = product.currentStock - (product.damagedQuantity || 0) - (product.returnedQuantity || 0);
        return availableStock > 0;
      });
    }
    
    res.status(200).json({
      status: 'success',
      count: products.length,
      data: products.map(product => {
        // For warehouse products, standardize the quantity field
        if (product.currentStock !== undefined) {
          const availableStock = product.currentStock - (product.damagedQuantity || 0) - (product.returnedQuantity || 0);
          return {
            ...product,
            quantity: availableStock,
            currentStock: product.currentStock,
            availableStock: availableStock,
            initialStock: product.initialStock || 0
          };
        }
        return product;
      })
    });
    
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// @desc    Get hierarchical unit data for product forms
// @route   GET /api/products/units/hierarchy
// @access  Public
const getUnitsHierarchy = async (req, res) => {
  try {
    // Get all quantity units
    const quantityUnits = await QuantityUnit.find({ isActive: true }).sort({ name: 1 });

    // Get all packing units with their quantity units
    const packingUnits = await PackingUnit.find({ isActive: true })
      .populate('quantityUnit', 'name')
      .sort({ name: 1 });

    // Get all pochues with their packing units and quantity units
    const pochues = await Pochues.find({ isActive: true })
      .populate({
        path: 'packingUnit',
        select: 'name',
        populate: {
          path: 'quantityUnit',
          select: 'name'
        }
      })
      .sort({ name: 1 });

    res.json({
      status: 'success',
      data: {
        quantityUnits,
        packingUnits,
        pochues,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

module.exports = {
  getProducts,
  getProductById,
  deleteProduct,
  createProduct,
  updateProduct,
  createProductReview,
  getProductJourneyByProductId,
  convertProductPrice,
  getProductsByLocation,
  getUnitsHierarchy,
}; 