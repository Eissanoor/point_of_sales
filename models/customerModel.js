const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please enter customer name'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Please enter customer email'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
    },
    phoneNumber: {
      type: String,
      required: [true, 'Please enter phone number'],
      trim: true,
    },
    address: {
      type: String,
      required: [true, 'Please enter customer address'],
      trim: true,
    },
    customerType: {
      type: String,
      enum: ['regular', 'premium', 'vip'],
      default: 'regular',
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

const Customer = mongoose.model('Customer', customerSchema);

module.exports = Customer; 