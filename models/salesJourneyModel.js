const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');

const salesJourneySchema = new mongoose.Schema(
  {
    sale: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Sales',
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    action: {
      type: String,
      required: true,
      enum: ['created', 'updated', 'payment_updated', 'deleted', 'refunded', 'partially_refunded'],
    },
    changes: [{
      field: {
        type: String,
        required: true,
      },
      oldValue: {
        type: mongoose.Schema.Types.Mixed,
      },
      newValue: {
        type: mongoose.Schema.Types.Mixed,
      }
    }],
    paymentDetails: {
      previousStatus: {
        type: String,
        enum: ['pending', 'partial', 'completed'],
      },
      newStatus: {
        type: String,
        enum: ['pending', 'partial', 'completed'],
      },
      previousAmount: {
        type: Number,
      },
      newAmount: {
        type: Number,
      },
    },
    notes: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Apply the auto-increment plugin
salesJourneySchema.plugin(autoIncrementPlugin);

// Pre-save middleware to ensure consistent data types between oldValue and newValue
salesJourneySchema.pre('save', function(next) {
  if (this.changes && this.changes.length > 0) {
    this.changes.forEach(change => {
      // If both values exist and are different types
      if (change.oldValue !== undefined && change.newValue !== undefined) {
        const oldType = typeof change.oldValue;
        const newType = typeof change.newValue;
        
        // If old value is a number and new value is a string that can be converted to number
        if (oldType === 'number' && newType === 'string' && !isNaN(Number(change.newValue))) {
          change.newValue = Number(change.newValue);
        }
        
        // If new value is a number and old value is a string that can be converted to number
        if (newType === 'number' && oldType === 'string' && !isNaN(Number(change.oldValue))) {
          change.oldValue = Number(change.oldValue);
        }
      }
    });
  }
  next();
});

const SalesJourney = mongoose.model('SalesJourney', salesJourneySchema);

module.exports = SalesJourney; 