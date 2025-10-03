const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');

const purchaseSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, 'Please select a product'],
      ref: 'Product',
    },
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, 'Please select a supplier'],
      ref: 'Supplier',
    },
    warehouse: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, 'Please select a warehouse'],
      ref: 'Warehouse',
    },
    currency: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Currency',
    },
    currencyExchangeRate: {
      type: Number,
      default: 1, // Store the exchange rate at the time of purchase
    },
    quantity: {
      type: Number,
      required: [true, 'Please enter purchase quantity'],
      min: [1, 'Quantity must be at least 1'],
    },
    purchaseRate: {
      type: Number,
      required: [true, 'Please enter purchase rate'],
      min: [0, 'Purchase rate cannot be negative'],
    },
    saleRate: {
      type: Number,
      required: [true, 'Please enter sale rate'],
      min: [0, 'Sale rate cannot be negative'],
    },
    retailRate: {
      type: Number,
      required: [true, 'Please enter retail rate'],
      min: [0, 'Retail rate cannot be negative'],
    },
    wholesaleRate: {
      type: Number,
      required: [true, 'Please enter wholesale rate'],
      min: [0, 'Wholesale rate cannot be negative'],
    },
    purchaseDate: {
      type: Date,
      required: [true, 'Please enter purchase date'],
      default: Date.now,
    },
    totalAmount: {
      type: Number,
      
      min: [0, 'Total amount cannot be negative'],
    },
    invoiceNumber: {
      type: String,
      default: '',
    },
    notes: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'cancelled'],
      default: 'completed',
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

// Calculate total amount before saving
purchaseSchema.pre('save', function(next) {
  if (this.quantity && this.purchaseRate) {
    this.totalAmount = this.quantity * this.purchaseRate;
  }
  next();
});

// Apply the auto-increment plugin
purchaseSchema.plugin(autoIncrementPlugin);

// Index for better query performance
purchaseSchema.index({ product: 1, purchaseDate: -1 });
purchaseSchema.index({ supplier: 1, purchaseDate: -1 });
purchaseSchema.index({ warehouse: 1, purchaseDate: -1 });

const Purchase = mongoose.model('Purchase', purchaseSchema);

module.exports = Purchase;
