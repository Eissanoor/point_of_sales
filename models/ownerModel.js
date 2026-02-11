const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');
const { generateReferCode } = require('../utils/referCodeGenerator');

const ownerSchema = new mongoose.Schema(
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
ownerSchema.plugin(autoIncrementPlugin);

// Pre-save hook to generate referCode
ownerSchema.pre('save', async function (next) {
  try {
    if (!this.referCode) {
      this.referCode = await generateReferCode('Owner');
    }
    next();
  } catch (error) {
    return next(error);
  }
});

ownerSchema.index({ name: 1 });
ownerSchema.index({ code: 1 });
ownerSchema.index({ referCode: 1 }, { unique: true });

const Owner = mongoose.model('Owner', ownerSchema);

module.exports = Owner;
