const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');
const { generateReferCode } = require('../utils/referCodeGenerator');

const propertyAccountSchema = new mongoose.Schema(
  {
    propertyName: {
      type: String,
      required: true,
      trim: true,
    },
    location: {
      type: String,
      trim: true,
    },
    value: {
      type: Number,
      min: 0,
      default: 0,
    },
    isRented: {
      type: Boolean,
      default: false,
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
propertyAccountSchema.plugin(autoIncrementPlugin);

// Pre-save hook to generate referCode
propertyAccountSchema.pre('save', async function (next) {
  try {
    if (!this.referCode) {
      this.referCode = await generateReferCode('PropertyAccount');
    }
    next();
  } catch (error) {
    return next(error);
  }
});

propertyAccountSchema.index({ propertyName: 1 });
propertyAccountSchema.index({ referCode: 1 }, { unique: true });

const PropertyAccount = mongoose.model('PropertyAccount', propertyAccountSchema);

module.exports = PropertyAccount;

