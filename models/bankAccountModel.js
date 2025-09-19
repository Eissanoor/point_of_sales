const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');

const bankAccountSchema = new mongoose.Schema(
  {
    accountName: {
      type: String,
      required: [true, 'Account name is required'],
      trim: true
    },
    accountNumber: {
      type: String,
      required: [true, 'Account number is required'],
      unique: true,
      trim: true
    },
    bankName: {
      type: String,
      required: [true, 'Bank name is required'],
      trim: true
    },
    branchName: {
      type: String,
      trim: true
    },
    branchCode: {
      type: String,
      trim: true
    },
    accountType: {
      type: String,
      required: [true, 'Account type is required'],
      enum: {
        values: ['current', 'savings', 'business', 'foreign_currency'],
        message: 'Invalid account type'
      }
    },
    currency: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Currency',
      required: [true, 'Currency is required']
    },
    balance: {
      type: Number,
      default: 0
    },
    openingBalance: {
      type: Number,
      default: 0
    },
    swiftCode: {
      type: String,
      trim: true
    },
    iban: {
      type: String,
      trim: true
    },
    contactPerson: {
      type: String,
      trim: true
    },
    contactNumber: {
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

// Apply the auto-increment plugin
bankAccountSchema.plugin(autoIncrementPlugin);

const BankAccount = mongoose.model('BankAccount', bankAccountSchema);

module.exports = BankAccount;
