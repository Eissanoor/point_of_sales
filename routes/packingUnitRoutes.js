const express = require('express');
const router = express.Router();
const {
  getPackingUnits,
  getPackingUnitById,
  createPackingUnit,
  updatePackingUnit,
  deletePackingUnit,
  getPackingUnitsByQuantityUnit,
} = require('../controllers/packingUnitController');
const { protect, admin } = require('../middlewares/authMiddleware');

// Public routes
router.route('/')
  .get(getPackingUnits)
  .post(protect, admin, createPackingUnit);

router.route('/:id')
  .get(getPackingUnitById)
  .put(protect, admin, updatePackingUnit)
  .delete(protect, admin, deletePackingUnit);

// Get packing units by quantity unit
router.route('/quantity-unit/:quantityUnitId')
  .get(getPackingUnitsByQuantityUnit);

module.exports = router;
