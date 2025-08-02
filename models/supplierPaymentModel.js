const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');

const supplierPaymentSchema = new mongoose.Schema(
  {
    paymentNumber: {
      type: String,
      required: true,
      unique: true,
    },
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Supplier',
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentMethod: {
      type: String,
      required: true,
      enum: ['cash', 'credit_card', 'debit_card', 'bank_transfer', 'check', 'online_payment', 'mobile_payment', 'other'],
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
    currency: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Currency',
    },
    products: [{
      product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
      },
      quantity: {
        type: Number,
        default: 0
      },
      amount: {
        type: Number,
        default: 0
      }
    }]
  },
  {
    timestamps: true,
  }
);

// Apply the auto-increment plugin
supplierPaymentSchema.plugin(autoIncrementPlugin);

// Create compound indices for faster queries
supplierPaymentSchema.index({ supplier: 1, paymentDate: -1 });

const SupplierPayment = mongoose.model('SupplierPayment', supplierPaymentSchema);

module.exports = SupplierPayment; 