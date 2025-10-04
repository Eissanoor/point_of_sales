const express = require('express');
const router = express.Router();
const {
  getPochues,
  getPochuesById,
  createPochues,
  updatePochues,
  deletePochues,
  getPochuesByPackingUnit,
} = require('../controllers/pochuesController');
const { protect, admin } = require('../middlewares/authMiddleware');

// Public routes
router.route('/')
  .get(getPochues)
  .post(protect, admin, createPochues);

router.route('/:id')
  .get(getPochuesById)
  .put(protect, admin, updatePochues)
  .delete(protect, admin, deletePochues);

// Get pochues by packing unit
router.route('/packing-unit/:packingUnitId')
  .get(getPochuesByPackingUnit);

module.exports = router;
