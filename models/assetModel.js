const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');
const { generateReferCode } = require('../utils/referCodeGenerator');

const assetSchema = new mongoose.Schema(
  {
    purchaseDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    assetType: {
      type: String,
      required: true,
      enum: ['fixed', 'current', 'intangible', 'other'],
      default: 'fixed',
    },
    value: {
      type: Number,
      required: true,
      min: 0,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
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
assetSchema.plugin(autoIncrementPlugin);

// Pre-save hook to generate referCode
assetSchema.pre('save', async function (next) {
  try {
    // Generate referCode if not provided
    if (!this.referCode) {
      this.referCode = await generateReferCode('Asset');
    }

    // Set purchaseDate if not provided
    if (!this.purchaseDate) {
      this.purchaseDate = new Date();
    }

    next();
  } catch (error) {
    return next(error);
  }
});

// Create indices for better query performance
assetSchema.index({ purchaseDate: -1 });
assetSchema.index({ assetType: 1 });
assetSchema.index({ user: 1 });
assetSchema.index({ referCode: 1 }, { unique: true });

const Asset = mongoose.model('Asset', assetSchema);

module.exports = Asset;

