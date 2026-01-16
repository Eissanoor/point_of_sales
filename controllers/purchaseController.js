const mongoose = require('mongoose');
const Purchase = require('../models/purchaseModel');
const Product = require('../models/productModel');
const Supplier = require('../models/supplierModel');
const Warehouse = require('../models/warehouseModel');
const Shop = require('../models/shopModel');
const Currency = require('../models/currencyModel');
const BankAccount = require('../models/bankAccountModel');
const cloudinary = require('cloudinary').v2;

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
      shop,
      locationType,
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
    
    // Filter by shop
    if (shop) {
      filter.shop = shop;
    }
    
    // Filter by location type
    if (locationType) {
      filter.locationType = locationType;
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
    
    // Filter by payment method (searches in payments array)
    if (paymentMethod) {
      filter['payments.method'] = paymentMethod;
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
      .populate('shop', 'name code')
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
      .populate('shop', 'name code address')
      .populate('currency', 'name code symbol')
      .populate('bankAccount', 'accountName accountNumber bankName');

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

// @desc    Get purchase invoice data by purchase ID (optimized for invoice generation)
// @route   GET /api/purchases/invoice/:purchaseId
// @access  Private
// @param   purchaseId - MongoDB ObjectId of the purchase
const getPurchaseInvoiceById = async (req, res) => {
  try {
    const { purchaseId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(purchaseId)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid purchase ID format',
      });
    }

    // Fetch purchase with essential fields for invoice
    const purchase = await Purchase.findById(purchaseId)
      .populate('supplier', 'name email phoneNumber address city state country')
      .populate('items.product', 'name barcode')
      .populate('shop', 'name location phoneNumber email')
      .populate('warehouse', 'name country state city zipCode phoneNumber email')
      .populate('currency', 'name code symbol')
      .populate('bankAccount', 'accountName accountNumber bankName');

    if (!purchase) {
      return res.status(404).json({
        status: 'fail',
        message: 'Purchase not found',
      });
    }

    // Calculate payment summary from embedded payments
    const totalPaid = purchase.payments?.reduce((sum, payment) => sum + (payment.amount || 0), 0) || 0;
    const remainingBalance = Math.max(0, purchase.totalAmount - totalPaid);

    // Prepare invoice items
    const items = purchase.items.map((item) => ({
      productName: item.product?.name || 'N/A',
      barcode: item.product?.barcode || '',
      quantity: item.quantity,
      purchaseRate: item.purchaseRate,
      retailRate: item.retailRate,
      wholesaleRate: item.wholesaleRate,
      total: item.itemTotal || (item.purchaseRate * item.quantity),
    }));

    // Build supplier address
    const supplierAddress = [
      purchase.supplier?.address,
      purchase.supplier?.city,
      purchase.supplier?.state,
      purchase.supplier?.country,
    ]
      .filter(Boolean)
      .join(', ');

    // Invoice data
    const invoiceData = {
      invoiceNumber: purchase.invoiceNumber,
      referCode: purchase.referCode,
      purchaseDate: purchase.purchaseDate,
      status: purchase.status,

      supplier: {
        name: purchase.supplier?.name || 'N/A',
        email: purchase.supplier?.email || '',
        phoneNumber: purchase.supplier?.phoneNumber || '',
        address: supplierAddress || 'N/A',
      },

      shop: purchase.shop ? {
        name: purchase.shop.name,
        address: purchase.shop.location?.address || '',
        phoneNumber: purchase.shop.phoneNumber || '',
        email: purchase.shop.email || '',
      } : null,

      warehouse: purchase.warehouse ? {
        name: purchase.warehouse.name,
        address: [
          purchase.warehouse.city,
          purchase.warehouse.state,
          purchase.warehouse.zipCode,
          purchase.warehouse.country,
        ]
          .filter(Boolean)
          .join(', '),
        phoneNumber: purchase.warehouse.phoneNumber || '',
        email: purchase.warehouse.email || '',
      } : null,

      currency: purchase.currency ? {
        name: purchase.currency.name,
        code: purchase.currency.code,
        symbol: purchase.currency.symbol,
      } : null,

      bankAccount: purchase.bankAccount ? {
        accountName: purchase.bankAccount.accountName,
        accountNumber: purchase.bankAccount.accountNumber,
        bankName: purchase.bankAccount.bankName,
      } : null,

      items: items,

      totals: {
        totalAmount: purchase.totalAmount || 0,
        totalQuantity: purchase.totalQuantity || 0,
      },

      payment: {
        totalPaid: totalPaid,
        remainingBalance: remainingBalance,
        payments: purchase.payments || [],
      },
    };

    res.json({
      status: 'success',
      data: invoiceData,
    });
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
      shop,
      locationType,
      currency,
      purchaseDate,
      invoiceNumber,
      notes,
      payments,
      paymentMethod, // For backward compatibility
      bankAccount // For backward compatibility
    } = req.body;
    // Normalize items: when coming from multipart/form-data it's a JSON string
    let normalizedItems = items;
    if (typeof normalizedItems === 'string') {
      try {
        normalizedItems = JSON.parse(normalizedItems);
      } catch (e) {
        return res.status(400).json({ status: 'fail', message: 'Invalid items format. Must be a JSON array.' });
      }
    }
    
    // Validate required fields
    if (!normalizedItems || !Array.isArray(normalizedItems) || normalizedItems.length === 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'Please provide at least one item in the items array',
      });
    }
    
    if (!supplier) {
      return res.status(400).json({
        status: 'fail',
        message: 'Please provide a supplier',
      });
    }

    const hasWarehouse = Boolean(warehouse);
    const hasShop = Boolean(shop);

    if (hasWarehouse && hasShop) {
      return res.status(400).json({
        status: 'fail',
        message: 'Please provide either a warehouse or a shop, not both',
      });
    }

    if (!hasWarehouse && !hasShop) {
      return res.status(400).json({
        status: 'fail',
        message: 'Please provide warehouse or shop information',
      });
    }

    // Normalize IDs
    const normalizedWarehouseId = hasWarehouse ? warehouse.toString().trim() : null;
    const normalizedShopId = hasShop ? shop.toString().trim() : null;

    if (normalizedWarehouseId && !normalizedWarehouseId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ status: 'fail', message: 'Invalid warehouse ID format' });
    }

    if (normalizedShopId && !normalizedShopId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ status: 'fail', message: 'Invalid shop ID format' });
    }

    const resolvedLocationType = locationType
      ? (locationType === 'shop' ? 'shop' : 'warehouse')
      : (normalizedShopId ? 'shop' : 'warehouse');

    if (resolvedLocationType === 'warehouse' && !normalizedWarehouseId) {
      return res.status(400).json({
        status: 'fail',
        message: 'Warehouse is required for warehouse-based purchases',
      });
    }

    if (resolvedLocationType === 'shop' && !normalizedShopId) {
      return res.status(400).json({
        status: 'fail',
        message: 'Shop is required for shop-based purchases',
      });
    }
    
    // Validate each item
    for (const item of normalizedItems) {
      if (!item.product || !item.quantity || !item.purchaseRate || !item.retailRate || !item.wholesaleRate) {
        return res.status(400).json({
          status: 'fail',
          message: 'Each item must have: product, quantity, purchaseRate, retailRate, wholesaleRate',
        });
      }
    }
    
    // Check if all products exist
    const productIds = normalizedItems.map(item => item.product);
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
    
    // Check if location exists
    let locationId = null;
    if (resolvedLocationType === 'warehouse') {
      const warehouseExists = await Warehouse.findById(normalizedWarehouseId);
      if (!warehouseExists) {
        return res.status(400).json({
          status: 'fail',
          message: 'Warehouse not found',
        });
      }
      locationId = normalizedWarehouseId;
    } else {
      const shopExists = await Shop.findById(normalizedShopId);
      if (!shopExists) {
        return res.status(400).json({
          status: 'fail',
          message: 'Shop not found',
        });
      }
      locationId = normalizedShopId;
    }
    
    // Get currency exchange rate if currency is provided
    let currencyExchangeRate = 1;
    if (currency) {
      const currencyDoc = await Currency.findById(currency);
      if (currencyDoc) {
        currencyExchangeRate = currencyDoc.exchangeRate;
      }
    }

    // Normalize and validate payments
    let normalizedPayments = payments;
    if (typeof normalizedPayments === 'string') {
      try {
        normalizedPayments = JSON.parse(normalizedPayments);
      } catch (e) {
        return res.status(400).json({ status: 'fail', message: 'Invalid payments format. Must be a JSON array.' });
      }
    }

    // If payments array is not provided, use legacy paymentMethod and bankAccount for backward compatibility
    if (!normalizedPayments || !Array.isArray(normalizedPayments) || normalizedPayments.length === 0) {
      // Backward compatibility: use paymentMethod and bankAccount if provided
      const legacyMethod = paymentMethod || 'cash';
      // Calculate total amount for single payment
      const totalAmount = normalizedItems.reduce((sum, item) => {
        return sum + (item.quantity * item.purchaseRate);
      }, 0);
      
      normalizedPayments = [{
        method: legacyMethod,
        amount: totalAmount,
        bankAccount: bankAccount || null
      }];
    }

    // Validate payments array
    if (!Array.isArray(normalizedPayments) || normalizedPayments.length === 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'Please provide at least one payment method',
      });
    }

    // Validate each payment
    for (const payment of normalizedPayments) {
      if (!payment.method || !payment.amount) {
        return res.status(400).json({
          status: 'fail',
          message: 'Each payment must have: method and amount',
        });
      }

      if (!['cash', 'bank', 'credit', 'check', 'online'].includes(payment.method)) {
        return res.status(400).json({
          status: 'fail',
          message: `Invalid payment method: ${payment.method}. Allowed: cash, bank, credit, check, online`,
        });
      }

      if (typeof payment.amount !== 'number' || payment.amount <= 0) {
        return res.status(400).json({
          status: 'fail',
          message: 'Payment amount must be a positive number',
        });
      }

      // Validate bank account for bank/online payments
      if ((payment.method === 'bank' || payment.method === 'online') && payment.bankAccount) {
        const bank = await BankAccount.findById(payment.bankAccount);
        if (!bank) {
          return res.status(400).json({
            status: 'fail',
            message: `Bank account not found for ${payment.method} payment`,
          });
        }
      }
    }

    // Calculate total payment amount
    const totalPaymentAmount = normalizedPayments.reduce((sum, payment) => sum + payment.amount, 0);
    
    // Calculate total purchase amount (will be calculated in pre-save hook, but we need it here for validation)
    const calculatedTotalAmount = normalizedItems.reduce((sum, item) => {
      return sum + (item.quantity * item.purchaseRate);
    }, 0);

    // Optional: Validate that payments match total (you can remove this if you want to allow partial payments)
    // For now, I'll allow partial payments but warn if overpayment
    if (totalPaymentAmount > calculatedTotalAmount * 1.01) { // Allow 1% tolerance for rounding
      return res.status(400).json({
        status: 'fail',
        message: `Total payment amount (${totalPaymentAmount}) exceeds purchase total (${calculatedTotalAmount})`,
      });
    }

    // Prepare payments array for database
    const paymentsForDB = normalizedPayments.map(payment => ({
      method: payment.method,
      amount: payment.amount,
      bankAccount: (payment.method === 'bank' || payment.method === 'online') && payment.bankAccount 
        ? payment.bankAccount 
        : null
    }));

    // Optional transaction receipt upload
    let transactionRecipt = { url: '', publicId: '', fileName: '' };
    if (req.file) {
      const fileBuffer = req.file.buffer;
      const fileName = req.file.originalname || '';
      const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'purchase-receipts' },
          (error, result) => {
            if (error) return reject(error);
            resolve(result);
          }
        );
        stream.end(fileBuffer);
      });
      transactionRecipt = {
        url: uploadResult.secure_url || '',
        publicId: uploadResult.public_id || '',
        fileName,
      };
    }

    const purchase = await Purchase.create({
      user: req.user._id,
      items: normalizedItems,
      supplier,
      locationType: resolvedLocationType,
      warehouse: resolvedLocationType === 'warehouse' ? locationId : null,
      shop: resolvedLocationType === 'shop' ? locationId : null,
      currency: currency || null,
      currencyExchangeRate,
      purchaseDate: purchaseDate || new Date(),
      invoiceNumber: invoiceNumber || '', // Will be auto-generated if empty
      notes: notes || '',
      payments: paymentsForDB,
      paymentMethod: normalizedPayments[0]?.method || 'cash', // Keep for backward compatibility
      bankAccount: normalizedPayments.find(p => p.bankAccount)?.bankAccount || null, // Keep for backward compatibility
      transactionRecipt,
    });
    
    // Update product stock and rates for each item
    for (const item of normalizedItems) {
      await Product.findByIdAndUpdate(item.product, {
        $inc: { countInStock: item.quantity },
        $set: {
          purchaseRate: item.purchaseRate,
          retailRate: item.retailRate,
          wholesaleRate: item.wholesaleRate,
          supplier: supplier,
          warehouse: resolvedLocationType === 'warehouse' ? locationId : null,
          shop: resolvedLocationType === 'shop' ? locationId : null,
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
      
      // Update fields if provided (excluding location fields handled separately)
      for (const [key, value] of Object.entries(req.body)) {
        if (!['items', 'bankAccount', 'warehouse', 'shop', 'locationType'].includes(key) && purchase[key] !== value) {
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

      // Handle location updates
      let nextLocationType = purchase.locationType || 'warehouse';
      let nextWarehouseId = purchase.warehouse ? purchase.warehouse.toString() : null;
      let nextShopId = purchase.shop ? purchase.shop.toString() : null;

      if (typeof req.body.locationType !== 'undefined') {
        if (!['warehouse', 'shop'].includes(req.body.locationType)) {
          return res.status(400).json({ status: 'fail', message: 'Invalid location type. Use "warehouse" or "shop"' });
        }
        nextLocationType = req.body.locationType;
      }

      if (typeof req.body.warehouse !== 'undefined') {
        if (req.body.warehouse) {
          const trimmedWarehouseId = req.body.warehouse.toString().trim();
          if (!trimmedWarehouseId.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ status: 'fail', message: 'Invalid warehouse ID format' });
          }
          const warehouseExists = await Warehouse.findById(trimmedWarehouseId);
          if (!warehouseExists) {
            return res.status(404).json({ status: 'fail', message: 'Warehouse not found' });
          }
          nextWarehouseId = trimmedWarehouseId;
        } else {
          nextWarehouseId = null;
        }
      }

      if (typeof req.body.shop !== 'undefined') {
        if (req.body.shop) {
          const trimmedShopId = req.body.shop.toString().trim();
          if (!trimmedShopId.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ status: 'fail', message: 'Invalid shop ID format' });
          }
          const shopExists = await Shop.findById(trimmedShopId);
          if (!shopExists) {
            return res.status(404).json({ status: 'fail', message: 'Shop not found' });
          }
          nextShopId = trimmedShopId;
        } else {
          nextShopId = null;
        }
      }

      if (nextLocationType === 'warehouse') {
        if (!nextWarehouseId) {
          return res.status(400).json({ status: 'fail', message: 'Warehouse is required when location type is warehouse' });
        }
        nextShopId = null;
      } else {
        if (!nextShopId) {
          return res.status(400).json({ status: 'fail', message: 'Shop is required when location type is shop' });
        }
        nextWarehouseId = null;
      }

      purchase.locationType = nextLocationType;
      purchase.warehouse = nextWarehouseId;
      purchase.shop = nextShopId;

      // Optional bank account update (for backward compatibility)
      if (typeof req.body.bankAccount !== 'undefined') {
        if (req.body.bankAccount) {
          const bank = await BankAccount.findById(req.body.bankAccount);
          if (!bank) {
            return res.status(400).json({ status: 'fail', message: 'Bank account not found' });
          }
          purchase.bankAccount = bank._id;
        } else {
          purchase.bankAccount = null;
        }
      }

      // Handle payments update if provided
      if (typeof req.body.payments !== 'undefined') {
        let updatePayments = req.body.payments;
        if (typeof updatePayments === 'string') {
          try {
            updatePayments = JSON.parse(updatePayments);
          } catch (e) {
            return res.status(400).json({ status: 'fail', message: 'Invalid payments format. Must be a JSON array.' });
          }
        }

        if (!Array.isArray(updatePayments) || updatePayments.length === 0) {
          return res.status(400).json({
            status: 'fail',
            message: 'Please provide at least one payment method',
          });
        }

        // Validate each payment
        for (const payment of updatePayments) {
          if (!payment.method || !payment.amount) {
            return res.status(400).json({
              status: 'fail',
              message: 'Each payment must have: method and amount',
            });
          }

          if (!['cash', 'bank', 'credit', 'check', 'online'].includes(payment.method)) {
            return res.status(400).json({
              status: 'fail',
              message: `Invalid payment method: ${payment.method}. Allowed: cash, bank, credit, check, online`,
            });
          }

          if (typeof payment.amount !== 'number' || payment.amount <= 0) {
            return res.status(400).json({
              status: 'fail',
              message: 'Payment amount must be a positive number',
            });
          }

          // Validate bank account for bank/online payments
          if ((payment.method === 'bank' || payment.method === 'online') && payment.bankAccount) {
            const bank = await BankAccount.findById(payment.bankAccount);
            if (!bank) {
              return res.status(400).json({
                status: 'fail',
                message: `Bank account not found for ${payment.method} payment`,
              });
            }
          }
        }

        // Calculate total payment amount
        const totalPaymentAmount = updatePayments.reduce((sum, payment) => sum + payment.amount, 0);
        
        // Calculate total purchase amount
        const calculatedTotalAmount = purchase.items.reduce((sum, item) => {
          return sum + (item.quantity * item.purchaseRate);
        }, 0);

        // Validate that payments don't exceed total (allow 1% tolerance)
        if (totalPaymentAmount > calculatedTotalAmount * 1.01) {
          return res.status(400).json({
            status: 'fail',
            message: `Total payment amount (${totalPaymentAmount}) exceeds purchase total (${calculatedTotalAmount})`,
          });
        }

        // Update payments
        purchase.payments = updatePayments.map(payment => ({
          method: payment.method,
          amount: payment.amount,
          bankAccount: (payment.method === 'bank' || payment.method === 'online') && payment.bankAccount 
            ? payment.bankAccount 
            : null
        }));

        // Update legacy fields for backward compatibility
        purchase.paymentMethod = updatePayments[0]?.method || 'cash';
        purchase.bankAccount = updatePayments.find(p => p.bankAccount)?.bankAccount || null;
      }

      // Optional transaction receipt replacement
      if (req.file) {
        // delete old if exists
        if (purchase.transactionRecipt && purchase.transactionRecipt.publicId) {
          try { await cloudinary.uploader.destroy(purchase.transactionRecipt.publicId); } catch (_) {}
        }
        const fileBuffer = req.file.buffer;
        const fileName = req.file.originalname || '';
        const uploadResult = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder: 'purchase-receipts' },
            (error, result) => {
              if (error) return reject(error);
              resolve(result);
            }
          );
          stream.end(fileBuffer);
        });
        purchase.transactionRecipt = {
          url: uploadResult.secure_url || '',
          publicId: uploadResult.public_id || '',
          fileName,
        };
      }
      
      // Handle items update if provided (supports JSON string via multipart)
      if (typeof req.body.items !== 'undefined') {
        let updateItems = req.body.items;
        if (typeof updateItems === 'string') {
          try {
            updateItems = JSON.parse(updateItems);
          } catch (e) {
            return res.status(400).json({ status: 'fail', message: 'Invalid items format. Must be a JSON array.' });
          }
        }
        if (!Array.isArray(updateItems)) {
          return res.status(400).json({ status: 'fail', message: 'Items must be an array.' });
        }
        // Validate items
        for (const item of updateItems) {
          if (!item.product || !item.quantity || !item.purchaseRate || !item.retailRate || !item.wholesaleRate) {
            return res.status(400).json({
              status: 'fail',
              message: 'Each item must have: product, quantity, purchaseRate, retailRate, wholesaleRate',
            });
          }
        }
        
        // Check if all products exist
        const productIds = updateItems.map(item => item.product);
        const products = await Product.find({ _id: { $in: productIds } });
        if (products.length !== productIds.length) {
          return res.status(400).json({
            status: 'fail',
            message: 'One or more products not found',
          });
        }
        
        purchase.items = updateItems;
      }
      
      const updatedPurchase = await purchase.save();
      
      // Update product stock and rates for each item
      if (typeof req.body.items !== 'undefined') {
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
              warehouse: purchase.locationType === 'warehouse' ? purchase.warehouse : null,
              shop: purchase.locationType === 'shop' ? purchase.shop : null,
              currency: purchase.currency,
              currencyExchangeRate: purchase.currencyExchangeRate,
            }
          });
        }
      } else {
        // Items were not changed but header fields may have changed (supplier, warehouse, currency)
        // Ensure product master fields reflect latest purchase header
        if (req.body.supplier || req.body.warehouse || req.body.shop || req.body.locationType || req.body.currency) {
          for (const item of purchase.items) {
            await Product.findByIdAndUpdate(item.product, {
              $set: {
                // Do not touch stock when items unchanged
                supplier: purchase.supplier,
                warehouse: purchase.locationType === 'warehouse' ? purchase.warehouse : null,
                shop: purchase.locationType === 'shop' ? purchase.shop : null,
                currency: purchase.currency,
                currencyExchangeRate: purchase.currencyExchangeRate,
              }
            });
          }
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
    const { startDate, endDate, supplier, warehouse, shop, locationType } = req.query;
    
    const filter = { isActive: true };
    
    if (startDate || endDate) {
      filter.purchaseDate = {};
      if (startDate) filter.purchaseDate.$gte = new Date(startDate);
      if (endDate) filter.purchaseDate.$lte = new Date(endDate);
    }
    
    if (supplier) filter.supplier = supplier;
    if (warehouse) filter.warehouse = warehouse;
    if (shop) filter.shop = shop;
    if (locationType) filter.locationType = locationType;
    
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
      .populate('shop', 'name code')
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

// @desc    Get purchases by supplier
// @route   GET /api/purchases/supplier/:supplierId
// @access  Private
const getPurchasesBySupplier = async (req, res) => {
  try {
    const { supplierId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    // Check if supplier exists
    const supplier = await Supplier.findById(supplierId);
    if (!supplier) {
      return res.status(404).json({
        status: 'fail',
        message: 'Supplier not found',
      });
    }
    
    // Count total documents for pagination info
    const totalPurchases = await Purchase.countDocuments({ 
      supplier: supplierId, 
      isActive: true 
    });
    
    // Get purchase records
    const purchases = await Purchase.find({ 
      supplier: supplierId, 
      isActive: true 
    })
      .populate('items.product', 'name description')
      .populate('supplier', 'name email phoneNumber')
      .populate('warehouse', 'name code')
      .populate('shop', 'name code')
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
  getPurchaseInvoiceById,
  createPurchase,
  updatePurchase,
  deletePurchase,
  getPurchaseStats,
  getPurchasesByProduct,
  getPurchasesBySupplier,
};
