const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');

const supplierJourneySchema = new mongoose.Schema(
  {
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Supplier',
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    action: {
      type: String,
      required: true,
      enum: ['created', 'updated', 'product_added', 'product_updated', 'payment_made', 'payment_updated'],
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
    },
    payment: {
      amount: {
        type: Number,
      },
      method: {
        type: String,
        enum: ['cash', 'credit_card', 'debit_card', 'bank_transfer', 'check', 'online_payment', 'mobile_payment', 'other'],
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
    notes: {
      type: String,
    },
    // Running totals captured at the moment of this journey entry
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

// Apply the auto-increment plugin
supplierJourneySchema.plugin(autoIncrementPlugin);

// Pre-save middleware to ensure consistent data types between oldValue and newValue
supplierJourneySchema.pre('save', function(next) {
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

const SupplierJourney = mongoose.model('SupplierJourney', supplierJourneySchema);

module.exports = SupplierJourney; 