const express = require('express');
const router = express.Router();
const {
  createShop,
  getShops,
  getShopById,
  updateShop,
  deleteShop
} = require('../controllers/shopController');
const { protect, admin } = require('../middlewares/authMiddleware');

// All shop routes require authentication
router.route('/')
  .post(protect, createShop)
  .get(protect, getShops);

router.route('/:id')
  .get(protect, getShopById)
  .put(protect, updateShop)
  .delete(protect, deleteShop);

module.exports = router;
