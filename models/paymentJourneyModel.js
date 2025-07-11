const mongoose = require('mongoose');

const paymentJourneySchema = new mongoose.Schema(
  {
    payment: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Payment',
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    action: {
      type: String,
      required: true,
      enum: ['created', 'updated', 'deleted', 'status_changed', 'refunded', 'partially_refunded'],
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
  },
  {
    timestamps: true,
  }
);

const PaymentJourney = mongoose.model('PaymentJourney', paymentJourneySchema);

module.exports = PaymentJourney; 