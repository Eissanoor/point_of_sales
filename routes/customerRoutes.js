const express = require('express');
const router = express.Router();
const {
  createCustomer,
  getCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
} = require('../controllers/customerController');
const { protect, admin } = require('../middlewares/authMiddleware');

// All customer routes require authentication
router.route('/')
  .post(protect, createCustomer)
  .get(protect, getCustomers);

router.route('/:id')
  .get(protect, getCustomerById)
  .put(protect, updateCustomer)
  .delete(protect, deleteCustomer);

module.exports = router; 