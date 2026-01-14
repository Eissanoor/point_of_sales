const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');
const { generateReferCode } = require('../utils/referCodeGenerator');

const liabilitySchema = new mongoose.Schema(
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
    liabilityType: {
      type: String,
      enum: ['loan', 'payable', 'tax', 'other'],
      default: 'other',
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
liabilitySchema.plugin(autoIncrementPlugin);

// Pre-save hook to generate referCode
liabilitySchema.pre('save', async function (next) {
  try {
    if (!this.referCode) {
      this.referCode = await generateReferCode('Liability');
    }
    if (!this.date) {
      this.date = new Date();
    }
    next();
  } catch (error) {
    return next(error);
  }
});

liabilitySchema.index({ date: -1 });
liabilitySchema.index({ liabilityType: 1 });
liabilitySchema.index({ referCode: 1 }, { unique: true });

const Liability = mongoose.model('Liability', liabilitySchema);

module.exports = Liability;

