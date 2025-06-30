const Product = require('../models/productModel');
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

    // Update basic product info
    product.name = name || product.name;
    product.price = price || product.price;
    product.purchaseRate = purchaseRate || product.purchaseRate;
    product.saleRate = saleRate || product.saleRate;
    product.wholesaleRate = wholesaleRate || product.wholesaleRate;
    product.retailRate = retailRate || product.retailRate;
    product.size = size !== undefined ? size : product.size;
    product.color = color !== undefined ? color : product.color;
    product.barcode = barcode !== undefined ? barcode : product.barcode;
    product.availableQuantity = availableQuantity !== undefined ? availableQuantity : product.availableQuantity;
    product.soldOutQuantity = soldOutQuantity !== undefined ? soldOutQuantity : product.soldOutQuantity;
    product.packingUnit = packingUnit !== undefined ? packingUnit : product.packingUnit;
    product.additionalUnit = additionalUnit !== undefined ? additionalUnit : product.additionalUnit;
    product.pouchesOrPieces = pouchesOrPieces !== undefined ? pouchesOrPieces : product.pouchesOrPieces;
    product.description = description || product.description;
    product.category = category || product.category;
    product.countInStock = countInStock || product.countInStock;
    
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

      // Handle image removal request
      if (removeImage === 'true' && !req.file) {
        if (product.imagePublicId) {
          try {
            await deleteImage(product.imagePublicId);
          } catch (error) {
            console.error('Error deleting image:', error);
          }
        }
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