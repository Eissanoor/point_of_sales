const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');

const transporterSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Transporter name is required'],
      trim: true
    },
    contactPerson: {
      type: String,
      required: [true, 'Contact person is required'],
      trim: true
    },
    phoneNumber: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email address']
    },
    address: {
      type: String,
      required: [true, 'Address is required'],
      trim: true
    },
    city: {
      type: String,
      trim: true
    },
    country: {
      type: String,
      trim: true
    },
    vehicleTypes: [{
      type: String,
      enum: ['truck', 'container', 'van', 'ship', 'plane'],
      message: 'Invalid vehicle type'
    }],
    routes: [{
      origin: {
        type: String,
        required: true,
        trim: true
      },
      destination: {
        type: String,
        required: true,
        trim: true
      },
      estimatedDays: {
        type: Number,
        min: [1, 'Estimated days must be at least 1']
      },
      ratePerKg: {
        type: Number,
        min: [0, 'Rate cannot be negative']
      }
    }],
    commissionRate: {
      type: Number,
      default: 0,
      min: [0, 'Commission rate cannot be negative'],
      max: [100, 'Commission rate cannot exceed 100%']
    },
    paymentTerms: {
      type: String,
      enum: ['advance', 'on_delivery', 'credit_30', 'credit_60'],
      default: 'on_delivery'
    },
    rating: {
      type: Number,
      min: [1, 'Rating must be between 1-5'],
      max: [5, 'Rating must be between 1-5']
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

// Apply the auto-increment plugin
transporterSchema.plugin(autoIncrementPlugin);

const Transporter = mongoose.model('Transporter', transporterSchema);

module.exports = Transporter;
