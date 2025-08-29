const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');

const exchangeRateHistorySchema = new mongoose.Schema(
  {
    currency: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Currency',
    },
    previousRate: {
      type: Number,
      required: true,
    },
    newRate: {
      type: Number,
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    effectiveDate: {
      type: Date,
      default: Date.now,
    },
    notes: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

// Apply the auto-increment plugin
exchangeRateHistorySchema.plugin(autoIncrementPlugin);

const ExchangeRateHistory = mongoose.model('ExchangeRateHistory', exchangeRateHistorySchema);

module.exports = ExchangeRateHistory;
