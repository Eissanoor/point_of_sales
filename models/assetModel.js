const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');
const { generateReferCode } = require('../utils/referCodeGenerator');

const assetSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    mobileNo: {
      type: String,
      trim: true,
    },
    code: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
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
    if (!this.referCode) {
      this.referCode = await generateReferCode('Asset');
    }
    next();
  } catch (error) {
    return next(error);
  }
});

// Create indices for better query performance
assetSchema.index({ name: 1 });
assetSchema.index({ code: 1 });
assetSchema.index({ user: 1 });
assetSchema.index({ referCode: 1 }, { unique: true });

const Asset = mongoose.model('Asset', assetSchema);

module.exports = Asset;

