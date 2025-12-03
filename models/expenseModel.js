const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');
const { generateReferCode } = require('../utils/referCodeGenerator');

const expenseSchema = new mongoose.Schema(
  {
    expenseType: {
      type: String,
      required: [true, 'Expense type is required'],
      enum: {
        values: ['procurement', 'logistics', 'warehouse', 'sales_distribution', 'financial', 'operational', 'miscellaneous'],
        message: 'Invalid expense type'
      }
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, 'Reference ID is required'],
      refPath: 'expenseType'
    },
    totalAmount: {
      type: Number,
     
      min: [0, 'Amount cannot be negative']
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
    status: {
      type: String,
      default: 'pending',
      enum: {
        values: ['pending', 'approved', 'paid', 'cancelled'],
        message: 'Invalid status'
      }
    },
    expenseDate: {
      type: Date,
      required: [true, 'Expense date is required'],
      default: Date.now
    },
    description: {
      type: String,
      trim: true
    },
    notes: {
      type: String,
      trim: true
    },
    attachments: [{
      fileName: String,
      fileUrl: String,
      fileType: String,
      uploadDate: {
        type: Date,
        default: Date.now
      }
    }],
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    approvedDate: {
      type: Date
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Created by is required']
    },
    isActive: {
      type: Boolean,
      default: true
    },
    referCode: {
      type: String,
      unique: true,
      trim: true
    }
  },
  {
    timestamps: true
  }
);

// Pre-save middleware to calculate PKR amount and generate referCode
expenseSchema.pre('save', async function(next) {
  try {
    // Generate referCode if not provided
    if (!this.referCode) {
      this.referCode = await generateReferCode('Expense');
    }
    
    // Calculate PKR amount
    if (this.totalAmount && this.exchangeRate) {
      this.amountInPKR = this.totalAmount * this.exchangeRate;
    }
    next();
  } catch (error) {
    next(error);
  }
});

// Apply the auto-increment plugin
expenseSchema.plugin(autoIncrementPlugin);

const Expense = mongoose.model('Expense', expenseSchema);

module.exports = Expense;
