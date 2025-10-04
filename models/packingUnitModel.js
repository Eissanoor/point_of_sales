const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');

const packingUnitSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please enter packing unit name'],
      trim: true,
    },
    quantityUnit: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, 'Please select a quantity unit'],
      ref: 'QuantityUnit',
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
packingUnitSchema.plugin(autoIncrementPlugin);

// Create compound index to ensure unique packing unit names within each quantity unit
packingUnitSchema.index({ name: 1, quantityUnit: 1 }, { unique: true });

const PackingUnit = mongoose.model('PackingUnit', packingUnitSchema);

module.exports = PackingUnit;
