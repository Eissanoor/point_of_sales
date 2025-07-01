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

    let searchQuery = {};
    
    if (req.query.search) {
      // Get category IDs that match the search term
      const Category = require('../models/categoryModel');
      const categories = await Category.find({
        name: { $regex: req.query.search, $options: 'i' }
      });
      
      const categoryIds = categories.map(cat => cat._id);
      
      // Search by product name OR category ID
      searchQuery = {
        $or: [
          { name: { $regex: req.query.search, $options: 'i' } },
          { category: { $in: categoryIds } }
        ]
      };
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
      removeImage,
    } = req.body;

    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        status: 'fail',
        message: 'Product not found',
      });
    }

    // Track changes for individual updates
    const journeyPromises = [];
    
    // Check for changes and create individual journey records
    if (name && name !== product.name) {
      journeyPromises.push(
        ProductJourney.create({
          product: product._id,
          user: req.user._id,
          action: 'updated',
          changes: [{
            field: 'name',
            oldValue: product.name,
            newValue: name
          }],
          notes: `Updated name`
        })
      );
      product.name = name;
    }
    
    if (price && price !== product.price) {
      journeyPromises.push(
        ProductJourney.create({
          product: product._id,
          user: req.user._id,
          action: 'updated',
          changes: [{
            field: 'price',
            oldValue: product.price,
            newValue: price
          }],
          notes: `Updated price`
        })
      );
      product.price = price;
    }
    
    if (purchaseRate && purchaseRate !== product.purchaseRate) {
      journeyPromises.push(
        ProductJourney.create({
          product: product._id,
          user: req.user._id,
          action: 'updated',
          changes: [{
            field: 'purchaseRate',
            oldValue: product.purchaseRate,
            newValue: purchaseRate
          }],
          notes: `Updated purchase rate`
        })
      );
      product.purchaseRate = purchaseRate;
    }
    
    if (saleRate && saleRate !== product.saleRate) {
      journeyPromises.push(
        ProductJourney.create({
          product: product._id,
          user: req.user._id,
          action: 'updated',
          changes: [{
            field: 'saleRate',
            oldValue: product.saleRate,
            newValue: saleRate
          }],
          notes: `Updated sale rate`
        })
      );
      product.saleRate = saleRate;
    }
    
    if (wholesaleRate && wholesaleRate !== product.wholesaleRate) {
      journeyPromises.push(
        ProductJourney.create({
          product: product._id,
          user: req.user._id,
          action: 'updated',
          changes: [{
            field: 'wholesaleRate',
            oldValue: product.wholesaleRate,
            newValue: wholesaleRate
          }],
          notes: `Updated wholesale rate`
        })
      );
      product.wholesaleRate = wholesaleRate;
    }
    
    if (retailRate && retailRate !== product.retailRate) {
      journeyPromises.push(
        ProductJourney.create({
          product: product._id,
          user: req.user._id,
          action: 'updated',
          changes: [{
            field: 'retailRate',
            oldValue: product.retailRate,
            newValue: retailRate
          }],
          notes: `Updated retail rate`
        })
      );
      product.retailRate = retailRate;
    }
    
    if (size !== undefined && size !== product.size) {
      journeyPromises.push(
        ProductJourney.create({
          product: product._id,
          user: req.user._id,
          action: 'updated',
          changes: [{
            field: 'size',
            oldValue: product.size,
            newValue: size
          }],
          notes: `Updated size`
        })
      );
      product.size = size;
    }
    
    if (color !== undefined && color !== product.color) {
      journeyPromises.push(
        ProductJourney.create({
          product: product._id,
          user: req.user._id,
          action: 'updated',
          changes: [{
            field: 'color',
            oldValue: product.color,
            newValue: color
          }],
          notes: `Updated color`
        })
      );
      product.color = color;
    }
    
    if (barcode !== undefined && barcode !== product.barcode) {
      journeyPromises.push(
        ProductJourney.create({
          product: product._id,
          user: req.user._id,
          action: 'updated',
          changes: [{
            field: 'barcode',
            oldValue: product.barcode,
            newValue: barcode
          }],
          notes: `Updated barcode`
        })
      );
      product.barcode = barcode;
    }
    
    if (availableQuantity !== undefined && availableQuantity !== product.availableQuantity) {
      journeyPromises.push(
        ProductJourney.create({
          product: product._id,
          user: req.user._id,
          action: 'updated',
          changes: [{
            field: 'availableQuantity',
            oldValue: product.availableQuantity,
            newValue: availableQuantity
          }],
          notes: `Updated available quantity`
        })
      );
      product.availableQuantity = availableQuantity;
    }
    
    if (soldOutQuantity !== undefined && soldOutQuantity !== product.soldOutQuantity) {
      journeyPromises.push(
        ProductJourney.create({
          product: product._id,
          user: req.user._id,
          action: 'updated',
          changes: [{
            field: 'soldOutQuantity',
            oldValue: product.soldOutQuantity,
            newValue: soldOutQuantity
          }],
          notes: `Updated sold out quantity`
        })
      );
      product.soldOutQuantity = soldOutQuantity;
    }
    
    if (packingUnit !== undefined && packingUnit !== product.packingUnit) {
      journeyPromises.push(
        ProductJourney.create({
          product: product._id,
          user: req.user._id,
          action: 'updated',
          changes: [{
            field: 'packingUnit',
            oldValue: product.packingUnit,
            newValue: packingUnit
          }],
          notes: `Updated packing unit`
        })
      );
      product.packingUnit = packingUnit;
    }
    
    if (additionalUnit !== undefined && additionalUnit !== product.additionalUnit) {
      journeyPromises.push(
        ProductJourney.create({
          product: product._id,
          user: req.user._id,
          action: 'updated',
          changes: [{
            field: 'additionalUnit',
            oldValue: product.additionalUnit,
            newValue: additionalUnit
          }],
          notes: `Updated additional unit`
        })
      );
      product.additionalUnit = additionalUnit;
    }
    
    if (pouchesOrPieces !== undefined && pouchesOrPieces !== product.pouchesOrPieces) {
      journeyPromises.push(
        ProductJourney.create({
          product: product._id,
          user: req.user._id,
          action: 'updated',
          changes: [{
            field: 'pouchesOrPieces',
            oldValue: product.pouchesOrPieces,
            newValue: pouchesOrPieces
          }],
          notes: `Updated pouches/pieces`
        })
      );
      product.pouchesOrPieces = pouchesOrPieces;
    }
    
    if (description && description !== product.description) {
      journeyPromises.push(
        ProductJourney.create({
          product: product._id,
          user: req.user._id,
          action: 'updated',
          changes: [{
            field: 'description',
            oldValue: product.description,
            newValue: description
          }],
          notes: `Updated description`
        })
      );
      product.description = description;
    }
    
    if (category && category.toString() !== product.category.toString()) {
      journeyPromises.push(
        ProductJourney.create({
          product: product._id,
          user: req.user._id,
          action: 'updated',
          changes: [{
            field: 'category',
            oldValue: product.category,
            newValue: category
          }],
          notes: `Updated category`
        })
      );
      product.category = category;
    }
    
    if (countInStock && countInStock !== product.countInStock) {
      journeyPromises.push(
        ProductJourney.create({
          product: product._id,
          user: req.user._id,
          action: 'updated',
          changes: [{
            field: 'countInStock',
            oldValue: product.countInStock,
            newValue: countInStock
          }],
          notes: `Updated count in stock`
        })
      );
      product.countInStock = countInStock;
    }
    
    // Save product first for quick response
    await product.save();
    
    // Process all journey records asynchronously
    Promise.all(journeyPromises).catch(err => 
      console.error('Error creating journey records:', err)
    );
    
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

      // Handle image removal request
      if (removeImage === 'true' && !req.file) {
        if (product.imagePublicId) {
          try {
            await deleteImage(product.imagePublicId);
          } catch (error) {
            console.error('Error deleting image:', error);
          }
        }
        
        // Record image removal in ProductJourney
        await ProductJourney.create({
          product: product._id,
          user: req.user._id,
          action: 'updated',
          changes: [{
            field: 'image',
            oldValue: product.image,
            newValue: ''
          }],
          notes: 'Updated image'
        });
        
        imageUrl = '';
        imagePublicId = '';
        shouldUpdateImage = true;
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
          
          // Record image update in ProductJourney
          await ProductJourney.create({
            product: product._id,
            user: req.user._id,
            action: 'updated',
            changes: [{
              field: 'image',
              oldValue: product.image,
              newValue: result.secure_url
            }],
            notes: 'Updated image'
          });
          
          imageUrl = result.secure_url;
          imagePublicId = result.public_id;
          shouldUpdateImage = true;
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
      }
    };

    // Process image asynchronously
    if (req.file || removeImage === 'true') {
      processImage().catch(err => 
        console.error('Error processing image:', err)
      );
    }
  } catch (error) {
    res.status(500).json({
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