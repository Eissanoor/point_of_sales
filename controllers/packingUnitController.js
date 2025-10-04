const PackingUnit = require('../models/packingUnitModel');
const QuantityUnit = require('../models/quantityUnitModel');

// @desc    Get all packing units
// @route   GET /api/packing-units
// @access  Public
const getPackingUnits = async (req, res) => {
  try {
    const { 
      keyword = '', 
      quantityUnit,
      page = 1, 
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      isActive
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    // Build filter object
    const filter = {};
    
    // Search by keyword in name
    if (keyword) {
      filter.name = { $regex: keyword, $options: 'i' };
    }
    
    // Filter by quantity unit
    if (quantityUnit) {
      filter.quantityUnit = quantityUnit;
    }
    
    // Filter by active status
    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }
    
    // Determine sort options
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    // Count total documents for pagination info
    const totalPackingUnits = await PackingUnit.countDocuments(filter);
    
    // Find packing units based on filters with pagination and sorting
    const packingUnits = await PackingUnit.find(filter)
      .populate('quantityUnit', 'name')
      .sort(sort)
      .skip(skip)
      .limit(limitNum);

    res.json({
      status: 'success',
      results: packingUnits.length,
      totalPages: Math.ceil(totalPackingUnits / limitNum),
      currentPage: pageNum,
      totalPackingUnits,
      data: packingUnits,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get packing unit by ID
// @route   GET /api/packing-units/:id
// @access  Public
const getPackingUnitById = async (req, res) => {
  try {
    const packingUnit = await PackingUnit.findById(req.params.id)
      .populate('quantityUnit', 'name');

    if (packingUnit) {
      res.json({
        status: 'success',
        data: packingUnit,
      });
    } else {
      res.status(404).json({
        status: 'fail',
        message: 'Packing unit not found',
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Create packing unit
// @route   POST /api/packing-units
// @access  Private/Admin
const createPackingUnit = async (req, res) => {
  try {
    const { name, quantityUnit } = req.body;

    // Check if quantity unit exists
    const quantityUnitExists = await QuantityUnit.findById(quantityUnit);
    if (!quantityUnitExists) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid quantity unit',
      });
    }

    const packingUnit = await PackingUnit.create({
      name,
      quantityUnit,
    });

    // Populate the quantity unit reference
    await packingUnit.populate('quantityUnit', 'name');

    res.status(201).json({
      status: 'success',
      data: packingUnit,
    });
  } catch (error) {
    if (error.code === 11000) {
      res.status(400).json({
        status: 'fail',
        message: 'Packing unit with this name already exists for the selected quantity unit',
      });
    } else {
      res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  }
};

// @desc    Update packing unit
// @route   PUT /api/packing-units/:id
// @access  Private/Admin
const updatePackingUnit = async (req, res) => {
  try {
    const packingUnit = await PackingUnit.findById(req.params.id);
    
    if (packingUnit) {
      // Check if quantity unit exists (if being updated)
      if (req.body.quantityUnit) {
        const quantityUnitExists = await QuantityUnit.findById(req.body.quantityUnit);
        if (!quantityUnitExists) {
          return res.status(400).json({
            status: 'fail',
            message: 'Invalid quantity unit',
          });
        }
      }

      // Update fields if provided
      for (const [key, value] of Object.entries(req.body)) {
        if (packingUnit[key] !== value) {
          packingUnit[key] = value;
        }
      }
      
      const updatedPackingUnit = await packingUnit.save();
      
      // Populate the quantity unit reference
      await updatedPackingUnit.populate('quantityUnit', 'name');
      
      res.json({
        status: 'success',
        data: updatedPackingUnit,
      });
    } else {
      res.status(404).json({
        status: 'fail',
        message: 'Packing unit not found',
      });
    }
  } catch (error) {
    if (error.code === 11000) {
      res.status(400).json({
        status: 'fail',
        message: 'Packing unit with this name already exists for the selected quantity unit',
      });
    } else {
      res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  }
};

// @desc    Delete packing unit
// @route   DELETE /api/packing-units/:id
// @access  Private/Admin
const deletePackingUnit = async (req, res) => {
  try {
    const packingUnit = await PackingUnit.findById(req.params.id);

    if (packingUnit) {
      await PackingUnit.deleteOne({ _id: req.params.id });
      
      res.json({
        status: 'success',
        message: 'Packing unit removed',
      });
    } else {
      res.status(404).json({
        status: 'fail',
        message: 'Packing unit not found',
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get packing units by quantity unit
// @route   GET /api/packing-units/quantity-unit/:quantityUnitId
// @access  Public
const getPackingUnitsByQuantityUnit = async (req, res) => {
  try {
    const { quantityUnitId } = req.params;
    
    // Check if quantity unit exists
    const quantityUnit = await QuantityUnit.findById(quantityUnitId);
    if (!quantityUnit) {
      return res.status(404).json({
        status: 'fail',
        message: 'Quantity unit not found',
      });
    }

    const packingUnits = await PackingUnit.find({ 
      quantityUnit: quantityUnitId,
      isActive: true 
    })
      .populate('quantityUnit', 'name')
      .sort({ name: 1 });

    res.json({
      status: 'success',
      results: packingUnits.length,
      data: packingUnits,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

module.exports = {
  getPackingUnits,
  getPackingUnitById,
  createPackingUnit,
  updatePackingUnit,
  deletePackingUnit,
  getPackingUnitsByQuantityUnit,
};
