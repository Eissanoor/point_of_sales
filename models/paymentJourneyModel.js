const mongoose = require('mongoose');

const paymentJourneySchema = new mongoose.Schema(
  {
    payment: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Payment',
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    action: {
      type: String,
      required: true,
      enum: ['created', 'updated', 'deleted', 'status_changed', 'refunded', 'partially_refunded', 'payment_made', 'payment_updated'],
    },
    paymentDetails: {
      amount: {
        type: Number,
      },
      method: {
        type: String,
        enum: ['cash', 'credit_card', 'debit_card', 'bank_transfer', 'check', 'online_payment', 'mobile_payment', 'other', 'advance', 'advance_adjustment'],
      },
      date: {
        type: Date,
        default: Date.now,
      },
      status: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'refunded', 'partially_refunded', 'partial'],
      },
      transactionId: {
        type: String,
      }
    },
    changes: [
      {
        field: String,
        oldValue: mongoose.Schema.Types.Mixed,
        newValue: mongoose.Schema.Types.Mixed,
      },
    ],
    notes: {
      type: String,
    },
    // Running totals captured at the moment of this journey entry (like SupplierJourney)
    paidAmount: {
      type: Number,
      default: 0
    },
    remainingBalance: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true,
  }
);

const PaymentJourney = mongoose.model('PaymentJourney', paymentJourneySchema);

module.exports = PaymentJourney; 