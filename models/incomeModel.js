const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');
const { generateReferCode } = require('../utils/referCodeGenerator');

const incomeSchema = new mongoose.Schema(
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
    sourceType: {
      type: String,
      enum: ['sale', 'service', 'investment', 'other'],
      default: 'other',
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
incomeSchema.plugin(autoIncrementPlugin);

// Pre-save hook to generate referCode
incomeSchema.pre('save', async function (next) {
  try {
    if (!this.referCode) {
      this.referCode = await generateReferCode('Income');
    }
    if (!this.date) {
      this.date = new Date();
    }
    next();
  } catch (error) {
    return next(error);
  }
});

incomeSchema.index({ date: -1 });
incomeSchema.index({ sourceType: 1 });
incomeSchema.index({ user: 1 });
incomeSchema.index({ referCode: 1 }, { unique: true });

const Income = mongoose.model('Income', incomeSchema);

module.exports = Income;

