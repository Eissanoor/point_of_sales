const Shop = require('../models/shopModel');

// @desc    Create a new shop
// @route   POST /api/shops
// @access  Private
const createShop = async (req, res) => {
  try {
    const {
      name,
      code,
      location,
      contactPerson,
      phoneNumber,
      email,
      shopType,
      openingHours,
      status
    } = req.body;

    // Check if shop already exists with the same code
    const shopExists = await Shop.findOne({ code });
    if (shopExists) {
      return res.status(400).json({
        status: 'fail',
        message: 'Shop with this code already exists',
      });
    }

    // Create new shop
    const shop = await Shop.create({
      name,
      code,
      location,
      contactPerson,
      phoneNumber,
      email,
      shopType: shopType || 'retail',
      openingHours,
      status: status || 'active',
      inventory: [],
      user: req.user._id,
    });

    if (shop) {
      res.status(201).json({
        status: 'success',
        data: shop,
      });
    } else {
      res.status(400).json({
        status: 'fail',
        message: 'Invalid shop data',
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get all shops or search shops by name, code, etc. with pagination
// @route   GET /api/shops
// @access  Private
const getShops = async (req, res) => {
  try {
    const { search, page = 1, limit = 10, status, shopType, city } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    let query = {};

    // If search parameter exists, create a search query
    if (search) {
      query = {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { code: { $regex: search, $options: 'i' } },
          { contactPerson: { $regex: search, $options: 'i' } },
          { phoneNumber: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { 'location.address': { $regex: search, $options: 'i' } },
        ],
      };
    }

    // Filter by status if provided
    if (status) {
      query.status = status;
    }

    // Filter by shop type if provided
    if (shopType) {
      query.shopType = shopType;
    }

    // Filter by city if provided
    if (city) {
      query['location.city'] = { $regex: city, $options: 'i' };
    }

    // Count total documents for pagination info
    const totalShops = await Shop.countDocuments(query);

    // Find shops based on query with pagination
    const shops = await Shop.find(query)
      .limit(limitNum)
      .skip(skip)
      .sort({ createdAt: -1 });
    
    res.json({
      status: 'success',
      results: shops.length,
      totalPages: Math.ceil(totalShops / limitNum),
      currentPage: pageNum,
      totalShops,
      data: shops,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get shop by ID
// @route   GET /api/shops/:id
// @access  Private
const getShopById = async (req, res) => {
  try {
    const shop = await Shop.findById(req.params.id);

    if (shop) {
      res.json({
        status: 'success',
        data: shop,
      });
    } else {
      res.status(404).json({
        status: 'fail',
        message: 'Shop not found',
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Update shop by ID
// @route   PUT /api/shops/:id
// @access  Private
const updateShop = async (req, res) => {
  try {
    const shop = await Shop.findById(req.params.id);

    if (shop) {
      // If code is being updated, check if it already exists
      if (req.body.code && req.body.code !== shop.code) {
        const codeExists = await Shop.findOne({ code: req.body.code });
        if (codeExists) {
          return res.status(400).json({
            status: 'fail',
            message: 'Shop with this code already exists',
          });
        }
      }

      shop.name = req.body.name || shop.name;
      shop.code = req.body.code || shop.code;
      
      // Update location if provided
      if (req.body.location) {
        shop.location = {
          ...shop.location,
          ...req.body.location
        };
      }
      
      shop.contactPerson = req.body.contactPerson || shop.contactPerson;
      shop.phoneNumber = req.body.phoneNumber || shop.phoneNumber;
      shop.email = req.body.email || shop.email;
      shop.shopType = req.body.shopType || shop.shopType;
      shop.openingHours = req.body.openingHours || shop.openingHours;
      shop.status = req.body.status || shop.status;

      const updatedShop = await shop.save();

      res.json({
        status: 'success',
        data: updatedShop,
      });
    } else {
      res.status(404).json({
        status: 'fail',
        message: 'Shop not found',
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Delete shop
// @route   DELETE /api/shops/:id
// @access  Private
const deleteShop = async (req, res) => {
  try {
    const shop = await Shop.findById(req.params.id);

    if (shop) {
      await Shop.deleteOne({ _id: req.params.id });
      res.json({
        status: 'success',
        message: 'Shop removed',
      });
    } else {
      res.status(404).json({
        status: 'fail',
        message: 'Shop not found',
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
  createShop,
  getShops,
  getShopById,
  updateShop,
  deleteShop
};