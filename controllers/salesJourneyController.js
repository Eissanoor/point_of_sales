const SalesJourney = require('../models/salesJourneyModel');

// @desc    Create a new sales journey record
// @route   POST /api/sales-journey
// @access  Private
const createSalesJourney = async (req, res) => {
  try {
    const {
      sale,
      action,
      changes,
      paymentDetails,
      notes
    } = req.body;

    const salesJourney = await SalesJourney.create({
      sale,
      user: req.user._id,
      action,
      changes,
      paymentDetails,
      notes
    });

    if (salesJourney) {
      res.status(201).json({
        status: 'success',
        data: salesJourney,
      });
    } else {
      res.status(400).json({
        status: 'fail',
        message: 'Invalid sales journey data',
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get all sales journey records for a specific sale
// @route   GET /api/sales-journey/sale/:saleId
// @access  Private
const getSalesJourneyBySaleId = async (req, res) => {
  try {
    const salesJourney = await SalesJourney.find({ sale: req.params.saleId })
      .populate('user', 'name email')
      .sort({ createdAt: -1 });

    res.json({
      status: 'success',
      results: salesJourney.length,
      data: salesJourney,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get all sales journey records with pagination and filtering
// @route   GET /api/sales-journey
// @access  Private/Admin
const getSalesJourneys = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      startDate, 
      endDate, 
      sale,
      action
    } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    let query = {};

    // Filter by date range
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    // Filter by sale
    if (sale) {
      query.sale = sale;
    }

    // Filter by action
    if (action) {
      query.action = action;
    }

    // Count total documents for pagination info
    const totalJourneys = await SalesJourney.countDocuments(query);

    // Find sales journeys based on query with pagination
    const salesJourneys = await SalesJourney.find(query)
      .populate('sale', 'invoiceNumber')
      .populate('user', 'name email')
      .limit(limitNum)
      .skip(skip)
      .sort({ createdAt: -1 });
    
    res.json({
      status: 'success',
      results: salesJourneys.length,
      totalPages: Math.ceil(totalJourneys / limitNum),
      currentPage: pageNum,
      totalJourneys,
      data: salesJourneys,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get sales journey record by ID
// @route   GET /api/sales-journey/:id
// @access  Private
const getSalesJourneyById = async (req, res) => {
  try {
    const salesJourney = await SalesJourney.findById(req.params.id)
      .populate('sale', 'invoiceNumber')
      .populate('user', 'name email');

    if (salesJourney) {
      res.json({
        status: 'success',
        data: salesJourney,
      });
    } else {
      res.status(404).json({
        status: 'fail',
        message: 'Sales journey record not found',
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

module.exports = {
  createSalesJourney,
  getSalesJourneyBySaleId,
  getSalesJourneys,
  getSalesJourneyById,
}; 