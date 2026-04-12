const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');
const { generateReferCode } = require('../utils/referCodeGenerator');

const sarafSchema = new mongoose.Schema(
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

sarafSchema.plugin(autoIncrementPlugin);

sarafSchema.pre('save', async function (next) {
  try {
    if (!this.referCode) {
      this.referCode = await generateReferCode('Saraf');
    }
    next();
  } catch (error) {
    return next(error);
  }
});

sarafSchema.index({ name: 1 });
sarafSchema.index({ code: 1 });
sarafSchema.index({ user: 1 });
sarafSchema.index({ referCode: 1 }, { unique: true });

const Saraf = mongoose.model('Saraf', sarafSchema);

module.exports = Saraf;
