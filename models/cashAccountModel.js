const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');
const { generateReferCode } = require('../utils/referCodeGenerator');

const cashAccountSchema = new mongoose.Schema(
  {
    accountName: {
      type: String,
      required: [true, 'Account name is required'],
      trim: true,
    },
    code: {
      type: String,
      trim: true,
    },
    currency: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Currency',
    },
    balance: {
      type: Number,
      default: 0,
    },
    openingBalance: {
      type: Number,
      default: 0,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
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

cashAccountSchema.plugin(autoIncrementPlugin);

cashAccountSchema.pre('save', async function (next) {
  if (!this.referCode) {
    try {
      this.referCode = await generateReferCode('CashAccount');
    } catch (error) {
      return next(error);
    }
  }
  next();
});

cashAccountSchema.index({ referCode: 1 }, { unique: true });

const CashAccount = mongoose.model('CashAccount', cashAccountSchema);

module.exports = CashAccount;
