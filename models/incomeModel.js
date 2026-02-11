const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');
const { generateReferCode } = require('../utils/referCodeGenerator');

const incomeSchema = new mongoose.Schema(
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
incomeSchema.plugin(autoIncrementPlugin);

// Pre-save hook to generate referCode
incomeSchema.pre('save', async function (next) {
  try {
    if (!this.referCode) {
      this.referCode = await generateReferCode('Income');
    }
    next();
  } catch (error) {
    return next(error);
  }
});

incomeSchema.index({ name: 1 });
incomeSchema.index({ code: 1 });
incomeSchema.index({ user: 1 });
incomeSchema.index({ referCode: 1 }, { unique: true });

const Income = mongoose.model('Income', incomeSchema);

module.exports = Income;

