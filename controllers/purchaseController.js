const Purchase = require('../models/purchaseModel');
const Product = require('../models/productModel');
const Supplier = require('../models/supplierModel');
const Warehouse = require('../models/warehouseModel');
const Currency = require('../models/currencyModel');

// @desc    Get all purchases
// @route   GET /api/purchases
// @access  Private
const getPurchases = async (req, res) => {
  try {
    const { 
      keyword = '', 
      product,
      supplier,
      warehouse,
      page = 1, 
      limit = 10,
      sortBy = 'purchaseDate',
      sortOrder = 'desc',
      startDate,
      endDate,
      status,
      paymentMethod
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    // Build filter object
    const filter = {};
    
    // Search by keyword in invoice number or notes
    if (keyword) {
      filter.$or = [
        { invoiceNumber: { $regex: keyword, $options: 'i' } },
        { notes: { $regex: keyword, $options: 'i' } }
      ];
    }
    
    // Filter by product
    if (product) {
      filter.product = product;
    }
    
    // Filter by supplier
    if (supplier) {
      filter.supplier = supplier;
    }
    
    // Filter by warehouse
    if (warehouse) {
      filter.warehouse = warehouse;
    }
    
    // Filter by date range
    if (startDate || endDate) {
      filter.purchaseDate = {};
      if (startDate) filter.purchaseDate.$gte = new Date(startDate);
      if (endDate) filter.purchaseDate.$lte = new Date(endDate);
    }
    
    // Filter by status
    if (status) {
      filter.status = status;
    }
    
    // Filter by payment method
    if (paymentMethod) {
      filter.paymentMethod = paymentMethod;
    }
    
    // Only show active purchases
    filter.isActive = true;
    
    // Determine sort options
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    // Count total documents for pagination info
    const totalPurchases = await Purchase.countDocuments(filter);
    
    // Find purchases based on filters with pagination and sorting
    const purchases = await Purchase.find(filter)
      .populate('items.product', 'name description')
      .populate('supplier', 'name email phoneNumber')
      .populate('warehouse', 'name code')
      .populate('currency', 'name code symbol')
      .sort(sort)
      .skip(skip)
      .limit(limitNum);

    res.json({
      status: 'success',
      results: purchases.length,
      totalPages: Math.ceil(totalPurchases / limitNum),
      currentPage: pageNum,
      totalPurchases,
      data: purchases,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get purchase by ID
// @route   GET /api/purchases/:id
// @access  Private
const getPurchaseById = async (req, res) => {
  try {
    const purchase = await Purchase.findById(req.params.id)
      .populate('items.product', 'name description category')
      .populate('supplier', 'name email phoneNumber address')
      .populate('warehouse', 'name code address')
      .populate('currency', 'name code symbol');

    if (purchase) {
      res.json({
        status: 'success',
        data: purchase,
      });
    } else {
      res.status(404).json({
        status: 'fail',
        message: 'Purchase not found',
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Create purchase
// @route   POST /api/purchases
// @access  Private
const createPurchase = async (req, res) => {
  try {
    const {
      items,
      supplier,
      warehouse,
      currency,
      purchaseDate,
      invoiceNumber,
      notes,
      paymentMethod
    } = req.body;
    
    // Validate required fields
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'Please provide at least one item in the items array',
      });
    }
    
    if (!supplier || !warehouse) {
      return res.status(400).json({
        status: 'fail',
        message: 'Please provide supplier and warehouse',
      });
    }
    
    // Validate each item
    for (const item of items) {
      if (!item.product || !item.quantity || !item.purchaseRate || !item.retailRate || !item.wholesaleRate) {
        return res.status(400).json({
          status: 'fail',
          message: 'Each item must have: product, quantity, purchaseRate, retailRate, wholesaleRate',
        });
      }
    }
    
    // Check if all products exist
    const productIds = items.map(item => item.product);
    const products = await Product.find({ _id: { $in: productIds } });
    if (products.length !== productIds.length) {
      return res.status(400).json({
        status: 'fail',
        message: 'One or more products not found',
      });
    }
    
    // Check if supplier exists
    const supplierExists = await Supplier.findById(supplier);
    if (!supplierExists) {
      return res.status(400).json({
        status: 'fail',
        message: 'Supplier not found',
      });
    }
    
    // Check if warehouse exists
    const warehouseExists = await Warehouse.findById(warehouse);
    if (!warehouseExists) {
      return res.status(400).json({
        status: 'fail',
        message: 'Warehouse not found',
      });
    }
    
    // Get currency exchange rate if currency is provided
    let currencyExchangeRate = 1;
    if (currency) {
      const currencyDoc = await Currency.findById(currency);
      if (currencyDoc) {
        currencyExchangeRate = currencyDoc.exchangeRate;
      }
    }

    const purchase = await Purchase.create({
      user: req.user._id,
      items,
      supplier,
      warehouse,
      currency: currency || null,
      currencyExchangeRate,
      purchaseDate: purchaseDate || new Date(),
      invoiceNumber: invoiceNumber || '', // Will be auto-generated if empty
      notes: notes || '',
      paymentMethod: paymentMethod || 'cash',
    });
    
    // Update product stock and rates for each item
    for (const item of items) {
      await Product.findByIdAndUpdate(item.product, {
        $inc: { countInStock: item.quantity },
        $set: {
          purchaseRate: item.purchaseRate,
          retailRate: item.retailRate,
          wholesaleRate: item.wholesaleRate,
          supplier: supplier,
          warehouse: warehouse,
          currency: currency || products.find(p => p._id.toString() === item.product).currency,
          currencyExchangeRate: currencyExchangeRate,
        }
      });
    }
    
    if (purchase) {
      res.status(201).json({
        status: 'success',
        data: purchase,
      });
    } else {
      res.status(400).json({
        status: 'fail',
        message: 'Invalid purchase data',
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Update purchase
// @route   PUT /api/purchases/:id
// @access  Private
const updatePurchase = async (req, res) => {
  try {
    const purchase = await Purchase.findById(req.params.id);
    
    if (purchase) {
      const oldItems = purchase.items.map(item => ({
        product: item.product,
        quantity: item.quantity
      }));
      
      // Update fields if provided
      for (const [key, value] of Object.entries(req.body)) {
        if (key !== 'items' && purchase[key] !== value) {
          purchase[key] = value;
          
          // If currency is being updated, also update the exchange rate
          if (key === 'currency' && value) {
            const currencyDoc = await Currency.findById(value);
            if (currencyDoc) {
              purchase.currencyExchangeRate = currencyDoc.exchangeRate;
            }
          }
        }
      }
      
      // Handle items update if provided
      if (req.body.items && Array.isArray(req.body.items)) {
        // Validate items
        for (const item of req.body.items) {
          if (!item.product || !item.quantity || !item.purchaseRate || !item.retailRate || !item.wholesaleRate) {
            return res.status(400).json({
              status: 'fail',
              message: 'Each item must have: product, quantity, purchaseRate, retailRate, wholesaleRate',
            });
          }
        }
        
        // Check if all products exist
        const productIds = req.body.items.map(item => item.product);
        const products = await Product.find({ _id: { $in: productIds } });
        if (products.length !== productIds.length) {
          return res.status(400).json({
            status: 'fail',
            message: 'One or more products not found',
          });
        }
        
        purchase.items = req.body.items;
      }
      
      const updatedPurchase = await purchase.save();
      
      // Update product stock and rates for each item
      if (req.body.items) {
        // First, revert old stock changes
        for (const oldItem of oldItems) {
          await Product.findByIdAndUpdate(oldItem.product, {
            $inc: { countInStock: -oldItem.quantity }
          });
        }
        
        // Then apply new stock changes
        for (const item of purchase.items) {
          await Product.findByIdAndUpdate(item.product, {
            $inc: { countInStock: item.quantity },
            $set: {
              purchaseRate: item.purchaseRate,
              retailRate: item.retailRate,
              wholesaleRate: item.wholesaleRate,
              supplier: purchase.supplier,
              warehouse: purchase.warehouse,
              currency: purchase.currency,
              currencyExchangeRate: purchase.currencyExchangeRate,
            }
          });
        }
      }
      
      res.json({
        status: 'success',
        data: updatedPurchase,
      });
    } else {
      res.status(404).json({
        status: 'fail',
        message: 'Purchase not found',
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Delete purchase
// @route   DELETE /api/purchases/:id
// @access  Private
const deletePurchase = async (req, res) => {
  try {
    const purchase = await Purchase.findById(req.params.id);

    if (purchase) {
      // Reduce product stock by the purchase quantity for each item
      for (const item of purchase.items) {
        await Product.findByIdAndUpdate(item.product, {
          $inc: { countInStock: -item.quantity }
        });
      }
      
      // Soft delete the purchase
      purchase.isActive = false;
      await purchase.save();
      
      res.json({
        status: 'success',
        message: 'Purchase deleted successfully',
      });
    } else {
      res.status(404).json({
        status: 'fail',
        message: 'Purchase not found',
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get purchase statistics
// @route   GET /api/purchases/stats
// @access  Private
const getPurchaseStats = async (req, res) => {
  try {
    const { startDate, endDate, supplier, warehouse } = req.query;
    
    const filter = { isActive: true };
    
    if (startDate || endDate) {
      filter.purchaseDate = {};
      if (startDate) filter.purchaseDate.$gte = new Date(startDate);
      if (endDate) filter.purchaseDate.$lte = new Date(endDate);
    }
    
    if (supplier) filter.supplier = supplier;
    if (warehouse) filter.warehouse = warehouse;
    
    const stats = await Purchase.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalPurchases: { $sum: 1 },
          totalQuantity: { $sum: '$totalQuantity' },
          totalAmount: { $sum: '$totalAmount' },
        }
      }
    ]);
    
    const result = stats.length > 0 ? stats[0] : {
      totalPurchases: 0,
      totalQuantity: 0,
      totalAmount: 0,
    };
    
    res.json({
      status: 'success',
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get purchases by product
// @route   GET /api/purchases/product/:productId
// @access  Private
const getPurchasesByProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    // Check if product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        status: 'fail',
        message: 'Product not found',
      });
    }
    
    // Count total documents for pagination info
    const totalPurchases = await Purchase.countDocuments({ 
      'items.product': productId, 
      isActive: true 
    });
    
    // Get purchase records
    const purchases = await Purchase.find({ 
      'items.product': productId, 
      isActive: true 
    })
      .populate('items.product', 'name description')
      .populate('supplier', 'name email')
      .populate('warehouse', 'name code')
      .populate('currency', 'name code symbol')
      .sort({ purchaseDate: -1 })
      .skip(skip)
      .limit(limitNum);
      
    res.json({
      status: 'success',
      results: purchases.length,
      totalPages: Math.ceil(totalPurchases / limitNum),
      currentPage: pageNum,
      totalPurchases,
      data: purchases,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

module.exports = {
  getPurchases,
  getPurchaseById,
  createPurchase,
  updatePurchase,
  deletePurchase,
  getPurchaseStats,
  getPurchasesByProduct,
};
