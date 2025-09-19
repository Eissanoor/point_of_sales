const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');

const miscellaneousExpenseSchema = new mongoose.Schema(
  {
    expenseSubType: {
      type: String,
      required: [true, 'Expense sub-type is required'],
      enum: {
        values: ['marketing', 'entertainment', 'hospitality', 'adjustments', 'unexpected', 'legal', 'consulting'],
        message: 'Invalid expense sub-type'
      }
    },
    marketingCost: {
      type: Number,
      default: 0,
      min: [0, 'Marketing cost cannot be negative']
    },
    promotionCost: {
      type: Number,
      default: 0,
      min: [0, 'Promotion cost cannot be negative']
    },
    entertainmentCost: {
      type: Number,
      default: 0,
      min: [0, 'Entertainment cost cannot be negative']
    },
    hospitalityCost: {
      type: Number,
      default: 0,
      min: [0, 'Hospitality cost cannot be negative']
    },
    unexpectedCosts: {
      type: Number,
      default: 0,
      min: [0, 'Unexpected costs cannot be negative']
    },
    adjustments: {
      type: Number,
      default: 0
    },
    legalFees: {
      type: Number,
      default: 0,
      min: [0, 'Legal fees cannot be negative']
    },
    consultingFees: {
      type: Number,
      default: 0,
      min: [0, 'Consulting fees cannot be negative']
    },
    totalCost: {
      type: Number,
     
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
    paymentMethod: {
      type: String,
      required: [true, 'Payment method is required'],
      enum: {
        values: ['cash', 'bank', 'credit', 'mixed'],
        message: 'Invalid payment method'
      }
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true
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
miscellaneousExpenseSchema.pre('save', function(next) {
  // Calculate total cost from all components
  this.totalCost = (this.marketingCost || 0) + 
                   (this.promotionCost || 0) + 
                   (this.entertainmentCost || 0) + 
                   (this.hospitalityCost || 0) + 
                   (this.unexpectedCosts || 0) + 
                   (this.adjustments || 0) + 
                   (this.legalFees || 0) + 
                   (this.consultingFees || 0);
  
  // Calculate PKR amount
  if (this.totalCost && this.exchangeRate) {
    this.amountInPKR = this.totalCost * this.exchangeRate;
  }
  
  next();
});

// Apply the auto-increment plugin
miscellaneousExpenseSchema.plugin(autoIncrementPlugin);

const MiscellaneousExpense = mongoose.model('MiscellaneousExpense', miscellaneousExpenseSchema);

module.exports = MiscellaneousExpense;
