const Supplier = require('../models/supplierModel');
const asyncHandler = require('express-async-handler');
const { uploadImage, deleteImage, getPublicIdFromUrl } = require('../config/cloudinary');

// @desc    Create a new supplier
// @route   POST /api/suppliers
// @access  Private
const createSupplier = asyncHandler(async (req, res) => {
  const { name, email, phoneNumber, cnicNumber, manager, country, state, city, address, deliveryAddress } = req.body;

  const supplierExists = await Supplier.findOne({ name });
  if (supplierExists) {
    res.status(400);
    throw new Error('Supplier with this name already exists');
  }

  // Handle image upload if file is provided
  let imageUrl = '';
  if (req.file) {
    // Convert buffer to base64 string for Cloudinary
    const fileString = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    const uploadResult = await uploadImage(fileString);
    imageUrl = uploadResult.secure_url;
  }

  const supplier = await Supplier.create({
    name,
    email: email || undefined,
    phoneNumber,
    cnicNumber,
    manager,
    country,
    state,
    city,
    image: imageUrl,
    address,
    deliveryAddress,
    isActive: true,
  });

  if (supplier) {
    res.status(201).json(supplier);
  } else {
    res.status(400);
    throw new Error('Invalid supplier data');
  }
});

// @desc    Get all suppliers
// @route   GET /api/suppliers
// @access  Private
const getSuppliers = asyncHandler(async (req, res) => {
  const suppliers = await Supplier.find({});
  res.status(200).json(suppliers);
});

// @desc    Get supplier by ID
// @route   GET /api/suppliers/:id
// @access  Private
const getSupplierById = asyncHandler(async (req, res) => {
  const supplier = await Supplier.findById(req.params.id);

  if (supplier) {
    res.status(200).json(supplier);
  } else {
    res.status(404);
    throw new Error('Supplier not found');
  }
});

// @desc    Update supplier
// @route   PUT /api/suppliers/:id
// @access  Private
const updateSupplier = asyncHandler(async (req, res) => {
  const supplier = await Supplier.findById(req.params.id);

  if (supplier) {
    // Check if email is being updated and if it already exists
    if (req.body.email && req.body.email !== supplier.email) {
      const emailExists = await Supplier.findOne({ email: req.body.email });
      if (emailExists) {
        res.status(400);
        throw new Error('Supplier with this email already exists');
      }
    }

    // Handle image upload if file is provided
    let imageUrl = supplier.image;
    if (req.file) {
      // Delete previous image if exists
      if (supplier.image) {
        const publicId = getPublicIdFromUrl(supplier.image);
        if (publicId) {
          await deleteImage(publicId);
        }
      }
      
      // Upload new image
      const fileString = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
      const uploadResult = await uploadImage(fileString);
      imageUrl = uploadResult.secure_url;
    }

    supplier.name = req.body.name || supplier.name;
    supplier.email = req.body.email !== undefined ? (req.body.email || null) : supplier.email;
    supplier.phoneNumber = req.body.phoneNumber || supplier.phoneNumber;
    supplier.cnicNumber = req.body.cnicNumber || supplier.cnicNumber;
    supplier.manager = req.body.manager || supplier.manager;
    supplier.country = req.body.country || supplier.country;
    supplier.state = req.body.state || supplier.state;
    supplier.city = req.body.city || supplier.city;
    supplier.image = imageUrl;
    supplier.address = req.body.address || supplier.address;
    supplier.deliveryAddress = req.body.deliveryAddress || supplier.deliveryAddress;
    supplier.isActive = req.body.isActive !== undefined ? req.body.isActive : supplier.isActive;

    const updatedSupplier = await supplier.save();
    res.status(200).json(updatedSupplier);
  } else {
    res.status(404);
    throw new Error('Supplier not found');
  }
});

// @desc    Delete supplier
// @route   DELETE /api/suppliers/:id
// @access  Private
const deleteSupplier = asyncHandler(async (req, res) => {
  const supplier = await Supplier.findById(req.params.id);

  if (supplier) {
    // Delete image from Cloudinary if exists
    if (supplier.image) {
      const publicId = getPublicIdFromUrl(supplier.image);
      if (publicId) {
        await deleteImage(publicId);
      }
    }
    
    // Instead of deleting, set isActive to false
    supplier.isActive = false;
    await supplier.save();
    res.status(200).json({ message: 'Supplier deactivated' });
  } else {
    res.status(404);
    throw new Error('Supplier not found');
  }
});

// @desc    Permanently delete supplier
// @route   DELETE /api/suppliers/:id/permanent
// @access  Private/Admin
const permanentDeleteSupplier = asyncHandler(async (req, res) => {
  const supplier = await Supplier.findById(req.params.id);

  if (supplier) {
    // Delete image from Cloudinary if exists
    if (supplier.image) {
      const publicId = getPublicIdFromUrl(supplier.image);
      if (publicId) {
        await deleteImage(publicId);
      }
    }
    
    await supplier.deleteOne();
    res.status(200).json({ message: 'Supplier removed permanently' });
  } else {
    res.status(404);
    throw new Error('Supplier not found');
  }
});

module.exports = {
  createSupplier,
  getSuppliers,
  getSupplierById,
  updateSupplier,
  deleteSupplier,
  permanentDeleteSupplier,
}; 