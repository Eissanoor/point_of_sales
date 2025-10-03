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
      status
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
    
    // Only show active purchases
    filter.isActive = true;
    
    // Determine sort options
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    // Count total documents for pagination info
    const totalPurchases = await Purchase.countDocuments(filter);
    
    // Find purchases based on filters with pagination and sorting
    const purchases = await Purchase.find(filter)
      .populate('product', 'name description')
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
      .populate('product', 'name description category')
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
      product,
      supplier,
      warehouse,
      currency,
      quantity,
      purchaseRate,
      saleRate,
      retailRate,
      wholesaleRate,
      purchaseDate,
      invoiceNumber,
      notes
    } = req.body;
    
    // Validate required fields
    if (!product || !supplier || !warehouse || !quantity || !purchaseRate || !saleRate || !retailRate || !wholesaleRate) {
      return res.status(400).json({
        status: 'fail',
        message: 'Please provide all required fields: product, supplier, warehouse, quantity, purchaseRate, saleRate, retailRate, wholesaleRate',
      });
    }
    
    // Check if product exists
    const productExists = await Product.findById(product);
    if (!productExists) {
      return res.status(400).json({
        status: 'fail',
        message: 'Product not found',
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
      product,
      supplier,
      warehouse,
      currency: currency || null,
      currencyExchangeRate,
      quantity,
      purchaseRate,
      saleRate,
      retailRate,
      wholesaleRate,
      purchaseDate: purchaseDate || new Date(),
      invoiceNumber: invoiceNumber || '',
      notes: notes || '',
    });
    
    // Update product stock and rates
    await Product.findByIdAndUpdate(product, {
      $inc: { countInStock: quantity },
      $set: {
        purchaseRate: purchaseRate,
        saleRate: saleRate,
        retailRate: retailRate,
        wholesaleRate: wholesaleRate,
        supplier: supplier,
        warehouse: warehouse,
        currency: currency || productExists.currency,
        currencyExchangeRate: currencyExchangeRate,
      }
    });
    
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
      const oldQuantity = purchase.quantity;
      const oldProduct = purchase.product;
      
      // Update fields if provided
      for (const [key, value] of Object.entries(req.body)) {
        if (purchase[key] !== value) {
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
      
      // Recalculate total amount
      if (purchase.quantity && purchase.purchaseRate) {
        purchase.totalAmount = purchase.quantity * purchase.purchaseRate;
      }
      
      const updatedPurchase = await purchase.save();
      
      // Update product stock if quantity changed
      if (oldQuantity !== purchase.quantity) {
        const quantityDifference = purchase.quantity - oldQuantity;
        await Product.findByIdAndUpdate(purchase.product, {
          $inc: { countInStock: quantityDifference }
        });
      }
      
      // Update product rates if they changed
      if (req.body.purchaseRate || req.body.saleRate || req.body.retailRate || req.body.wholesaleRate) {
        const updateFields = {};
        if (req.body.purchaseRate) updateFields.purchaseRate = req.body.purchaseRate;
        if (req.body.saleRate) updateFields.saleRate = req.body.saleRate;
        if (req.body.retailRate) updateFields.retailRate = req.body.retailRate;
        if (req.body.wholesaleRate) updateFields.wholesaleRate = req.body.wholesaleRate;
        
        await Product.findByIdAndUpdate(purchase.product, updateFields);
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
      // Reduce product stock by the purchase quantity
      await Product.findByIdAndUpdate(purchase.product, {
        $inc: { countInStock: -purchase.quantity }
      });
      
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
          totalQuantity: { $sum: '$quantity' },
          totalAmount: { $sum: '$totalAmount' },
          averagePurchaseRate: { $avg: '$purchaseRate' },
          averageSaleRate: { $avg: '$saleRate' },
        }
      }
    ]);
    
    const result = stats.length > 0 ? stats[0] : {
      totalPurchases: 0,
      totalQuantity: 0,
      totalAmount: 0,
      averagePurchaseRate: 0,
      averageSaleRate: 0,
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
      product: productId, 
      isActive: true 
    });
    
    // Get purchase records
    const purchases = await Purchase.find({ 
      product: productId, 
      isActive: true 
    })
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
