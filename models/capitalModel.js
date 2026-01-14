const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');
const { generateReferCode } = require('../utils/referCodeGenerator');

const capitalSchema = new mongoose.Schema(
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
      enum: ['investment', 'withdraw'],
      default: 'investment',
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
capitalSchema.index({ date: -1 });
capitalSchema.index({ type: 1 });
capitalSchema.index({ user: 1 });
capitalSchema.index({ referCode: 1 }, { unique: true });

const Capital = mongoose.model('Capital', capitalSchema);

module.exports = Capital;

