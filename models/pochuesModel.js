const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');

const pochuesSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please enter pochues name'],
      trim: true,
    },
    packingUnit: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, 'Please select a packing unit'],
      ref: 'PackingUnit',
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
pochuesSchema.plugin(autoIncrementPlugin);

// Create compound index to ensure unique pochues names within each packing unit
pochuesSchema.index({ name: 1, packingUnit: 1 }, { unique: true });

const Pochues = mongoose.model('Pochues', pochuesSchema);

module.exports = Pochues;
