const express = require('express');
const router = express.Router();
const {
  getQuantityUnits,
  getQuantityUnitById,
  createQuantityUnit,
  updateQuantityUnit,
  deleteQuantityUnit,
} = require('../controllers/quantityUnitController');
const { protect, admin } = require('../middlewares/authMiddleware');

// Public routes
router.route('/')
  .get(getQuantityUnits)
  .post(protect, admin, createQuantityUnit);

router.route('/:id')
  .get(getQuantityUnitById)
  .put(protect, admin, updateQuantityUnit)
  .delete(protect, admin, deleteQuantityUnit);

module.exports = router;
