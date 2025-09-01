const Product = require('../models/productModel');
const ProductJourney = require('../models/productJourneyModel');
const Category = require('../models/categoryModel');
const Currency = require('../models/currencyModel');
const cloudinary = require('../config/cloudinary');
const currencyUtils = require('../utils/currencyUtils');
const StockTransfer = require('../models/stockTransferModel');
const Shop = require('../models/shopModel');

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
    
    // Filter by stock availability
    if (inStock === 'true') {
      filter.countInStock = { $gt: 0 };
    } else if (inStock === 'false') {
      filter.countInStock = { $eq: 0 };
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
      packingUnit,
      additionalUnit,
      pouchesOrPieces,
      countInStock
    } = req.body;
    
    // Check if category exists
    const categoryExists = await Category.findById(category);
    if (!categoryExists) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid category',
      });
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
      category,
      supplier: supplier || null,
      warehouse: warehouse || null,
      currency: currency || null,
      currencyExchangeRate,
      description,
      purchaseRate: purchaseRate || 0,
      saleRate: saleRate || 0,
      wholesaleRate: wholesaleRate || 0,
      retailRate: retailRate || 0,
      size: size || '',
      color: color || '',
      packingUnit: packingUnit || '',
      additionalUnit: additionalUnit || '',
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
    
    if (!['warehouse', 'shop'].includes(locationType)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Location type must be either "warehouse" or "shop"'
      });
    }
    
    let products = [];
    
    // Case 1: Get products from shop inventory
    if (locationType === 'shop') {
      const shop = await Shop.findById(locationId).populate('inventory.product');
      if (!shop) {
        return res.status(404).json({ status: 'fail', message: 'Shop not found' });
      }
      
      products = shop.inventory.map(item => {
        const product = item.product.toObject();
        product.quantity = item.quantity;
        return product;
      });
    } 
    // Case 2: Get products from warehouse 
    else {
      // Get products originally assigned to this warehouse
      const originalProducts = await Product.find({ warehouse: locationId });
      
      // Get products transferred to this warehouse through stock transfers
      const completedTransfers = await StockTransfer.find({
        destinationType: 'warehouse',
        destinationId: locationId,
      }).populate('items.product');
      
      // Extract products from transfers
      const transferredProducts = [];
      completedTransfers.forEach(transfer => {
        transfer.items.forEach(item => {
          const existingProduct = transferredProducts.find(
            p => p._id.toString() === item.product._id.toString()
          );
          
          if (existingProduct) {
            existingProduct.quantity += item.quantity;
          } else {
            const product = item.product.toObject();
            product.quantity = item.quantity;
            transferredProducts.push(product);
          }
        });
      });
      
      // Combine original and transferred products
      products = [...originalProducts, ...transferredProducts];
    }
    
    res.status(200).json({
      status: 'success',
      count: products.length,
      data: products
    });
    
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
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
}; 