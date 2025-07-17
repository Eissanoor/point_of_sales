const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');

const paymentSchema = new mongoose.Schema(
  {
    paymentNumber: {
      type: String,
      required: true,
      unique: true,
    },
    sale: {
      type: mongoose.Schema.Types.ObjectId,
      required: false, // Changed from true to false to make it optional
      ref: 'Sales',
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      required: true, // Required field to ensure we know which customer made the payment
      ref: 'Customer',
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentMethod: {
      type: String,
      required: true,
      enum: ['cash', 'credit_card', 'debit_card', 'bank_transfer', 'check', 'online_payment', 'mobile_payment', 'other','advance'],
    },
    paymentDate: {
      type: Date,
      default: Date.now,
    },
    transactionId: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'completed', 'failed', 'refunded', 'partially_refunded', 'partial'],
      default: 'completed',
    },
    notes: {
      type: String,
      trim: true,
    },
    attachments: [{
      url: String,
      name: String,
      type: String,
    }],
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    isPartial: {
      type: Boolean,
      default: false,
    },
    isAdvancePayment: {
      type: Boolean,
      default: false,
    },
    currency: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Currency',
    },
  },
  {
    timestamps: true,
  }
);

// Apply the auto-increment plugin
paymentSchema.plugin(autoIncrementPlugin);

// Virtual field to calculate remaining balance for the sale
paymentSchema.virtual('remainingBalance').get(function() {
  // This will be populated when needed by the controller
  return 0;
});

// Create compound indices for faster queries
paymentSchema.index({ sale: 1, paymentDate: -1 });
paymentSchema.index({ customer: 1, paymentDate: -1 }); // Add index for customer queries

const Payment = mongoose.model('Payment', paymentSchema);

module.exports = Payment; 