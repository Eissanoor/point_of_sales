const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');

const financialExpenseSchema = new mongoose.Schema(
  {
    expenseSubType: {
      type: String,
      required: [true, 'Expense sub-type is required'],
      enum: {
        values: ['bank_charges', 'exchange_gain_loss', 'loan_interest', 'finance_charges', 'transaction_fees'],
        message: 'Invalid expense sub-type'
      }
    },
    bankCharges: {
      type: Number,
      default: 0,
      min: [0, 'Bank charges cannot be negative']
    },
    transactionFees: {
      type: Number,
      default: 0,
      min: [0, 'Transaction fees cannot be negative']
    },
    exchangeGainLoss: {
      type: Number,
      default: 0
    },
    loanInterest: {
      type: Number,
      default: 0,
      min: [0, 'Loan interest cannot be negative']
    },
    financeCharges: {
      type: Number,
      default: 0,
      min: [0, 'Finance charges cannot be negative']
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
    linkedBankAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BankAccount'
    },
    transactionReference: {
      type: String,
      trim: true
    },
    loanReference: {
      type: String,
      trim: true
    },
    paymentMethod: {
      type: String,
      required: [true, 'Payment method is required'],
      enum: {
        values: ['cash', 'bank', 'credit', 'mixed'],
        message: 'Invalid payment method'
      }
    },
    transactionDate: {
      type: Date,
      default: Date.now
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
financialExpenseSchema.pre('save', function(next) {
  // Calculate total cost from all components
  this.totalCost = (this.bankCharges || 0) + 
                   (this.transactionFees || 0) + 
                   (this.exchangeGainLoss || 0) + 
                   (this.loanInterest || 0) + 
                   (this.financeCharges || 0);
  
  // Calculate PKR amount
  if (this.totalCost && this.exchangeRate) {
    this.amountInPKR = this.totalCost * this.exchangeRate;
  }
  
  next();
});

// Apply the auto-increment plugin
financialExpenseSchema.plugin(autoIncrementPlugin);

const FinancialExpense = mongoose.model('FinancialExpense', financialExpenseSchema);

module.exports = FinancialExpense;
