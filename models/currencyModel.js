const mongoose = require('mongoose');

const currencySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please enter currency name'],
      trim: true,
      unique: true,
    },
    symbol: {
      type: String,
      required: [true, 'Please enter currency symbol'],
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

const Currency = mongoose.model('Currency', currencySchema);

module.exports = Currency; 