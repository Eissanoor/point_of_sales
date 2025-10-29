const StockTransfer = require('../models/stockTransferModel');
const Product = require('../models/productModel');
const Warehouse = require('../models/warehouseModel');
const Shop = require('../models/shopModel');
const Purchase = require('../models/purchaseModel');
const ProductDamage = require('../models/productDamageModel');

// Helper function to calculate available stock for a product in a location
const calculateAvailableStock = async (productId, locationType, locationId) => {
  let availableStock = 0;
  
  if (locationType === 'warehouse') {
    const product = await Product.findById(productId);
    console.log(`Debug calculateAvailableStock - Product: ${product?.name}, Original Warehouse: ${product?.warehouse}, Target Warehouse: ${locationId}`);
    
    const isOriginalWarehouse = product && product.warehouse && product.warehouse.toString() === locationId;
    
    // Step 1: Start with original stock if product was originally assigned to this warehouse
    // Note: countInStock already reflects ALL damages globally (they reduce it when created)
    // For original warehouse, countInStock already accounts for damages there
    if (isOriginalWarehouse) {
      availableStock = product.countInStock - (product.returnedQuantity || 0);
      console.log(`Debug - Original stock: ${availableStock} (${product.countInStock} - ${product.returnedQuantity || 0})`);
    }
    
    // Step 2: Add incoming transfers TO this warehouse
    const incomingTransfers = await StockTransfer.find({
      destinationType: 'warehouse',
      destinationId: locationId
    });
    console.log(`Debug - Found ${incomingTransfers.length} incoming transfers for warehouse ${locationId}`);
    
    for (const transfer of incomingTransfers) {
      const transferredItem = transfer.items.find(
        i => i.product && i.product.toString() === productId.toString()
      );
      
      if (transferredItem) {
        availableStock += transferredItem.quantity;
        console.log(`Debug - Added incoming transfer stock: ${transferredItem.quantity}, Total: ${availableStock}`);
      }
    }
    
    // Step 3: Subtract outgoing transfers FROM this warehouse
    const outgoingTransfers = await StockTransfer.find({
      sourceType: 'warehouse',
      sourceId: locationId
    });
    console.log(`Debug - Found ${outgoingTransfers.length} outgoing transfers for warehouse ${locationId}`);
    
    for (const transfer of outgoingTransfers) {
      const transferredItem = transfer.items.find(
        i => i.product && i.product.toString() === productId.toString()
      );
      
      if (transferredItem) {
        availableStock -= transferredItem.quantity;
        console.log(`Debug - Subtracted outgoing transfer stock: ${transferredItem.quantity}, Total: ${availableStock}`);
      }
    }
    
    // Step 4: Subtract location-specific damages at this warehouse
    // For original warehouse: countInStock already reflects damages, but we need to be careful
    // For other warehouses: damages of transferred stock should be subtracted
    // The issue is that countInStock is global, so damages elsewhere affect it too
    // We only subtract damages that are specifically at this location if this is NOT the original warehouse
    // OR if we need to account for damages of transferred stock
    if (!isOriginalWarehouse) {
      // For non-original warehouses, subtract location-specific damages from transferred stock
      const locationDamages = await ProductDamage.find({
        product: productId,
        warehouse: locationId,
        status: 'approved',
        isActive: { $ne: false }
      });
      
      let totalLocationDamages = 0;
      for (const damage of locationDamages) {
        totalLocationDamages += damage.quantity || 0;
      }
      availableStock -= totalLocationDamages;
      console.log(`Debug - Subtracted location damages (non-original): ${totalLocationDamages}, Total: ${availableStock}`);
    } else {
      // For original warehouse, countInStock already reflects all damages globally
      // But we need to check: did any damages happen at OTHER locations that reduced countInStock?
      // If damages happened elsewhere, they incorrectly reduced the original warehouse's base stock
      // So we need to add back damages from OTHER locations
      const otherLocationDamages = await ProductDamage.find({
        product: productId,
        warehouse: { $ne: locationId },
        status: 'approved',
        isActive: { $ne: false }
      });
      
      let totalOtherDamages = 0;
      for (const damage of otherLocationDamages) {
        totalOtherDamages += damage.quantity || 0;
      }
      // Add back damages from other locations since they incorrectly reduced countInStock
      availableStock += totalOtherDamages;
      console.log(`Debug - Added back damages from other locations: ${totalOtherDamages}, Total: ${availableStock}`);
    }
  } else if (locationType === 'shop') {
    // Shop - calculate stock from transfers only (shops don't have direct purchases)
    
    // Step 1: Get all incoming transfers to this shop
    const incomingTransfers = await StockTransfer.find({
      destinationType: 'shop',
      destinationId: locationId
    });
    
    for (const transfer of incomingTransfers) {
      const transferredItem = transfer.items.find(
        i => i.product && i.product.toString() === productId.toString()
      );
      
      if (transferredItem) {
        availableStock += transferredItem.quantity;
      }
    }
    
    // Step 2: Subtract outgoing transfers from this shop
    const outgoingTransfers = await StockTransfer.find({
      sourceType: 'shop',
      sourceId: locationId
    });
    
    for (const transfer of outgoingTransfers) {
      const transferredItem = transfer.items.find(
        i => i.product && i.product.toString() === productId.toString()
      );
      
      if (transferredItem) {
        availableStock -= transferredItem.quantity;
      }
    }
    
    // Step 3: Subtract location-specific damages at this shop
    const locationDamages = await ProductDamage.find({
      product: productId,
      shop: locationId,
      status: 'approved',
      isActive: { $ne: false }
    });
    
    let totalLocationDamages = 0;
    for (const damage of locationDamages) {
      totalLocationDamages += damage.quantity || 0;
    }
    availableStock -= totalLocationDamages;
    console.log(`Debug - Subtracted location damages at shop: ${totalLocationDamages}, Total: ${availableStock}`);
  }
  
  console.log(`Debug - Final calculated stock for ${locationType} ${locationId}: ${availableStock}`);
  return availableStock;
};

