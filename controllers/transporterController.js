const Transporter = require('../models/transporterModel');

// @desc    Fetch all transporters
// @route   GET /api/transporters
// @access  Private
const getTransporters = async (req, res) => {
  try {
    const { page = 1, limit = 10, search } = req.query;
    
    let query = { isActive: true };
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { contactPerson: { $regex: search, $options: 'i' } },
        { city: { $regex: search, $options: 'i' } }
      ];
    }
    
    const transporters = await Transporter.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await Transporter.countDocuments(query);
    
    res.json({
      status: 'success',
      results: transporters.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      data: transporters
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// @desc    Fetch single transporter
// @route   GET /api/transporters/:id
// @access  Private
const getTransporterById = async (req, res) => {
  try {
    const transporter = await Transporter.findById(req.params.id);
    
    if (!transporter) {
      return res.status(404).json({
        status: 'fail',
        message: 'Transporter not found'
      });
    }
    
    res.json({
      status: 'success',
      data: transporter
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// @desc    Create transporter
// @route   POST /api/transporters
// @access  Private
const createTransporter = async (req, res) => {
  try {
    const {
      name,
      contactPerson,
      phoneNumber,
      email,
      address,
      city,
      country,
      vehicleTypes,
      routes,
      commissionRate,
      paymentTerms,
      rating
    } = req.body;
    
    // Validate required fields
    if (!name || !contactPerson || !phoneNumber || !address) {
      return res.status(400).json({
        status: 'fail',
        message: 'Required fields: name, contactPerson, phoneNumber, address'
      });
    }
    
    const transporter = new Transporter({
      name,
      contactPerson,
      phoneNumber,
      email,
      address,
      city,
      country,
      vehicleTypes,
      routes,
      commissionRate,
      paymentTerms,
      rating
    });
    
    const savedTransporter = await transporter.save();
    
    res.status(201).json({
      status: 'success',
      data: savedTransporter,
      message: 'Transporter created successfully'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// @desc    Update transporter
// @route   PUT /api/transporters/:id
// @access  Private
const updateTransporter = async (req, res) => {
  try {
    const transporter = await Transporter.findById(req.params.id);
    
    if (!transporter) {
      return res.status(404).json({
        status: 'fail',
        message: 'Transporter not found'
      });
    }
    
    // Update fields
    Object.keys(req.body).forEach(key => {
      if (req.body[key] !== undefined) {
        transporter[key] = req.body[key];
      }
    });
    
    const updatedTransporter = await transporter.save();
    
    res.json({
      status: 'success',
      data: updatedTransporter,
      message: 'Transporter updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// @desc    Delete transporter
// @route   DELETE /api/transporters/:id
// @access  Private
const deleteTransporter = async (req, res) => {
  try {
    const transporter = await Transporter.findById(req.params.id);
    
    if (!transporter) {
      return res.status(404).json({
        status: 'fail',
        message: 'Transporter not found'
      });
    }
    
    transporter.isActive = false;
    await transporter.save();
    
    res.json({
      status: 'success',
      message: 'Transporter deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

module.exports = {
  getTransporters,
  getTransporterById,
  createTransporter,
  updateTransporter,
  deleteTransporter
};
