const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');

const quantityUnitSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please enter quantity unit name'],
      trim: true,
      unique: true,
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
quantityUnitSchema.plugin(autoIncrementPlugin);

const QuantityUnit = mongoose.model('QuantityUnit', quantityUnitSchema);

module.exports = QuantityUnit;
