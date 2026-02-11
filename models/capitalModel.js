const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');
const { generateReferCode } = require('../utils/referCodeGenerator');

const capitalSchema = new mongoose.Schema(
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
capitalSchema.plugin(autoIncrementPlugin);

// Pre-save hook to generate referCode
capitalSchema.pre('save', async function (next) {
  try {
    // Generate referCode if not provided
    if (!this.referCode) {
      this.referCode = await generateReferCode('Capital');
    }

    next();
  } catch (error) {
    return next(error);
  }
});

// Create indices for better query performance
capitalSchema.index({ name: 1 });
capitalSchema.index({ code: 1 });
capitalSchema.index({ user: 1 });
capitalSchema.index({ referCode: 1 }, { unique: true });

const Capital = mongoose.model('Capital', capitalSchema);

module.exports = Capital;

