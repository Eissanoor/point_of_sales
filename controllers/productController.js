const Product = require('../models/productModel');
const ProductJourney = require('../models/productJourneyModel');
const { uploadImage, deleteImage } = require('../config/cloudinary');

// @desc    Fetch all products
// @route   GET /api/products
// @access  Public
const getProducts = async (req, res) => {
  try {
    const pageSize = 10;
    const page = Number(req.query.page) || 1;
    const showAll = req.query.showAll === 'true';

    let searchQuery = { isActive: true }; // Default to only active products
    
    // If showAll is true and user is admin, show all products (active and inactive)
    if (showAll && req.user && req.user.isAdmin) {
      searchQuery = {};
    }
    
    if (req.query.search) {
      // Get category IDs that match the search term
      const Category = require('../models/categoryModel');
      const categories = await Category.find({
        name: { $regex: req.query.search, $options: 'i' }
      });
      
      const categoryIds = categories.map(cat => cat._id);
      
      // Search by product name OR category ID while maintaining isActive filter
      const searchCondition = {
        $or: [
          { name: { $regex: req.query.search, $options: 'i' } },
          { category: { $in: categoryIds } }
        ]
      };
      
      // Combine search condition with isActive filter
      searchQuery = showAll && req.user && req.user.isAdmin 
        ? searchCondition 
        : { ...searchCondition, isActive: true };
    }

    const count = await Product.countDocuments(searchQuery);
    const products = await Product.find(searchQuery)
      .populate('category', 'name description')
      .limit(pageSize)
      .skip(pageSize * (page - 1));

    res.json({
      status: 'success',
      results: products.length,
      data: products,
      page,
      pages: Math.ceil(count / pageSize),
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Fetch single product
// @route   GET /api/products/:id
// @access  Public
const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate('category', 'name description');

    if (product) {
      res.json({
        status: 'success',
        data: product,
      });
    } else {
      res.status(404).json({
        status: 'fail',
        message: 'Product not found',
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Delete a product
// @route   DELETE /api/products/:id
// @access  Private/Admin
const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (product) {
      // Create product journey record for deletion
      await ProductJourney.create({
        product: product._id,
        user: req.user._id,
        action: 'deleted',
        changes: [{
          field: 'product',
          oldValue: product.name
        }],
        notes: 'Product deleted'
      });
      
      // Delete the product first for quick response
      await Product.deleteOne({ _id: req.params.id });
      
      // Send response immediately
      res.json({
        status: 'success',
        message: 'Product removed',
      });
      
      // Delete image from Cloudinary asynchronously
      if (product.imagePublicId) {
        deleteImage(product.imagePublicId).catch(err => 
          console.error('Error deleting image from Cloudinary:', err)
        );
      }
    } else {
      res.status(404).json({
        status: 'fail',
        message: 'Product not found',
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Create a product
// @route   POST /api/products
// @access  Private/Admin
const createProduct = async (req, res) => {
  try {
    const {
      name,
      price,
      purchaseRate,
      saleRate,
      wholesaleRate,
      retailRate,
      size,
      color,
      barcode,
      availableQuantity,
      soldOutQuantity,
      packingUnit,
      additionalUnit,
      pouchesOrPieces,
      description,
      category,
      countInStock,
      isActive,
    } = req.body;

    // Create product with placeholder image if needed
    const product = new Product({
      name,
      price,
      purchaseRate,
      saleRate,
      wholesaleRate,
      retailRate,
      size,
      color,
      barcode,
      availableQuantity,
      soldOutQuantity,
      packingUnit,
      additionalUnit,
      pouchesOrPieces,
      user: req.user._id,
      image: '',
      imagePublicId: '',
      category,
      countInStock,
      description,
      isActive: isActive !== undefined ? isActive : true,
    });

    const createdProduct = await product.save();
    
    // Create product journey record for creation
    await ProductJourney.create({
      product: createdProduct._id,
      user: req.user._id,
      action: 'created',
      changes: [{
        field: 'product',
        newValue: createdProduct.name
      }],
      notes: 'Product created'
    });
    
    // Send response immediately
    res.status(201).json({
      status: 'success',
      message: 'Product created successfully',
    });

    // Handle image upload to Cloudinary asynchronously
    if (req.file) {
      try {
        // Convert buffer to base64 string for Cloudinary
        const b64 = Buffer.from(req.file.buffer).toString('base64');
        const dataURI = `data:${req.file.mimetype};base64,${b64}`;
        
        const result = await uploadImage(dataURI);
        
        // Update product with image info
        await Product.findByIdAndUpdate(createdProduct._id, {
          image: result.secure_url,
          imagePublicId: result.public_id,
        });
        
        // Create product journey record for image update
        await ProductJourney.create({
          product: createdProduct._id,
          user: req.user._id,
          action: 'updated',
          changes: [{
            field: 'image',
            oldValue: '',
            newValue: result.secure_url
          }],
          notes: 'Updated image'
        });
      } catch (uploadError) {
        console.error('Error uploading image:', uploadError);
      }
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Update a product
// @route   PUT /api/products/:id
// @access  Private/Admin
const updateProduct = async (req, res) => {
  try {
    const {
      name,
      price,
      purchaseRate,
      saleRate,
      wholesaleRate,
      retailRate,
      size,
      color,
      barcode,
      availableQuantity,
      soldOutQuantity,
      packingUnit,
      additionalUnit,
      pouchesOrPieces,
      description,
      category,
      countInStock,
      isActive,
      removeImage,
    } = req.body;

    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        status: 'fail',
        message: 'Product not found',
      });
    }

    // Collect all changes in a single array
    const allChanges = [];
    
    // Track what fields were updated for the notes
    const updatedFields = [];
    
    // Helper function to check if values are actually different
    const hasValueChanged = (oldVal, newVal) => {
      // Handle null/undefined/empty string equivalence
      if ((oldVal === null || oldVal === undefined || oldVal === '') && 
          (newVal === null || newVal === undefined || newVal === '')) {
        return false;
      }
      
      // Handle numeric comparisons - convert string numbers to actual numbers
      const oldNum = typeof oldVal === 'string' ? Number(oldVal) : oldVal;
      const newNum = typeof newVal === 'string' ? Number(newVal) : newVal;
      
      // If both are valid numbers after conversion, compare them numerically
      if (!isNaN(oldNum) && !isNaN(newNum) && 
          (typeof oldNum === 'number' && typeof newNum === 'number')) {
        return oldNum !== newNum;
      }
      
      // For string comparison, trim and compare
      if (typeof oldVal === 'string' && typeof newVal === 'string') {
        return oldVal.trim() !== newVal.trim();
      }
      
      // Default comparison
      return oldVal !== newVal;
    };

    // Check for changes and update product
    if (name !== undefined) {
      if (hasValueChanged(product.name, name)) {
        allChanges.push({
          field: 'name',
          oldValue: product.name,
          newValue: name
        });
        updatedFields.push('name');
      }
      product.name = name;
    }
    
    if (price !== undefined) {
      if (hasValueChanged(product.price, price)) {
        allChanges.push({
          field: 'price',
          oldValue: product.price,
          newValue: price
        });
        updatedFields.push('price');
      }
      product.price = price;
    }
    
    if (purchaseRate !== undefined) {
      if (hasValueChanged(product.purchaseRate, purchaseRate)) {
        allChanges.push({
          field: 'purchaseRate',
          oldValue: product.purchaseRate,
          newValue: purchaseRate
        });
        updatedFields.push('purchase rate');
      }
      product.purchaseRate = purchaseRate;
    }
    
    if (saleRate !== undefined) {
      if (hasValueChanged(product.saleRate, saleRate)) {
        allChanges.push({
          field: 'saleRate',
          oldValue: product.saleRate,
          newValue: saleRate
        });
        updatedFields.push('sale rate');
      }
      product.saleRate = saleRate;
    }
    
    if (wholesaleRate !== undefined) {
      if (hasValueChanged(product.wholesaleRate, wholesaleRate)) {
        allChanges.push({
          field: 'wholesaleRate',
          oldValue: product.wholesaleRate,
          newValue: wholesaleRate
        });
        updatedFields.push('wholesale rate');
      }
      product.wholesaleRate = wholesaleRate;
    }
    
    if (retailRate !== undefined) {
      if (hasValueChanged(product.retailRate, retailRate)) {
        allChanges.push({
          field: 'retailRate',
          oldValue: product.retailRate,
          newValue: retailRate
        });
        updatedFields.push('retail rate');
      }
      product.retailRate = retailRate;
    }
    
    if (size !== undefined) {
      if (hasValueChanged(product.size, size)) {
        allChanges.push({
          field: 'size',
          oldValue: product.size,
          newValue: size
        });
        updatedFields.push('size');
      }
      product.size = size;
    }
    
    if (color !== undefined) {
      if (hasValueChanged(product.color, color)) {
        allChanges.push({
          field: 'color',
          oldValue: product.color,
          newValue: color
        });
        updatedFields.push('color');
      }
      product.color = color;
    }
    
    if (barcode !== undefined) {
      if (hasValueChanged(product.barcode, barcode)) {
        allChanges.push({
          field: 'barcode',
          oldValue: product.barcode,
          newValue: barcode
        });
        updatedFields.push('barcode');
      }
      product.barcode = barcode;
    }
    
    if (availableQuantity !== undefined) {
      if (hasValueChanged(product.availableQuantity, availableQuantity)) {
        allChanges.push({
          field: 'availableQuantity',
          oldValue: product.availableQuantity,
          newValue: availableQuantity
        });
        updatedFields.push('available quantity');
      }
      product.availableQuantity = availableQuantity;
    }
    
    if (soldOutQuantity !== undefined) {
      if (hasValueChanged(product.soldOutQuantity, soldOutQuantity)) {
        allChanges.push({
          field: 'soldOutQuantity',
          oldValue: product.soldOutQuantity,
          newValue: soldOutQuantity
        });
        updatedFields.push('sold out quantity');
      }
      product.soldOutQuantity = soldOutQuantity;
    }
    
    if (packingUnit !== undefined) {
      if (hasValueChanged(product.packingUnit, packingUnit)) {
        allChanges.push({
          field: 'packingUnit',
          oldValue: product.packingUnit,
          newValue: packingUnit
        });
        updatedFields.push('packing unit');
      }
      product.packingUnit = packingUnit;
    }
    
    if (additionalUnit !== undefined) {
      if (hasValueChanged(product.additionalUnit, additionalUnit)) {
        allChanges.push({
          field: 'additionalUnit',
          oldValue: product.additionalUnit,
          newValue: additionalUnit
        });
        updatedFields.push('additional unit');
      }
      product.additionalUnit = additionalUnit;
    }
    
    if (pouchesOrPieces !== undefined) {
      if (hasValueChanged(product.pouchesOrPieces, pouchesOrPieces)) {
        allChanges.push({
          field: 'pouchesOrPieces',
          oldValue: product.pouchesOrPieces,
          newValue: pouchesOrPieces
        });
        updatedFields.push('pouches/pieces');
      }
      product.pouchesOrPieces = pouchesOrPieces;
    }
    
    if (description !== undefined) {
      if (hasValueChanged(product.description, description)) {
        allChanges.push({
          field: 'description',
          oldValue: product.description,
          newValue: description
        });
        updatedFields.push('description');
      }
      product.description = description;
    }
    
    if (category !== undefined && category !== null) {
      if (category.toString() !== product.category.toString()) {
        allChanges.push({
          field: 'category',
          oldValue: product.category,
          newValue: category
        });
        updatedFields.push('category');
      }
      product.category = category;
    }
    
    if (countInStock !== undefined) {
      if (hasValueChanged(product.countInStock, countInStock)) {
        allChanges.push({
          field: 'countInStock',
          oldValue: product.countInStock,
          newValue: countInStock
        });
        updatedFields.push('count in stock');
      }
      product.countInStock = countInStock;
    }
    
    if (isActive !== undefined) {
      // Convert to proper boolean value
      const isActiveBool = isActive === true || isActive === 'true' || isActive === 1;
      
      if (hasValueChanged(product.isActive, isActiveBool)) {
        allChanges.push({
          field: 'isActive',
          oldValue: product.isActive,
          newValue: isActiveBool
        });
        updatedFields.push('active status');
      }
      product.isActive = isActiveBool;
    }
    
    // Save product first for quick response
    await product.save();
    
    // Send response immediately
    res.json({
      status: 'success',
      message: 'Product updated successfully',
    });

    // Handle image operations asynchronously
    const processImage = async () => {
      // Store current image info
      let imageUrl = product.image;
      let imagePublicId = product.imagePublicId;
      let shouldUpdateImage = false;
      let imageChange = null;

      // Handle image removal request
      if (removeImage === 'true' && !req.file) {
        if (product.imagePublicId) {
          try {
            await deleteImage(product.imagePublicId);
          } catch (error) {
            console.error('Error deleting image:', error);
          }
        }
        
        // Prepare image change record
        imageChange = {
          field: 'image',
          oldValue: product.image,
          newValue: ''
        };
        
        imageUrl = '';
        imagePublicId = '';
        shouldUpdateImage = true;
        updatedFields.push('image removed');
      }

      // Handle new image upload
      if (req.file) {
        // Delete old image if exists
        if (product.imagePublicId) {
          try {
            await deleteImage(product.imagePublicId);
          } catch (error) {
            console.error('Error deleting old image:', error);
          }
        }

        try {
          // Upload new image
          const b64 = Buffer.from(req.file.buffer).toString('base64');
          const dataURI = `data:${req.file.mimetype};base64,${b64}`;
          const result = await uploadImage(dataURI);
          
          // Prepare image change record
          imageChange = {
            field: 'image',
            oldValue: product.image,
            newValue: result.secure_url
          };
          
          imageUrl = result.secure_url;
          imagePublicId = result.public_id;
          shouldUpdateImage = true;
          updatedFields.push('image');
        } catch (error) {
          console.error('Error uploading new image:', error);
        }
      }

      // Update product with new image info if needed
      if (shouldUpdateImage) {
        await Product.findByIdAndUpdate(product._id, {
          image: imageUrl,
          imagePublicId: imagePublicId,
        });
        
        // Add image change to allChanges array
        if (imageChange) {
          allChanges.push(imageChange);
        }
      }
      
      // Create a single product journey record for all changes if there are any
      if (allChanges.length > 0) {
        // Create a descriptive note based on what was updated
        const noteText = updatedFields.length > 0 
          ? `Updated: ${updatedFields.join(', ')}`
          : 'Product updated';
          
        // Use the productJourney controller directly
        const ProductJourney = require('../models/productJourneyModel');
        await ProductJourney.create({
          product: product._id,
          user: req.user._id,
          action: 'updated',
          changes: allChanges,
          notes: noteText
        });
      }
    };

    // Process image and create journey record
    processImage().catch(err => 
      console.error('Error processing image or creating journey record:', err)
    );
  } catch (error) {
    return res.status(400).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Create new review
// @route   POST /api/products/:id/reviews
// @access  Private
const createProductReview = async (req, res) => {
  try {
    const { rating, comment } = req.body;

    const product = await Product.findById(req.params.id);

    if (product) {
      const alreadyReviewed = product.reviews.find(
        (r) => r.user.toString() === req.user._id.toString()
      );

      if (alreadyReviewed) {
        return res.status(400).json({
          status: 'fail',
          message: 'Product already reviewed',
        });
      }

      const review = {
        name: req.user.name,
        rating: Number(rating),
        comment,
        user: req.user._id,
      };

      product.reviews.push(review);

      product.numReviews = product.reviews.length;

      product.rating =
        product.reviews.reduce((acc, item) => item.rating + acc, 0) /
        product.reviews.length;

      await product.save();
      res.status(201).json({
        status: 'success',
        message: 'Review added',
      });
    } else {
      res.status(404).json({
        status: 'fail',
        message: 'Product not found',
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get product journey by product ID
// @route   GET /api/products/:id/journey
// @access  Private/Admin
const getProductJourneyByProductId = async (req, res) => {
  try {
    const productId = req.params.id;
    
    // Check if product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        status: 'fail',
        message: 'Product not found',
      });
    }
    
    // Get all journey records for this product, sorted by newest first
    const journeyRecords = await ProductJourney.find({ product: productId })
      .populate('user', 'name email')
      .sort({ createdAt: -1 });
      
    res.json({
      status: 'success',
      results: journeyRecords.length,
      data: journeyRecords,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

module.exports = {
  getProducts,
  getProductById,
  deleteProduct,
  createProduct,
  updateProduct,
  createProductReview,
  getProductJourneyByProductId,
}; 