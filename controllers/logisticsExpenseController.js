const LogisticsExpense = require('../models/logisticsExpenseModel');
const Transporter = require('../models/transporterModel');
const Warehouse = require('../models/warehouseModel');
const Shipment = require('../models/shipmentModel');
const Currency = require('../models/currencyModel');

// @desc    Fetch all logistics expenses
// @route   GET /api/logistics-expenses
// @access  Private
const getLogisticsExpenses = async (req, res) => {
  try {
    const { transporter, route, status, page = 1, limit = 10 } = req.query;
    
    let query = { isActive: true };
    
    if (transporter) query.transporter = transporter;
    if (route) query.route = { $regex: route, $options: 'i' };
    if (status) query.transportStatus = status;
    
    const expenses = await LogisticsExpense.find(query)
      .populate('transporter', 'name contactPerson phoneNumber')
      .populate('linkedWarehouse', 'name location')
      .populate('linkedShipment', 'shipmentId batchNo status')
      .populate('currency', 'name code symbol')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await LogisticsExpense.countDocuments(query);
    
    res.json({
      status: 'success',
      results: expenses.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      data: expenses
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// @desc    Fetch single logistics expense
// @route   GET /api/logistics-expenses/:id
// @access  Private
const getLogisticsExpenseById = async (req, res) => {
  try {
    const expense = await LogisticsExpense.findById(req.params.id)
      .populate('transporter', 'name contactPerson phoneNumber email address')
      .populate('linkedWarehouse', 'name location address')
      .populate('linkedShipment', 'shipmentId batchNo status origin destination')
      .populate('currency', 'name code symbol exchangeRate');
    
    if (!expense) {
      return res.status(404).json({
        status: 'fail',
        message: 'Logistics expense not found'
      });
    }
    
    res.json({
      status: 'success',
      data: expense
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// @desc    Create logistics expense
// @route   POST /api/logistics-expenses
// @access  Private
const createLogisticsExpense = async (req, res) => {
  try {
    const {
      transporter,
      route,
      vehicleContainerNo,
      freightCost,
      borderCrossingCharges,
      transporterCommission,
      serviceFee,
      transitWarehouseCharges,
      localTransportCharges,
      currency,
      exchangeRate,
      linkedShipment,
      linkedWarehouse,
      paymentMethod,
      departureDate,
      arrivalDate,
      notes
    } = req.body;
    
    // Validate required fields
    if (!transporter || !route || !freightCost || !currency || !paymentMethod) {
      return res.status(400).json({
        status: 'fail',
        message: 'Required fields: transporter, route, freightCost, currency, paymentMethod'
      });
    }
    
    // Get exchange rate if not provided
    let finalExchangeRate = exchangeRate;
    if (!finalExchangeRate) {
      const currencyDoc = await Currency.findById(currency);
      if (currencyDoc) {
        finalExchangeRate = currencyDoc.exchangeRate;
      }
    }
    
    const logisticsExpense = new LogisticsExpense({
      transporter,
      route,
      vehicleContainerNo,
      freightCost,
      borderCrossingCharges: borderCrossingCharges || 0,
      transporterCommission: transporterCommission || 0,
      serviceFee: serviceFee || 0,
      transitWarehouseCharges: transitWarehouseCharges || 0,
      localTransportCharges: localTransportCharges || 0,
      currency,
      exchangeRate: finalExchangeRate,
      linkedShipment,
      linkedWarehouse,
      paymentMethod,
      departureDate,
      arrivalDate,
      notes
    });
    
    const savedExpense = await logisticsExpense.save();
    
    // Populate the response
    const populatedExpense = await LogisticsExpense.findById(savedExpense._id)
      .populate('transporter', 'name contactPerson')
      .populate('linkedWarehouse', 'name location')
      .populate('currency', 'name code symbol');
    
    res.status(201).json({
      status: 'success',
      data: populatedExpense,
      message: 'Logistics expense created successfully'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// @desc    Update logistics expense
// @route   PUT /api/logistics-expenses/:id
// @access  Private
const updateLogisticsExpense = async (req, res) => {
  try {
    const expense = await LogisticsExpense.findById(req.params.id);
    
    if (!expense) {
      return res.status(404).json({
        status: 'fail',
        message: 'Logistics expense not found'
      });
    }
    
    // Update fields
    Object.keys(req.body).forEach(key => {
      if (req.body[key] !== undefined) {
        expense[key] = req.body[key];
      }
    });
    
    const updatedExpense = await expense.save();
    
    res.json({
      status: 'success',
      data: updatedExpense,
      message: 'Logistics expense updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// @desc    Delete logistics expense
// @route   DELETE /api/logistics-expenses/:id
// @access  Private
const deleteLogisticsExpense = async (req, res) => {
  try {
    const expense = await LogisticsExpense.findById(req.params.id);
    
    if (!expense) {
      return res.status(404).json({
        status: 'fail',
        message: 'Logistics expense not found'
      });
    }
    
    expense.isActive = false;
    await expense.save();
    
    res.json({
      status: 'success',
      message: 'Logistics expense deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// @desc    Update transport status
// @route   PUT /api/logistics-expenses/:id/status
// @access  Private
const updateTransportStatus = async (req, res) => {
  try {
    const { transportStatus, arrivalDate } = req.body;
    
    const expense = await LogisticsExpense.findById(req.params.id);
    
    if (!expense) {
      return res.status(404).json({
        status: 'fail',
        message: 'Logistics expense not found'
      });
    }
    
    expense.transportStatus = transportStatus;
    if (transportStatus === 'delivered' && arrivalDate) {
      expense.arrivalDate = new Date(arrivalDate);
    }
    
    await expense.save();
    
    res.json({
      status: 'success',
      data: expense,
      message: 'Transport status updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// @desc    Get logistics expenses by route
// @route   GET /api/logistics-expenses/route/:route
// @access  Private
const getLogisticsExpensesByRoute = async (req, res) => {
  try {
    const route = decodeURIComponent(req.params.route);
    
    const expenses = await LogisticsExpense.find({ 
      route: { $regex: route, $options: 'i' },
      isActive: true 
    })
      .populate('transporter', 'name contactPerson')
      .populate('currency', 'name code symbol')
      .sort({ createdAt: -1 });
    
    const totalAmount = expenses.reduce((sum, expense) => sum + expense.amountInPKR, 0);
    const avgCost = expenses.length > 0 ? totalAmount / expenses.length : 0;
    
    res.json({
      status: 'success',
      results: expenses.length,
      totalAmount,
      averageCost: avgCost,
      data: expenses
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

module.exports = {
  getLogisticsExpenses,
  getLogisticsExpenseById,
  createLogisticsExpense,
  updateLogisticsExpense,
  deleteLogisticsExpense,
  updateTransportStatus,
  getLogisticsExpensesByRoute
};
