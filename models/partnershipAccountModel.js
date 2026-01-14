const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');
const { generateReferCode } = require('../utils/referCodeGenerator');

const partnershipAccountSchema = new mongoose.Schema(
  {
    partnerName: {
      type: String,
      required: true,
      trim: true,
    },
    phoneNumber: {
      type: String,
      trim: true,
    },
    sharePercentage: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    openingBalance: {
      type: Number,
      min: 0,
      default: 0,
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
partnershipAccountSchema.plugin(autoIncrementPlugin);

// Pre-save hook to generate referCode
partnershipAccountSchema.pre('save', async function (next) {
  try {
    if (!this.referCode) {
      this.referCode = await generateReferCode('PartnershipAccount');
    }
    next();
  } catch (error) {
    return next(error);
  }
});

partnershipAccountSchema.index({ partnerName: 1 });
partnershipAccountSchema.index({ referCode: 1 }, { unique: true });

const PartnershipAccount = mongoose.model(
  'PartnershipAccount',
  partnershipAccountSchema
);

module.exports = PartnershipAccount;

