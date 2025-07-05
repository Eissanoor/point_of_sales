const express = require('express');
const router = express.Router();
const { 
  createSupplier, 
  getSuppliers, 
  getSupplierById, 
  updateSupplier, 
  deleteSupplier,
  permanentDeleteSupplier 
} = require('../controllers/supplierController');
const { protect, admin } = require('../middlewares/authMiddleware');
const upload = require('../middlewares/uploadMiddleware');

router.route('/')
  .post(protect, upload.single('image'), createSupplier)
  .get(protect, getSuppliers);

router.route('/:id')
  .get(protect, getSupplierById)
  .put(protect, upload.single('image'), updateSupplier)
  .delete(protect, deleteSupplier);

router.route('/:id/permanent')
  .delete(protect, admin, permanentDeleteSupplier);

module.exports = router; 