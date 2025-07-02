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
    
    // Check for changes and update product
    if (name !== undefined && name !== product.name) {
      allChanges.push({
        field: 'name',
        oldValue: product.name,
        newValue: name
      });
      product.name = name;
      updatedFields.push('name');
    }
    
    if (price !== undefined && price !== product.price) {
      allChanges.push({
        field: 'price',
        oldValue: product.price,
        newValue: price
      });
      product.price = price;
      updatedFields.push('price');
    }
    
    if (purchaseRate !== undefined && purchaseRate !== product.purchaseRate) {
      allChanges.push({
        field: 'purchaseRate',
        oldValue: product.purchaseRate,
        newValue: purchaseRate
      });
      product.purchaseRate = purchaseRate;
      updatedFields.push('purchase rate');
    }
    
    if (saleRate !== undefined && saleRate !== product.saleRate) {
      allChanges.push({
        field: 'saleRate',
        oldValue: product.saleRate,
        newValue: saleRate
      });
      product.saleRate = saleRate;
      updatedFields.push('sale rate');
    }
    
    if (wholesaleRate !== undefined && wholesaleRate !== product.wholesaleRate) {
      allChanges.push({
        field: 'wholesaleRate',
        oldValue: product.wholesaleRate,
        newValue: wholesaleRate
      });
      product.wholesaleRate = wholesaleRate;
      updatedFields.push('wholesale rate');
    }
    
    if (retailRate !== undefined && retailRate !== product.retailRate) {
      allChanges.push({
        field: 'retailRate',
        oldValue: product.retailRate,
        newValue: retailRate
      });
      product.retailRate = retailRate;
      updatedFields.push('retail rate');
    }
    
    if (size !== undefined && size !== product.size) {
      allChanges.push({
        field: 'size',
        oldValue: product.size,
        newValue: size
      });
      product.size = size;
      updatedFields.push('size');
    }
    
    if (color !== undefined && color !== product.color) {
      allChanges.push({
        field: 'color',
        oldValue: product.color,
        newValue: color
      });
      product.color = color;
      updatedFields.push('color');
    }
    
    if (barcode !== undefined && barcode !== product.barcode) {
      allChanges.push({
        field: 'barcode',
        oldValue: product.barcode,
        newValue: barcode
      });
      product.barcode = barcode;
      updatedFields.push('barcode');
    }
    
    if (availableQuantity !== undefined && availableQuantity !== product.availableQuantity) {
      allChanges.push({
        field: 'availableQuantity',
        oldValue: product.availableQuantity,
        newValue: availableQuantity
      });
      product.availableQuantity = availableQuantity;
      updatedFields.push('available quantity');
    }
    
    if (soldOutQuantity !== undefined && soldOutQuantity !== product.soldOutQuantity) {
      allChanges.push({
        field: 'soldOutQuantity',
        oldValue: product.soldOutQuantity,
        newValue: soldOutQuantity
      });
      product.soldOutQuantity = soldOutQuantity;
      updatedFields.push('sold out quantity');
    }
    
    if (packingUnit !== undefined && packingUnit !== product.packingUnit) {
      allChanges.push({
        field: 'packingUnit',
        oldValue: product.packingUnit,
        newValue: packingUnit
      });
      product.packingUnit = packingUnit;
      updatedFields.push('packing unit');
    }
    
    if (additionalUnit !== undefined && additionalUnit !== product.additionalUnit) {
      allChanges.push({
        field: 'additionalUnit',
        oldValue: product.additionalUnit,
        newValue: additionalUnit
      });
      product.additionalUnit = additionalUnit;
      updatedFields.push('additional unit');
    }
    
    if (pouchesOrPieces !== undefined && pouchesOrPieces !== product.pouchesOrPieces) {
      allChanges.push({
        field: 'pouchesOrPieces',
        oldValue: product.pouchesOrPieces,
        newValue: pouchesOrPieces
      });
      product.pouchesOrPieces = pouchesOrPieces;
      updatedFields.push('pouches/pieces');
    }
    
    if (description !== undefined && description !== product.description) {
      allChanges.push({
        field: 'description',
        oldValue: product.description,
        newValue: description
      });
      product.description = description;
      updatedFields.push('description');
    }
    
    if (category !== undefined && category !== null && category.toString() !== product.category.toString()) {
      allChanges.push({
        field: 'category',
        oldValue: product.category,
        newValue: category
      });
      product.category = category;
      updatedFields.push('category');
    }
    
    if (countInStock !== undefined && countInStock !== product.countInStock) {
      allChanges.push({
        field: 'countInStock',
        oldValue: product.countInStock,
        newValue: countInStock
      });
      product.countInStock = countInStock;
      updatedFields.push('count in stock');
    }
    
    if (isActive !== undefined) {
      // Convert to proper boolean value
      const isActiveBool = isActive === true || isActive === 'true' || isActive === 1;
      
      if (isActiveBool !== product.isActive) {
        allChanges.push({
          field: 'isActive',
          oldValue: product.isActive,
          newValue: isActiveBool
        });
        product.isActive = isActiveBool;
        updatedFields.push('active status');
      }
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

module.exports = {
  getProducts,
  getProductById,
  deleteProduct,
  createProduct,
  updateProduct,
  createProductReview,
}; 