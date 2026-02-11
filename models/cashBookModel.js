const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');
const { generateReferCode } = require('../utils/referCodeGenerator');

const cashBookSchema = new mongoose.Schema(
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
cashBookSchema.plugin(autoIncrementPlugin);

// Pre-save hook to generate referCode
cashBookSchema.pre('save', async function(next) {
  try {
    // Generate referCode if not provided
    if (!this.referCode) {
      this.referCode = await generateReferCode('CashBook');
    }

    next();
  } catch (error) {
    return next(error);
  }
});

// Create indices for better query performance
cashBookSchema.index({ name: 1 });
cashBookSchema.index({ code: 1 });
cashBookSchema.index({ user: 1 });
cashBookSchema.index({ referCode: 1 }, { unique: true });

const CashBook = mongoose.model('CashBook', cashBookSchema);

module.exports = CashBook;
