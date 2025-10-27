const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');

const productDamageSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Product',
    },
    warehouse: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse',
    },
    shop: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shop',
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    damageType: {
      type: String,
      required: true,
      enum: [
        'transport_damage',
        'handling_damage', 
        'storage_damage',
        'manufacturing_defect',
        'expired',
        'broken',
        'contaminated',
        'other'
      ],
    },
    damageReason: {
      type: String,
      required: true,
      trim: true,
    },
    damageDescription: {
      type: String,
      default: '',
      trim: true,
    },
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    estimatedLoss: {
      type: Number,
      default: 0,
      min: 0,
    },
    currency: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Currency',
    },
    images: [{
      url: String,
      publicId: String,
    }],
    disposalMethod: {
      type: String,
      enum: ['destroy', 'return_to_supplier', 'donate', 'recycle', 'other'],
      default: 'destroy',
    },
    disposalNotes: {
      type: String,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Apply the auto-increment plugin
productDamageSchema.plugin(autoIncrementPlugin);

// Index for better query performance
productDamageSchema.index({ product: 1, createdAt: -1 });
productDamageSchema.index({ status: 1, createdAt: -1 });
productDamageSchema.index({ warehouse: 1, shop: 1 });

const ProductDamage = mongoose.model('ProductDamage', productDamageSchema);

module.exports = ProductDamage;
