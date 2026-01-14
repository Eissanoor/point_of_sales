const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const {
  getAssets,
  getAssetById,
  createAsset,
  updateAsset,
  deleteAsset,
} = require('../controllers/assetController');

// @route   GET /api/assets
// @desc    Get all assets
// @access  Private
router.route('/').get(protect, getAssets);

// @route   POST /api/assets
// @desc    Create new asset
// @access  Private
router.route('/').post(protect, createAsset);

// @route   GET /api/assets/:id
// @desc    Get asset by ID
// @access  Private
router.route('/:id').get(protect, getAssetById);

// @route   PUT /api/assets/:id
// @desc    Update asset
// @access  Private
router.route('/:id').put(protect, updateAsset);

// @route   DELETE /api/assets/:id
// @desc    Delete asset
// @access  Private
router.route('/:id').delete(protect, deleteAsset);

module.exports = router;

