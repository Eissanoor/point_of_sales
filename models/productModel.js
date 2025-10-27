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
    currencyExchangeRate: {
      type: Number,
      default: 1, // Store the exchange rate at the time of product creation/update
    },

    description: {
      type: String,
      default: '',
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
      default: 0,
    },
    saleRate: {
      type: Number,
      default: 0,
    },
    wholesaleRate: {
      type: Number,
      default: 0,
    },
    retailRate: {
      type: Number,
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

    soldOutQuantity: {
      type: Number,
      default: 0,
    },
    quantityUnit: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'QuantityUnit',
    },
    packingUnit: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PackingUnit',
    },
    pochues: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Pochues',
    },
    pouchesOrPieces: {
      type: Number,
      default: 0,
    },
    countInStock: {
      type: Number,
      default: 0,
    },
    damagedQuantity: {
      type: Number,
      default: 0,
    },
    returnedQuantity: {
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