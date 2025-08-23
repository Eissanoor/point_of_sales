const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');

const shopSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    location: {
      address: {
        type: String,
        required: true,
        trim: true,
      },
      country: {
        type: String,
        trim: true,
      },
      state: {
        type: String,
        trim: true,
      },
      city: {
        type: String,
        trim: true,
      },
      zipCode: {
        type: String,
        trim: true,
      },
      coordinates: {
        latitude: {
          type: Number,
        },
        longitude: {
          type: Number,
        },
      },
    },
    contactPerson: {
      type: String,
      trim: true,
    },
    phoneNumber: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    shopType: {
      type: String,
      enum: ['retail', 'wholesale', 'both'],
      default: 'retail',
    },
    openingHours: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['active', 'inactive', 'maintenance'],
      default: 'active',
    },
    inventory: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Product',
        },
        quantity: {
          type: Number,
          default: 0,
        },
        minimumStockLevel: {
          type: Number,
          default: 5,
        },
      },
    ],
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

// Apply the auto-increment plugin
shopSchema.plugin(autoIncrementPlugin);

// Create indices for faster queries
shopSchema.index({ name: 1 });
shopSchema.index({ code: 1 }, { unique: true });
shopSchema.index({ status: 1 });
shopSchema.index({ 'location.city': 1 });
shopSchema.index({ shopType: 1 });

const Shop = mongoose.model('Shop', shopSchema);

module.exports = Shop;
