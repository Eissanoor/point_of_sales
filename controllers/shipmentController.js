const Shipment = require('../models/shipmentModel');

// @desc    Fetch all shipments
// @route   GET /api/shipments
// @access  Private
const getShipments = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, supplier, transporter, search } = req.query;
    
    let query = { isActive: true };
    
    // Filter by status
    if (status) {
      query.status = status;
    }
    
    // Filter by supplier
    if (supplier) {
      query.supplier = supplier;
    }
    
    // Filter by transporter
    if (transporter) {
      query.transporter = transporter;
    }
    
    // Search functionality
    if (search) {
      query.$or = [
        { shipmentId: { $regex: search, $options: 'i' } },
        { batchNo: { $regex: search, $options: 'i' } },
        { trackingNumber: { $regex: search, $options: 'i' } }
      ];
    }
    
    const shipments = await Shipment.find(query)
      .populate('supplier', 'name email contactPerson')
      .populate('transporter', 'name contactPerson phoneNumber')
      .populate('products.product', 'name sku category')
      .populate('currency', 'name code symbol')
      .populate('destination.warehouse', 'name location')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await Shipment.countDocuments(query);
    
    res.json({
      status: 'success',
      results: shipments.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      data: shipments
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// @desc    Fetch single shipment
// @route   GET /api/shipments/:id
// @access  Private
const getShipmentById = async (req, res) => {
  try {
    const shipment = await Shipment.findById(req.params.id)
      .populate('supplier', 'name email contactPerson phoneNumber address')
      .populate('transporter', 'name contactPerson phoneNumber email')
      .populate('products.product', 'name sku category description')
      .populate('currency', 'name code symbol exchangeRate')
      .populate('destination.warehouse', 'name location capacity');
    
    if (!shipment) {
      return res.status(404).json({
        status: 'fail',
        message: 'Shipment not found'
      });
    }
    
    res.json({
      status: 'success',
      data: shipment
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// Helper function to generate unique IDs
const generateShipmentId = async () => {
  const year = new Date().getFullYear();
  const count = await Shipment.countDocuments({}) + 1;
  return `SHP-${year}-${String(count).padStart(3, '0')}`;
};

const generateBatchNo = async () => {
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, '0');
  const count = await Shipment.countDocuments({}) + 1;
  return `BATCH-${month}${year}-${String(count).padStart(3, '0')}`;
};

const generateTrackingNumber = () => {
  const prefix = 'TRK';
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}${timestamp}${random}`;
};

// @desc    Create shipment
// @route   POST /api/shipments
// @access  Private
const createShipment = async (req, res) => {
  try {
    const {
      supplier,
      transporter,
      products,
      origin,
      destination,
      status,
      shipmentDate,
      estimatedArrival,
      totalWeight,
      currency,
      documents,
      notes
    } = req.body;
    
    // Validate required fields
    if (!supplier || !products || !origin || !destination || !currency) {
      return res.status(400).json({
        status: 'fail',
        message: 'Required fields: supplier, products, origin, destination, currency'
      });
    }
    
    // Auto-generate unique identifiers
    const shipmentId = await generateShipmentId();
    const batchNo = await generateBatchNo();
    const trackingNumber = generateTrackingNumber();
    
    const shipment = new Shipment({
      shipmentId,
      batchNo,
      supplier,
      transporter,
      products,
      origin,
      destination,
      status,
      shipmentDate,
      estimatedArrival,
      trackingNumber,
      totalWeight,
      currency,
      documents,
      notes
    });
    
    const savedShipment = await shipment.save();
    
    // Populate the saved shipment for response
    const populatedShipment = await Shipment.findById(savedShipment._id)
      .populate('supplier', 'name email')
      .populate('transporter', 'name contactPerson')
      .populate('products.product', 'name sku')
      .populate('currency', 'name code symbol');
    
    res.status(201).json({
      status: 'success',
      data: populatedShipment,
      message: 'Shipment created successfully'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// @desc    Update shipment
// @route   PUT /api/shipments/:id
// @access  Private
const updateShipment = async (req, res) => {
  try {
    const shipment = await Shipment.findById(req.params.id);
    
    if (!shipment) {
      return res.status(404).json({
        status: 'fail',
        message: 'Shipment not found'
      });
    }
    
    // Update fields
    Object.keys(req.body).forEach(key => {
      if (req.body[key] !== undefined) {
        shipment[key] = req.body[key];
      }
    });
    
    const updatedShipment = await shipment.save();
    
    // Populate the updated shipment for response
    const populatedShipment = await Shipment.findById(updatedShipment._id)
      .populate('supplier', 'name email')
      .populate('transporter', 'name contactPerson')
      .populate('products.product', 'name sku')
      .populate('currency', 'name code symbol');
    
    res.json({
      status: 'success',
      data: populatedShipment,
      message: 'Shipment updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// @desc    Delete shipment
// @route   DELETE /api/shipments/:id
// @access  Private
const deleteShipment = async (req, res) => {
  try {
    const shipment = await Shipment.findById(req.params.id);
    
    if (!shipment) {
      return res.status(404).json({
        status: 'fail',
        message: 'Shipment not found'
      });
    }
    
    // Soft delete - mark as inactive
    shipment.isActive = false;
    await shipment.save();
    
    res.json({
      status: 'success',
      message: 'Shipment deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// @desc    Update shipment status
// @route   PUT /api/shipments/:id/status
// @access  Private
const updateShipmentStatus = async (req, res) => {
  try {
    const { status, actualArrival } = req.body;
    
    const shipment = await Shipment.findById(req.params.id);
    
    if (!shipment) {
      return res.status(404).json({
        status: 'fail',
        message: 'Shipment not found'
      });
    }
    
    shipment.status = status;
    if (actualArrival) {
      shipment.actualArrival = actualArrival;
    }
    
    await shipment.save();
    
    res.json({
      status: 'success',
      data: shipment,
      message: 'Shipment status updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// @desc    Get shipment analytics
// @route   GET /api/shipments/analytics
// @access  Private
const getShipmentAnalytics = async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    
    let matchQuery = { isActive: true };
    
    if (dateFrom || dateTo) {
      matchQuery.shipmentDate = {};
      if (dateFrom) matchQuery.shipmentDate.$gte = new Date(dateFrom);
      if (dateTo) matchQuery.shipmentDate.$lte = new Date(dateTo);
    }
    
    // Status breakdown
    const statusAnalytics = await Shipment.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalValue: { $sum: '$totalValue' }
        }
      }
    ]);
    
    // Supplier breakdown
    const supplierAnalytics = await Shipment.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$supplier',
          count: { $sum: 1 },
          totalValue: { $sum: '$totalValue' }
        }
      },
      {
        $lookup: {
          from: 'suppliers',
          localField: '_id',
          foreignField: '_id',
          as: 'supplierInfo'
        }
      },
      {
        $project: {
          count: 1,
          totalValue: 1,
          supplierName: { $arrayElemAt: ['$supplierInfo.name', 0] }
        }
      },
      { $sort: { totalValue: -1 } }
    ]);
    
    // Total statistics
    const totalStats = await Shipment.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalShipments: { $sum: 1 },
          totalValue: { $sum: '$totalValue' },
          avgValue: { $avg: '$totalValue' }
        }
      }
    ]);
    
    res.json({
      status: 'success',
      data: {
        byStatus: statusAnalytics,
        bySupplier: supplierAnalytics,
        total: totalStats[0] || { totalShipments: 0, totalValue: 0, avgValue: 0 }
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

module.exports = {
  getShipments,
  getShipmentById,
  createShipment,
  updateShipment,
  deleteShipment,
  updateShipmentStatus,
  getShipmentAnalytics
};
