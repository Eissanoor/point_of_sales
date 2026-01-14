const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');
const { generateReferCode } = require('../utils/referCodeGenerator');

const cashBookSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: true,
      default: Date.now,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    type: {
      type: String,
      required: true,
      enum: ['debit', 'credit'],
      default: 'debit',
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

    // Set date if not provided
    if (!this.date) {
      this.date = new Date();
    }

    next();
  } catch (error) {
    return next(error);
  }
});

// Create indices for better query performance
cashBookSchema.index({ date: -1 });
cashBookSchema.index({ type: 1 });
cashBookSchema.index({ user: 1 });
cashBookSchema.index({ referCode: 1 }, { unique: true });

const CashBook = mongoose.model('CashBook', cashBookSchema);

module.exports = CashBook;
