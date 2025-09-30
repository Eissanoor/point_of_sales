const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');

const salesItemSchema = new mongoose.Schema(
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
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    price: {
      type: Number,
      required: true,
    },
    discount: {
      type: Number,
      default: 0,
    },
    total: {
      type: Number,
      required: true,
    },
  },
  {
    _id: true,
  }
);

const salesSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Customer',
    },
    items: [salesItemSchema],
    shop: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shop',
    },
    warehouse: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Warehouse',
    },
    totalAmount: {
      type: Number,
      required: true,
    },
    discount: {
      type: Number,
      default: 0,
    },
    tax: {
      type: Number,
      default: 0,
    },
    grandTotal: {
      type: Number,
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ['unpaid', 'partially_paid', 'paid', 'overdue'],
      default: 'unpaid',
    },
    dueDate: {
      type: Date,
      default: function() {
        const date = new Date();
        date.setDate(date.getDate() + 30); // Default 30 days due date
        return date;
      },
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
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
salesSchema.plugin(autoIncrementPlugin);

const Sales = mongoose.model('Sales', salesSchema);

module.exports = Sales; 