const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');

const stockTransferSchema = new mongoose.Schema(
  {
    transferNumber: {
      type: String,
      required: true,
      unique: true,
    },
    sourceType: {
      type: String,
      required: true,
      enum: ['warehouse', 'shop'],
      default: 'warehouse',
    },
    sourceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: 'sourceType',
    },
    destinationType: {
      type: String,
      required: true,
      enum: ['warehouse', 'shop'],
      default: 'warehouse',
    },
    destinationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: 'destinationType',
    },
    transferDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    items: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          required: true,
          ref: 'Product',
        },
        quantity: {
          type: Number,
          required: true,
          min: [1, 'Quantity must be at least 1'],
        },
        notes: {
          type: String,
          trim: true,
        },
      },
    ],
    status: {
      type: String,
      required: true,
      enum: ['pending', 'in-transit', 'completed', 'cancelled'],
      default: 'completed',
    },
    notes: {
      type: String,
      trim: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

// Apply the auto-increment plugin
stockTransferSchema.plugin(autoIncrementPlugin);

// Create indices for faster queries
stockTransferSchema.index({ transferNumber: 1 }, { unique: true });
stockTransferSchema.index({ sourceType: 1 });
stockTransferSchema.index({ sourceId: 1 });
stockTransferSchema.index({ destinationType: 1 });
stockTransferSchema.index({ destinationId: 1 });
stockTransferSchema.index({ transferDate: 1 });
stockTransferSchema.index({ status: 1 });
stockTransferSchema.index({ user: 1 });

const StockTransfer = mongoose.model('StockTransfer', stockTransferSchema);

module.exports = StockTransfer;