// Helper function to find all locations where a product has stock
const findProductStockLocations = async (productId) => {
  const locationsWithStock = [];
  
  try {
    // Check original warehouse
    const product = await Product.findById(productId);
    if (product && product.warehouse) {
      const warehouse = await Warehouse.findById(product.warehouse);
      if (warehouse) {
        const stock = await calculateAvailableStock(productId, 'warehouse', product.warehouse);
        if (stock > 0) {
          locationsWithStock.push({
            type: 'warehouse',
            id: product.warehouse,
            name: warehouse.name,
            stock: stock
          });
        }
      }
    }
    
    // Check all warehouses for transferred stock
    const allWarehouses = await Warehouse.find({});
    for (const warehouse of allWarehouses) {
      if (product && product.warehouse && warehouse._id.toString() === product.warehouse.toString()) {
        continue; // Skip original warehouse as we already checked it
      }
      
      const stock = await calculateAvailableStock(productId, 'warehouse', warehouse._id);
      if (stock > 0) {
        locationsWithStock.push({
          type: 'warehouse',
          id: warehouse._id,
          name: warehouse.name,
          stock: stock
        });
      }
    }
    
    // Check all shops for transferred stock
    const allShops = await Shop.find({});
    for (const shop of allShops) {
      const stock = await calculateAvailableStock(productId, 'shop', shop._id);
      if (stock > 0) {
        locationsWithStock.push({
          type: 'shop',
          id: shop._id,
          name: shop.name,
          stock: stock
        });
      }
    }
  } catch (error) {
    console.error('Error finding product stock locations:', error);
  }
  
  return locationsWithStock;
};

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
      // status is intentionally ignored; transfers are auto-completed
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

      // Calculate available stock using helper function
      const availableStock = await calculateAvailableStock(item.product, sourceType, sourceId);
      
      // Check if there's enough stock
      if (availableStock < item.quantity) {
        // Find where the product actually has stock
        const productLocations = await findProductStockLocations(item.product);
        
        // Debug information
        console.log(`Debug - Product: ${product.name}`);
        console.log(`Debug - Source: ${sourceType} ${sourceId}`);
        console.log(`Debug - Available Stock: ${availableStock}`);
        console.log(`Debug - Requested: ${item.quantity}`);
        console.log(`Debug - Product Original Warehouse: ${product.warehouse}`);
        
        return res.status(400).json({
          status: 'fail',
          message: `Insufficient stock for product ${product.name} in ${sourceType}. Available: ${availableStock}, Requested: ${item.quantity}`,
          debug: {
            sourceType,
            sourceId,
            productOriginalWarehouse: product.warehouse,
            availableStock,
            requestedQuantity: item.quantity
          },
          suggestions: {
            message: "Product is available in the following locations:",
            locations: productLocations
          }
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
      sourceType,
      sourceId,
      destinationType,
      destinationId,
      transferDate: transferDate || Date.now(),
      items,
      // Force completed so transfers are auto-approved/processed
      status: 'completed',
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
      .populate([
        { path: 'sourceId', select: 'name code', model: 'Warehouse' },
        { path: 'sourceId', select: 'name code', model: 'Shop' },
        { path: 'destinationId', select: 'name code', model: 'Warehouse' },
        { path: 'destinationId', select: 'name code', model: 'Shop' }
      ])
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
    const populatedTransfer = await StockTransfer.findById(req.params.id)
      .populate([
        {
          path: 'sourceId',
          select: 'name code branch contactPerson phoneNumber email',
          model: 'Warehouse'
        },
        {
          path: 'sourceId',
          select: 'name code location contactPerson phoneNumber email',
          model: 'Shop'
        },
        {
          path: 'destinationId',
          select: 'name code branch contactPerson phoneNumber email',
          model: 'Warehouse'
        },
        {
          path: 'destinationId',
          select: 'name code location contactPerson phoneNumber email',
          model: 'Shop'
        }
      ])
      .populate('user', 'name email')
      .populate({
        path: 'items.product',
        select: 'name image description packingUnit additionalUnit'
      });

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

// @desc    Update stock transfer status (disabled - transfers auto-complete)
// @route   PUT /api/stock-transfers/:id/status
// @access  Private
const updateStockTransferStatus = async (req, res) => {
  return res.status(400).json({
    status: 'fail',
    message: 'Status updates are disabled. Transfers are auto-completed on creation.'
  });
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

// @desc    Get available stock for a product in a specific location
// @route   GET /api/stock-transfers/stock/:productId/:locationType/:locationId
// @access  Private
const getProductStockInLocation = async (req, res) => {
  try {
    const { productId, locationType, locationId } = req.params;
    
    if (!['warehouse', 'shop'].includes(locationType)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Location type must be either "warehouse" or "shop"'
      });
    }
    
    // Check if product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        status: 'fail',
        message: 'Product not found'
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
        message: `${locationType} not found`
      });
    }
    
    // Calculate available stock
    const availableStock = await calculateAvailableStock(productId, locationType, locationId);
    
    // Get detailed breakdown for debugging
    let breakdown = {
      originalStock: 0,
      incomingTransfers: 0,
      outgoingTransfers: 0,
      total: availableStock
    };
    
    if (locationType === 'warehouse') {
      // Original stock
      if (product.warehouse && product.warehouse.toString() === locationId) {
        breakdown.originalStock = product.countInStock;
      }
      
      // Incoming transfers
      const incomingTransfers = await StockTransfer.find({
        destinationType: 'warehouse',
        destinationId: locationId,
        
      });
      
      for (const transfer of incomingTransfers) {
        const transferredItem = transfer.items.find(
          i => i.product.toString() === productId.toString()
        );
        if (transferredItem) {
          breakdown.incomingTransfers += transferredItem.quantity;
        }
      }
      
      // Outgoing transfers
      const outgoingTransfers = await StockTransfer.find({
        sourceType: 'warehouse',
        sourceId: locationId,
        
      });
      
      for (const transfer of outgoingTransfers) {
        const transferredItem = transfer.items.find(
          i => i.product.toString() === productId.toString()
        );
        if (transferredItem) {
          breakdown.outgoingTransfers += transferredItem.quantity;
        }
      }
    } else {
      // Shop calculations
      const incomingTransfers = await StockTransfer.find({
        destinationType: 'shop',
        destinationId: locationId,
        
      });
      
      for (const transfer of incomingTransfers) {
        const transferredItem = transfer.items.find(
          i => i.product.toString() === productId.toString()
        );
        if (transferredItem) {
          breakdown.incomingTransfers += transferredItem.quantity;
        }
      }
      
      const outgoingTransfers = await StockTransfer.find({
        sourceType: 'shop',
        sourceId: locationId,
        
      });
      
      for (const transfer of outgoingTransfers) {
        const transferredItem = transfer.items.find(
          i => i.product.toString() === productId.toString()
        );
        if (transferredItem) {
          breakdown.outgoingTransfers += transferredItem.quantity;
        }
      }
    }
    
    res.json({
      status: 'success',
      data: {
        product: {
          _id: product._id,
          name: product.name,
          originalWarehouse: product.warehouse
        },
        location: {
          type: locationType,
          id: locationId,
          name: locationExists.name
        },
        stock: {
          available: availableStock,
          breakdown
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// @desc    Test stock calculation for debugging
// @route   GET /api/stock-transfers/test-stock/:productId/:locationType/:locationId
// @access  Private
const testStockCalculation = async (req, res) => {
  try {
    const { productId, locationType, locationId } = req.params;
    
    console.log(`Testing stock calculation for product ${productId} in ${locationType} ${locationId}`);
    
    const stock = await calculateAvailableStock(productId, locationType, locationId);
    
    res.json({
      status: 'success',
      data: {
        productId,
        locationType,
        locationId,
        calculatedStock: stock
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// @desc    Get all locations where a product has stock
// @route   GET /api/stock-transfers/product-locations/:productId
// @access  Private
const getProductStockLocations = async (req, res) => {
  try {
    const { productId } = req.params;
    
    // Check if product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        status: 'fail',
        message: 'Product not found'
      });
    }
    
    const locationsWithStock = await findProductStockLocations(productId);
    console.log(`Debug - Found ${locationsWithStock.length} locations with stock for product ${productId}`);
    
    res.json({
      status: 'success',
      data: {
        product: {
          _id: product._id,
          name: product.name,
          originalWarehouse: product.warehouse
        },
        locationsWithStock
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// @desc    Get stock transfers by warehouse or shop ID (as source or destination)
// @route   GET /api/stock-transfers/by-location/:locationType/:locationId
// @access  Private
const getStockTransfersByLocation = async (req, res) => {
  try {
    const { locationType, locationId } = req.params;
    const {
      page = 1,
      limit = 10,
      status,
      transferType = 'all', // 'incoming', 'outgoing', 'all'
      startDate,
      endDate,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Validate location type
    if (!['warehouse', 'shop'].includes(locationType)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Location type must be either "warehouse" or "shop"'
      });
    }

    // Validate location ID format
    if (!locationId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid location ID format'
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
        message: `${locationType} not found`
      });
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build query object based on transfer type
    let query = {};

    if (transferType === 'incoming') {
      // Only transfers TO this location
      query.destinationType = locationType;
      query.destinationId = locationId;
    } else if (transferType === 'outgoing') {
      // Only transfers FROM this location
      query.sourceType = locationType;
      query.sourceId = locationId;
    } else {
      // All transfers involving this location (both incoming and outgoing)
      query.$or = [
        {
          sourceType: locationType,
          sourceId: locationId
        },
        {
          destinationType: locationType,
          destinationId: locationId
        }
      ];
    }

    // Filter by status
    if (status) {
      query.status = status;
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

    // Determine sort options
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Count total documents for pagination info
    const totalTransfers = await StockTransfer.countDocuments(query);

    // Find stock transfers based on query with pagination
    const stockTransfers = await StockTransfer.find(query)
      .populate('user', 'name email')
      .populate({
        path: 'items.product',
        select: 'name image description sku code saleRate purchaseRate wholesaleRate retailRate size color quantityUnit packingUnit category supplier currency countInStock damagedQuantity returnedQuantity',
        populate: [
          { path: 'packingUnit', select: 'name' },
          { path: 'quantityUnit', select: 'name' },
          { path: 'category', select: 'name' },
          { path: 'supplier', select: 'name email phoneNumber' },
          { path: 'currency', select: 'name code symbol' }
        ]
      })
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Manually populate source and destination based on type
    let dataWithNames = await Promise.all(stockTransfers.map(async (doc) => {
      let sourceData = null;
      let destinationData = null;

      // Populate source
      if (doc.sourceId) {
        if (doc.sourceType === 'warehouse') {
          sourceData = await Warehouse.findById(doc.sourceId).select('name code branch contactPerson phoneNumber email').lean();
        } else if (doc.sourceType === 'shop') {
          sourceData = await Shop.findById(doc.sourceId).select('name code location contactPerson phoneNumber email').lean();
        }
      }

      // Populate destination
      if (doc.destinationId) {
        if (doc.destinationType === 'warehouse') {
          destinationData = await Warehouse.findById(doc.destinationId).select('name code branch contactPerson phoneNumber email').lean();
        } else if (doc.destinationType === 'shop') {
          destinationData = await Shop.findById(doc.destinationId).select('name code location contactPerson phoneNumber email').lean();
        }
      }

      return {
        ...doc,
        sourceId: sourceData,
        destinationId: destinationData,
        sourceName: sourceData ? sourceData.name : null,
        destinationName: destinationData ? destinationData.name : null,
        source: sourceData,
        destination: destinationData
      };
    }));

    // Compute available stock at the requested location for all products seen in these transfers
    const includeStock = (req.query.includeStock || 'true') === 'true';
    let availableStockByProduct = [];
    if (includeStock) {
      const uniqueProductIds = new Set();
      for (const transfer of dataWithNames) {
        if (Array.isArray(transfer.items)) {
          for (const item of transfer.items) {
            if (item && item.product) {
              uniqueProductIds.add(item.product._id ? item.product._id.toString() : item.product.toString());
            }
          }
        }
      }

      const productIdToAvailable = new Map();
      for (const pid of uniqueProductIds) {
        const available = await calculateAvailableStock(pid, locationType, locationId);
        productIdToAvailable.set(pid, available);
      }

      // Attach per-item availableAtLocation and build summary array
      for (const transfer of dataWithNames) {
        if (Array.isArray(transfer.items)) {
          transfer.items = transfer.items.map((it) => {
            const pid = it && it.product ? (it.product._id ? it.product._id.toString() : it.product.toString()) : null;
            const availableAtLocation = pid ? (productIdToAvailable.get(pid) || 0) : 0;
            return { ...it, availableAtLocation };
          });
        }
      }

      // Filter out items with zero or negative available stock and drop empty transfers
      dataWithNames = dataWithNames
        .map(t => ({
          ...t,
          items: Array.isArray(t.items) ? t.items.filter(it => Number(it.availableAtLocation || 0) > 0) : []
        }))
        .filter(t => t.items.length > 0);

      availableStockByProduct = Array.from(productIdToAvailable.entries()).map(([pid, available]) => ({
        product: pid,
        availableAtLocation: available
      })).filter(e => Number(e.availableAtLocation || 0) > 0);
    }

    // Calculate summary statistics
    const incomingCount = await StockTransfer.countDocuments({
      destinationType: locationType,
      destinationId: locationId
    });

    const outgoingCount = await StockTransfer.countDocuments({
      sourceType: locationType,
      sourceId: locationId
    });

    res.json({
      status: 'success',
      results: dataWithNames.length,
      totalPages: Math.ceil(totalTransfers / limitNum),
      currentPage: pageNum,
      totalTransfers,
      transferType,
      location: {
        type: locationType,
        id: locationId,
        name: locationExists.name,
        code: locationExists.code
      },
      summary: {
        incomingTransfers: incomingCount,
        outgoingTransfers: outgoingCount,
        totalTransfers: incomingCount + outgoingCount
      },
      data: dataWithNames,
      availableStockByProduct
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
  deleteStockTransfer,
  getProductStockInLocation,
  getProductStockLocations,
  testStockCalculation,
  calculateAvailableStock,
  getStockTransfersByLocation,
};