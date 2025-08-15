const express = require('express');
const router = express.Router();
const {
  createWarehouse,
  getWarehouses,
  getWarehouseById,
  updateWarehouse,
  deleteWarehouse,
} = require('../controllers/warehouseController');
const { protect, admin } = require('../middlewares/authMiddleware');

// All warehouse routes require authentication
router.route('/')
  .post(protect, createWarehouse)
  .get(protect, getWarehouses);

router.route('/:id')
  .get(protect, getWarehouseById)
  .put(protect, updateWarehouse)
  .delete(protect, deleteWarehouse);

module.exports = router;
