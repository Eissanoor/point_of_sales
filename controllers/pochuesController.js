const Pochues = require('../models/pochuesModel');
const PackingUnit = require('../models/packingUnitModel');

// @desc    Get all pochues
// @route   GET /api/pochues
// @access  Public
const getPochues = async (req, res) => {
  try {
    const { 
      keyword = '', 
      packingUnit,
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
    
    // Filter by packing unit
    if (packingUnit) {
      filter.packingUnit = packingUnit;
    }
    
    // Filter by active status
    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }
    
    // Determine sort options
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    // Count total documents for pagination info
    const totalPochues = await Pochues.countDocuments(filter);
    
    // Find pochues based on filters with pagination and sorting
    const pochues = await Pochues.find(filter)
      .populate({
        path: 'packingUnit',
        select: 'name',
        populate: {
          path: 'quantityUnit',
          select: 'name'
        }
      })
      .sort(sort)
      .skip(skip)
      .limit(limitNum);

    res.json({
      status: 'success',
      results: pochues.length,
      totalPages: Math.ceil(totalPochues / limitNum),
      currentPage: pageNum,
      totalPochues,
      data: pochues,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get pochues by ID
// @route   GET /api/pochues/:id
// @access  Public
const getPochuesById = async (req, res) => {
  try {
    const pochues = await Pochues.findById(req.params.id)
      .populate({
        path: 'packingUnit',
        select: 'name',
        populate: {
          path: 'quantityUnit',
          select: 'name'
        }
      });

    if (pochues) {
      res.json({
        status: 'success',
        data: pochues,
      });
    } else {
      res.status(404).json({
        status: 'fail',
        message: 'Pochues not found',
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Create pochues
// @route   POST /api/pochues
// @access  Private/Admin
const createPochues = async (req, res) => {
  try {
    const { name, packingUnit } = req.body;

    // Check if packing unit exists
    const packingUnitExists = await PackingUnit.findById(packingUnit);
    if (!packingUnitExists) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid packing unit',
      });
    }

    const pochues = await Pochues.create({
      name,
      packingUnit,
    });

    // Populate the packing unit reference
    await pochues.populate({
      path: 'packingUnit',
      select: 'name',
      populate: {
        path: 'quantityUnit',
        select: 'name'
      }
    });

    res.status(201).json({
      status: 'success',
      data: pochues,
    });
  } catch (error) {
    if (error.code === 11000) {
      res.status(400).json({
        status: 'fail',
        message: 'Pochues with this name already exists for the selected packing unit',
      });
    } else {
      res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  }
};

// @desc    Update pochues
// @route   PUT /api/pochues/:id
// @access  Private/Admin
const updatePochues = async (req, res) => {
  try {
    const pochues = await Pochues.findById(req.params.id);
    
    if (pochues) {
      // Check if packing unit exists (if being updated)
      if (req.body.packingUnit) {
        const packingUnitExists = await PackingUnit.findById(req.body.packingUnit);
        if (!packingUnitExists) {
          return res.status(400).json({
            status: 'fail',
            message: 'Invalid packing unit',
          });
        }
      }

      // Update fields if provided
      for (const [key, value] of Object.entries(req.body)) {
        if (pochues[key] !== value) {
          pochues[key] = value;
        }
      }
      
      const updatedPochues = await pochues.save();
      
      // Populate the packing unit reference
      await updatedPochues.populate({
        path: 'packingUnit',
        select: 'name',
        populate: {
          path: 'quantityUnit',
          select: 'name'
        }
      });
      
      res.json({
        status: 'success',
        data: updatedPochues,
      });
    } else {
      res.status(404).json({
        status: 'fail',
        message: 'Pochues not found',
      });
    }
  } catch (error) {
    if (error.code === 11000) {
      res.status(400).json({
        status: 'fail',
        message: 'Pochues with this name already exists for the selected packing unit',
      });
    } else {
      res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  }
};

// @desc    Delete pochues
// @route   DELETE /api/pochues/:id
// @access  Private/Admin
const deletePochues = async (req, res) => {
  try {
    const pochues = await Pochues.findById(req.params.id);

    if (pochues) {
      await Pochues.deleteOne({ _id: req.params.id });
      
      res.json({
        status: 'success',
        message: 'Pochues removed',
      });
    } else {
      res.status(404).json({
        status: 'fail',
        message: 'Pochues not found',
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get pochues by packing unit
// @route   GET /api/pochues/packing-unit/:packingUnitId
// @access  Public
const getPochuesByPackingUnit = async (req, res) => {
  try {
    const { packingUnitId } = req.params;
    
    // Check if packing unit exists
    const packingUnit = await PackingUnit.findById(packingUnitId);
    if (!packingUnit) {
      return res.status(404).json({
        status: 'fail',
        message: 'Packing unit not found',
      });
    }

    const pochues = await Pochues.find({ 
      packingUnit: packingUnitId,
      isActive: true 
    })
      .populate({
        path: 'packingUnit',
        select: 'name',
        populate: {
          path: 'quantityUnit',
          select: 'name'
        }
      })
      .sort({ name: 1 });

    res.json({
      status: 'success',
      results: pochues.length,
      data: pochues,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

module.exports = {
  getPochues,
  getPochuesById,
  createPochues,
  updatePochues,
  deletePochues,
  getPochuesByPackingUnit,
};
