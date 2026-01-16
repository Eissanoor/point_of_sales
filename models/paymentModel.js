const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');

const paymentSchema = new mongoose.Schema(
  {
    paymentNumber: {
      type: String,
      required: true,
      unique: true,
    },
    paymentType: {
      type: String,
      required: true,
      enum: ['sale_payment', 'purchase_payment', 'advance_payment', 'refund', 'adjustment', 'other'],
      default: 'sale_payment',
    },
    // For customer payments (sales)
    sale: {
      type: mongoose.Schema.Types.ObjectId,
      required: false,
      ref: 'Sales',
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      required: false, // Now optional since we can have supplier payments
      ref: 'Customer',
    },
    // For supplier payments (purchases)
    purchase: {
      type: mongoose.Schema.Types.ObjectId,
      required: false,
      ref: 'Purchase',
    },
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      required: false, // Optional since we can have customer payments
      ref: 'Supplier',
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    // Support for multiple payment methods
    payments: [{
      method: {
        type: String,
        required: true,
        enum: ['cash', 'credit_card', 'debit_card', 'advance_adjustment', 'bank_transfer', 'check', 'online_payment', 'mobile_payment', 'other', 'advance'],
      },
      amount: {
        type: Number,
        required: true,
        min: 0,
      },
      bankAccount: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'BankAccount',
        default: null,
      },
    }],
    // Keep paymentMethod for backward compatibility (deprecated)
    paymentMethod: {
      type: String,
      required: false,
      enum: ['cash', 'credit_card', 'debit_card', 'advance_adjustment','bank_transfer', 'check', 'online_payment', 'mobile_payment', 'other','advance'],
    },
    // Keep bankAccount for backward compatibility (deprecated)
    bankAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BankAccount',
      default: null,
    },
    paymentDate: {
      type: Date,
      default: Date.now,
    },
    transactionId: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'completed', 'failed', 'refunded', 'partially_refunded', 'partial'],
      default: 'completed',
    },
    notes: {
      type: String,
      trim: true,
    },
    attachments: [{
      url: String,
      name: String,
      type: String,
    }],
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    isPartial: {
      type: Boolean,
      default: false,
    },
    isAdvancePayment: {
      type: Boolean,
      default: false,
    },
    currency: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Currency',
    },
    currencyExchangeRate: {
      type: Number,
      default: 1,
    },
    // Running balance for tracking
    runningBalance: {
      type: Number,
      default: 0,
    },
    // Reference to original transaction
    referenceNumber: {
      type: String,
      trim: true,
    },
    // Bank details if applicable
    bankDetails: {
      bankName: String,
      accountNumber: String,
      routingNumber: String,
      checkNumber: String,
    },
    // For tracking payment allocation
    allocatedAmount: {
      type: Number,
      default: 0,
    },
    // For tracking refunds
    refundAmount: {
      type: Number,
      default: 0,
    },
    refundDate: {
      type: Date,
    },
    refundReason: {
      type: String,
    },
    // Additional metadata
    metadata: {
      source: String, // Where the payment came from (pos, online, etc.)
      deviceInfo: String,
      ipAddress: String,
      userAgent: String,
    }
  },
  {
    timestamps: true,
  }
);

// Apply the auto-increment plugin
paymentSchema.plugin(autoIncrementPlugin);

// Virtual field to calculate remaining balance for the sale
paymentSchema.virtual('remainingBalance').get(function() {
  // This will be populated when needed by the controller
  return 0;
});

// Virtual for payment type display
paymentSchema.virtual('paymentTypeDisplay').get(function() {
  const types = {
    'sale_payment': 'Sale Payment',
    'purchase_payment': 'Purchase Payment',
    'advance_payment': 'Advance Payment',
    'refund': 'Refund',
    'adjustment': 'Adjustment',
    'other': 'Other'
  };
  return types[this.paymentType] || 'Unknown';
});

// Pre-save middleware to generate payment number and normalize payments
paymentSchema.pre('save', async function(next) {
  // Validate that either customer or supplier is provided
  if (!this.customer && !this.supplier) {
    return next(new Error('Either customer or supplier must be provided'));
  }
  
  // Validate that either sale or purchase is provided (or it's an advance payment)
  if (!this.sale && !this.purchase && !this.isAdvancePayment) {
    return next(new Error('Either sale, purchase, or isAdvancePayment must be provided'));
  }
  
  // Set paymentType based on context if not explicitly set
  if (!this.paymentType || this.paymentType === 'sale_payment') {
    if (this.purchase) {
      this.paymentType = 'purchase_payment';
    } else if (this.sale) {
      this.paymentType = 'sale_payment';
    } else if (this.isAdvancePayment) {
      this.paymentType = 'advance_payment';
    }
  }
  
  // Normalize payments array from single paymentMethod (backward compatibility)
  if (!this.payments || this.payments.length === 0) {
    if (this.paymentMethod) {
      this.payments = [{
        method: this.paymentMethod,
        amount: this.amount,
        bankAccount: this.bankAccount || null
      }];
    }
  } else {
    // Calculate total amount from payments array
    this.amount = this.payments.reduce((sum, payment) => sum + (payment.amount || 0), 0);
    
    // Set legacy fields for backward compatibility
    if (this.payments.length > 0) {
      this.paymentMethod = this.payments[0].method;
      this.bankAccount = this.payments.find(p => p.bankAccount)?.bankAccount || null;
    }
  }

  // Generate payment number if not provided
  if (this.isNew && !this.paymentNumber) {
    const count = await this.constructor.countDocuments();
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    
    // Get count of payments for today
    const paymentsCount = await this.constructor.countDocuments({
      createdAt: {
        $gte: new Date(date.setHours(0, 0, 0, 0)),
        $lt: new Date(date.setHours(23, 59, 59, 999)),
      },
    });
    
    this.paymentNumber = `PAY-${year}${month}${day}-${(paymentsCount + 1).toString().padStart(3, '0')}`;
  }
  next();
});

// Create compound indices for faster queries
paymentSchema.index({ sale: 1, paymentDate: -1 });
paymentSchema.index({ purchase: 1, paymentDate: -1 });
paymentSchema.index({ customer: 1, paymentDate: -1 });
paymentSchema.index({ supplier: 1, paymentDate: -1 });
paymentSchema.index({ paymentType: 1, paymentDate: -1 });
paymentSchema.index({ status: 1, paymentDate: -1 });
paymentSchema.index({ paymentMethod: 1, paymentDate: -1 });
paymentSchema.index({ user: 1, paymentDate: -1 });
paymentSchema.index({ paymentNumber: 1 }, { unique: true });
paymentSchema.index({ transactionId: 1 });
paymentSchema.index({ 'bankDetails.checkNumber': 1 });
// Index for advance payments
paymentSchema.index({ isAdvancePayment: 1, customer: 1, supplier: 1 });

const Payment = mongoose.model('Payment', paymentSchema);

module.exports = Payment; 