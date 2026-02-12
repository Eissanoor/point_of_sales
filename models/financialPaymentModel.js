const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');
const { generateReferCode } = require('../utils/referCodeGenerator');

const financialPaymentSchema = new mongoose.Schema(
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
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    method: {
      type: String,
      enum: ['cash', 'bank_transfer', 'check', 'online', 'other'],
      default: 'cash',
    },
    relatedModel: {
      type: String,
      enum: [
        'Asset',
        'Income',
        'Liability',
        'PartnershipAccount',
        'CashBook',
        'Capital',
        'Owner',
        'Employee',
        'PropertyAccount',
      ],
      default: null,
    },
    relatedId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'relatedModel',
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
financialPaymentSchema.plugin(autoIncrementPlugin);

// Pre-save hook to generate referCode
financialPaymentSchema.pre('save', async function (next) {
  try {
    if (!this.referCode) {
      this.referCode = await generateReferCode('FinancialPayment');
    }
    if (!this.paymentDate) {
      this.paymentDate = new Date();
    }
    next();
  } catch (error) {
    return next(error);
  }
});

// Create indices for better query performance
financialPaymentSchema.index({ paymentDate: -1 });
financialPaymentSchema.index({ relatedModel: 1, relatedId: 1 });
financialPaymentSchema.index({ user: 1 });
financialPaymentSchema.index({ referCode: 1 }, { unique: true });

const FinancialPayment = mongoose.model(
  'FinancialPayment',
  financialPaymentSchema
);

module.exports = FinancialPayment;

