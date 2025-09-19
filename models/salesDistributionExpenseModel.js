const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');

const salesDistributionExpenseSchema = new mongoose.Schema(
  {
    salesperson: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Salesperson is required']
    },
    salesTeam: {
      type: String,
      trim: true
    },
    commissionAmount: {
      type: Number,
      default: 0,
      min: [0, 'Commission amount cannot be negative']
    },
    commissionRate: {
      type: Number,
      min: [0, 'Commission rate cannot be negative'],
      max: [100, 'Commission rate cannot exceed 100%']
    },
    customerDiscounts: {
      type: Number,
      default: 0,
      min: [0, 'Customer discounts cannot be negative']
    },
    creditLoss: {
      type: Number,
      default: 0,
      min: [0, 'Credit loss cannot be negative']
    },
    badDebts: {
      type: Number,
      default: 0,
      min: [0, 'Bad debts cannot be negative']
    },
    promotionalCost: {
      type: Number,
      default: 0,
      min: [0, 'Promotional cost cannot be negative']
    },
    marketingCost: {
      type: Number,
      default: 0,
      min: [0, 'Marketing cost cannot be negative']
    },
    totalCost: {
      type: Number,
      min: [0, 'Total cost cannot be negative']
    },
    currency: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Currency',
      required: [true, 'Currency is required']
    },
    exchangeRate: {
      type: Number,
      required: [true, 'Exchange rate is required'],
      min: [0, 'Exchange rate cannot be negative']
    },
    amountInPKR: {
      type: Number,
      
    },
    linkedSalesInvoice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Sales'
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer'
    },
    salesAmount: {
      type: Number,
      min: [0, 'Sales amount cannot be negative']
    },
    paymentMethod: {
      type: String,
      required: [true, 'Payment method is required'],
      enum: {
        values: ['cash', 'bank', 'credit', 'mixed'],
        message: 'Invalid payment method'
      }
    },
    expenseType: {
      type: String,
      required: [true, 'Expense type is required'],
      enum: {
        values: ['commission', 'discount', 'credit_loss', 'promotion', 'marketing'],
        message: 'Invalid expense type'
      }
    },
    salesPeriod: {
      startDate: {
        type: Date
      },
      endDate: {
        type: Date
      }
    },
    notes: {
      type: String,
      trim: true
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

// Pre-save middleware to calculate totals
salesDistributionExpenseSchema.pre('save', function(next) {
  // Calculate commission if rate and sales amount are provided
  if (this.commissionRate && this.salesAmount && !this.commissionAmount) {
    this.commissionAmount = (this.salesAmount * this.commissionRate) / 100;
  }
  
  // Calculate total cost from all components
  this.totalCost = (this.commissionAmount || 0) + 
                   (this.customerDiscounts || 0) + 
                   (this.creditLoss || 0) + 
                   (this.badDebts || 0) + 
                   (this.promotionalCost || 0) + 
                   (this.marketingCost || 0);
  
  // Calculate PKR amount
  if (this.totalCost && this.exchangeRate) {
    this.amountInPKR = this.totalCost * this.exchangeRate;
  }
  
  next();
});

// Apply the auto-increment plugin
salesDistributionExpenseSchema.plugin(autoIncrementPlugin);

const SalesDistributionExpense = mongoose.model('SalesDistributionExpense', salesDistributionExpenseSchema);

module.exports = SalesDistributionExpense;
