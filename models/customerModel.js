const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');
const { generateReferCode } = require('../utils/referCodeGenerator');

const customerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please enter customer name'],
      trim: true,
    },
    email: {
      type: String,
      required: false,
      lowercase: true,
      trim: true,
      default: null,
      // Note: Duplicate emails are allowed - no unique constraint
    },
    phoneNumber: {
      type: String,
      trim: true,
    },
    cnicNumber: {
      type: String,
      trim: true,
    },
    address: {
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
    deliveryAddress: {
      type: String,
      trim: true,
    },
    customerType: {
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
    advanceBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Apply the auto-increment plugin
customerSchema.plugin(autoIncrementPlugin);

// Pre-save hook to generate referCode and handle empty email
customerSchema.pre('save', async function(next) {
  // Convert empty string email to null
  if (this.email === '') {
    this.email = null;
  }
  
  if (!this.referCode) {
    try {
      this.referCode = await generateReferCode('Customer');
    } catch (error) {
      return next(error);
    }
  }
  next();
});

const Customer = mongoose.model('Customer', customerSchema);

module.exports = Customer; 