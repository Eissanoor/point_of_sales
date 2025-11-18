const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');

const productReturnSchema = new mongoose.Schema(
  {
    returnNumber: {
      type: String,
      required: true,
      unique: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Customer',
    },
    originalSale: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Sales',
    },
    products: [{
      product: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'Product',
      },
      quantity: {
        type: Number,
        required: true,
        min: 1,
      },
      originalPrice: {
        type: Number,
        required: true,
      },
      returnReason: {
        type: String,
        required: true,
        enum: [
          'defective_product',
          'wrong_item',
          'damaged_during_shipping',
          'not_as_described',
          'customer_changed_mind',
          'expired_product',
          'quality_issue',
          'other'
        ],
      },
      condition: {
        type: String,
        required: true,
        enum: ['new', 'used', 'damaged', 'defective'],
      },
      refundAmount: {
        type: Number,
        default: 0,
        min: 0,
      },
      restockable: {
        type: Boolean,
        default: true,
      },
    }],
    totalRefundAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Currency',
    },
    returnReason: {
      type: String,
      required: true,
      trim: true,
    },
    customerNotes: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'processed', 'refunded'],
      default: 'pending',
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    warehouse: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse',
    },
    shop: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shop',
    },
    refundMethod: {
      type: String,
      enum: ['cash', 'credit', 'bank_transfer', 'store_credit'],
      default: 'credit',
    },
    refundStatus: {
      type: String,
      enum: ['pending', 'processed', 'completed'],
      default: 'pending',
    },
    images: [{
      url: String,
      publicId: String,
    }],
    adminNotes: {
      type: String,
      default: '',
    },
    processedAt: {
      type: Date,
    },
    refundedAt: {
      type: Date,
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
productReturnSchema.plugin(autoIncrementPlugin);

// Index for better query performance
productReturnSchema.index({ customer: 1, createdAt: -1 });
productReturnSchema.index({ status: 1, createdAt: -1 });
productReturnSchema.index({ returnNumber: 1 });
productReturnSchema.index({ originalSale: 1 });

// Pre-validate middleware to generate return number before required validation runs
productReturnSchema.pre('validate', async function(next) {
  if (this.isNew && !this.returnNumber) {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    
    // Get count of returns for today to generate sequential number
    const returnsCount = await this.constructor.countDocuments({
      createdAt: {
        $gte: new Date(date.setHours(0, 0, 0, 0)),
        $lt: new Date(date.setHours(23, 59, 59, 999)),
      },
    });
    
    this.returnNumber = `RET-${year}${month}${day}-${(returnsCount + 1).toString().padStart(3, '0')}`;
  }
  next();
});

const ProductReturn = mongoose.model('ProductReturn', productReturnSchema);

module.exports = ProductReturn;
