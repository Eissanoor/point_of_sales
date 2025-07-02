const asyncHandler = require('express-async-handler');
const ProductJourney = require('../models/productJourneyModel');

// @desc    Get all product journey records
// @route   GET /api/productjourney
// @access  Private/Admin
const getProductJourneys = asyncHandler(async (req, res) => {
  const productJourneys = await ProductJourney.find({})
    .populate('product', 'name')
    .populate('user', 'name');
  
  res.json(productJourneys);
});

// @desc    Get product journey records for a specific product
// @route   GET /api/productjourney/:productId
// @access  Private/Admin
const getProductJourneyByProductId = asyncHandler(async (req, res) => {
  const productJourneys = await ProductJourney.find({ product: req.params.productId })
    .populate('product', 'name')
    .populate('user', 'name')
    .sort({ createdAt: -1 });
  
  if (productJourneys) {
    res.json(productJourneys);
  } else {
    res.status(404);
    throw new Error('No journey records found for this product');
  }
});

// @desc    Create new product journey record
// @route   POST /api/productjourney
// @access  Private/Admin
const createProductJourney = asyncHandler(async (req, res) => {
  const { product, action, changes, notes } = req.body;

  if (!changes || !Array.isArray(changes) || changes.length === 0) {
    res.status(400);
    throw new Error('At least one change must be provided');
  }

  // Filter out changes where oldValue and newValue are the same
  const filteredChanges = changes.filter(change => {
    // Handle different data types (string vs number)
    let oldValue = change.oldValue;
    let newValue = change.newValue;
    
    // Convert to same type if needed
    if (oldValue !== undefined && newValue !== undefined) {
      if (typeof oldValue === 'number' && typeof newValue === 'string') {
        newValue = Number(newValue);
      } else if (typeof newValue === 'number' && typeof oldValue === 'string') {
        oldValue = Number(oldValue);
      }
      
      // Compare the values
      return oldValue !== newValue;
    }
    
    return true; // Keep changes where one value is undefined
  });

  // If no changes remain after filtering, don't create a record
  if (filteredChanges.length === 0) {
    return res.status(200).json({
      message: 'No actual changes detected, journey record not created'
    });
  }

  const productJourney = await ProductJourney.create({
    product,
    user: req.user._id,
    action,
    changes: filteredChanges,
    notes,
  });

  if (productJourney) {
    res.status(201).json(productJourney);
  } else {
    res.status(400);
    throw new Error('Invalid product journey data');
  }
});

module.exports = {
  getProductJourneys,
  getProductJourneyByProductId,
  createProductJourney,
}; 