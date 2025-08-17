const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');

const reviewSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    name: {
      type: String,
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const productSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    name: {
      type: String,
      required: [true, 'Please enter product name'],
      trim: true,
    },
    image: {
      type: String,
      default: '',
    },
    imagePublicId: {
      type: String,
      default: '',
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, 'Please enter product category'],
      ref: 'Category',
    },
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
    },
    warehouse: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse',
    },
    currency: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Currency',
    },
    location: {
      type: String,
      default: '',
    },
    description: {
      type: String,
      required: [true, 'Please enter product description'],
    },
    reviews: [reviewSchema],
    rating: {
      type: Number,
      required: true,
      default: 0,
    },
    numReviews: {
      type: Number,
      required: true,
      default: 0,
    },
  
    purchaseRate: {
      type: Number,
      required: [true, 'Please enter product purchase rate'],
      default: 0,
    },
    saleRate: {
      type: Number,
      required: [true, 'Please enter product sale rate'],
      default: 0,
    },
    wholesaleRate: {
      type: Number,
      required: [true, 'Please enter product wholesale rate'],
      default: 0,
    },
    retailRate: {
      type: Number,
      required: [true, 'Please enter product retail rate'],
      default: 0,
    },
    size: {
      type: String,
      default: '',
    },
    color: {
      type: String,
      default: '',
    },
    barcode: {
      type: String,
      default: '',
    },
    availableQuantity: {
      type: Number,
      default: 0,
    },
    soldOutQuantity: {
      type: Number,
      default: 0,
    },
    packingUnit: {
      type: String,
      default: '',
    },
    additionalUnit: {
      type: String,
      default: '',
    },
    pouchesOrPieces: {
      type: Number,
      default: 0,
    },
    countInStock: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Apply the auto-increment plugin
productSchema.plugin(autoIncrementPlugin);

const Product = mongoose.model('Product', productSchema);

module.exports = Product; 