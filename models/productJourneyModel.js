const mongoose = require('mongoose');

const productJourneySchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Product',
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    action: {
      type: String,
      required: true,
      enum: ['created', 'updated', 'deleted'],
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
  },
  {
    timestamps: true,
  }
);

// Pre-save middleware to ensure consistent data types between oldValue and newValue
productJourneySchema.pre('save', function(next) {
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

const ProductJourney = mongoose.model('ProductJourney', productJourneySchema);

module.exports = ProductJourney; 