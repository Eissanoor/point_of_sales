const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');

const currencySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please enter currency name'],
      trim: true,
      unique: true,
    },
    code: {
      type: String,
      trim: true,
      unique: true,
      sparse: true, // This allows null values to not trigger unique constraint
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

// Apply the auto-increment plugin
currencySchema.plugin(autoIncrementPlugin);

const Currency = mongoose.model('Currency', currencySchema);

module.exports = Currency; 