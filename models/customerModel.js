const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');

const customerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please enter customer name'],
      trim: true,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
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
  },
  {
    timestamps: true,
  }
);

// Apply the auto-increment plugin
customerSchema.plugin(autoIncrementPlugin);

const Customer = mongoose.model('Customer', customerSchema);

module.exports = Customer; 