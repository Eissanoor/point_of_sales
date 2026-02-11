const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');
const { generateReferCode } = require('../utils/referCodeGenerator');

const liabilitySchema = new mongoose.Schema(
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
    next();
  } catch (error) {
    return next(error);
  }
});

liabilitySchema.index({ name: 1 });
liabilitySchema.index({ code: 1 });
liabilitySchema.index({ referCode: 1 }, { unique: true });

const Liability = mongoose.model('Liability', liabilitySchema);

module.exports = Liability;

