const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');
const { generateReferCode } = require('../utils/referCodeGenerator');

const supplierSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Supplier name is required'],
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email address'],
    },
    phoneNumber: {
      type: String,
    
      trim: true,
    },
    cnicNumber: {
      type: String,
      trim: true,
    },
    manager: {
      type: String,
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
    image: {
      type: String,
      default: '',
    },
    address: {
      type: String,
      trim: true,
    },
    deliveryAddress: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    referCode: {
      type: String,
      unique: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Apply the auto-increment plugin
supplierSchema.plugin(autoIncrementPlugin);

// Pre-save hook to generate referCode
supplierSchema.pre('save', async function(next) {
  if (!this.referCode) {
    try {
      this.referCode = await generateReferCode('Supplier');
    } catch (error) {
      return next(error);
    }
  }
  next();
});

const Supplier = mongoose.model('Supplier', supplierSchema);

module.exports = Supplier; 