const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const {
  getOwners,
  getOwnerById,
  createOwner,
  updateOwner,
  deleteOwner,
} = require('../controllers/ownerController');

// @route   GET /api/owners
// @desc    Get all owners
// @access  Private
router.route('/').get(protect, getOwners);

// @route   POST /api/owners
// @desc    Create new owner
// @access  Private
router.route('/').post(protect, createOwner);

// @route   GET /api/owners/:id
// @desc    Get owner by ID
// @access  Private
router.route('/:id').get(protect, getOwnerById);

// @route   PUT /api/owners/:id
// @desc    Update owner
// @access  Private
router.route('/:id').put(protect, updateOwner);

// @route   DELETE /api/owners/:id
// @desc    Delete owner
// @access  Private
router.route('/:id').delete(protect, deleteOwner);

module.exports = router;
