const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');
const { generateReferCode } = require('../utils/referCodeGenerator');

// Reconciliation Entry Schema - for matching transactions
const reconciliationEntrySchema = new mongoose.Schema({
  // Bank statement transaction details
  statementDate: {
    type: Date,
    required: true,
  },
  statementDescription: {
    type: String,
    trim: true,
  },
  statementAmount: {
    type: Number,
    required: true,
  },
  statementType: {
    type: String,
    enum: ['debit', 'credit'],
    required: true,
  },
  statementReference: {
    type: String,
    trim: true,
  },
  // Matched accounting transaction
  matchedTransaction: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'matchedTransactionModel',
  },
  matchedTransactionModel: {
    type: String,
    enum: ['BankPaymentVoucher', 'CashPaymentVoucher', 'JournalPaymentVoucher', 'Payment', 'SupplierPayment', null],
  },
  matchedTransactionNumber: {
    type: String,
    trim: true,
  },
  // Reconciliation status
  status: {
    type: String,
    enum: ['matched', 'unmatched', 'adjusted'],
    default: 'unmatched',
  },
  // Adjustment details if needed
  adjustment: {
    type: {
      type: String,
      enum: ['bank_charge', 'interest', 'error', 'other'],
    },
    amount: Number,
    description: String,
  },
  notes: {
    type: String,
    trim: true,
  },
}, { _id: true });

const reconcileBankAccountsVoucherSchema = new mongoose.Schema(
  {
    voucherNumber: {
      type: String,
      required: false,
      unique: true,
    },
    voucherDate: {
      type: Date,
      required: false,
      default: Date.now,
    },
    bankAccount: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'BankAccount',
    },
    // Bank statement details
    statementDate: {
      type: Date,
      required: true,
    },
    statementNumber: {
      type: String,
      trim: true,
    },
    // Opening and closing balances
    openingBalance: {
      type: Number,
      required: true,
      default: 0,
    },
    closingBalance: {
      type: Number,
      required: true,
      default: 0,
    },
    // Calculated balances
    bookBalance: {
      type: Number,
      default: 0,
    },
    statementBalance: {
      type: Number,
      default: 0,
    },
    // Reconciliation entries
    entries: {
      type: [reconciliationEntrySchema],
      default: [],
    },
    // Outstanding items (not yet cleared)
    outstandingDeposits: {
      type: Number,
      default: 0,
    },
    outstandingWithdrawals: {
      type: Number,
      default: 0,
    },
    outstandingChecks: {
      type: Number,
      default: 0,
    },
    // Differences and adjustments
    bankCharges: {
      type: Number,
      default: 0,
    },
    interestEarned: {
      type: Number,
      default: 0,
    },
    errors: {
      type: Number,
      default: 0,
    },
    adjustedBalance: {
      type: Number,
      default: 0,
    },
    difference: {
      type: Number,
      default: 0,
    },
    // Reconciliation status
    reconciliationStatus: {
      type: String,
      enum: ['pending', 'in_progress', 'reconciled', 'discrepancy', 'cancelled'],
      default: 'pending',
    },
    reconciledAt: {
      type: Date,
    },
    reconciledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    currency: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Currency',
    },
    currencyExchangeRate: {
      type: Number,
      default: 1,
    },
    referenceNumber: {
      type: String,
      trim: true,
    },
    transactionId: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
    },
    description: {
      type: String,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['draft', 'pending', 'approved', 'completed', 'cancelled', 'rejected'],
      default: 'draft',
    },
    approvalStatus: {
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      approvedAt: {
        type: Date,
      },
      rejectionReason: {
        type: String,
        trim: true,
      },
    },
    attachments: {
      type: [{
        url: {
          type: String,
          default: ''
        },
        name: {
          type: String,
          default: ''
        },
        type: {
          type: String,
          default: ''
        }
      }],
      default: [],
      validate: {
        validator: function(v) {
          if (!Array.isArray(v)) return false;
          return v.every(att => {
            if (!att) return false;
            if (Array.isArray(att)) return false;
            const isObject = typeof att === 'object';
            const hasStructure = att.url !== undefined || att.name !== undefined || att.type !== undefined;
            return isObject && hasStructure;
          });
        },
        message: 'Attachments must be an array of objects'
      }
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
    referCode: {
      type: String,
      unique: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Apply the auto-increment plugin
reconcileBankAccountsVoucherSchema.plugin(autoIncrementPlugin);

// Pre-save hook to normalize attachments and generate referCode
reconcileBankAccountsVoucherSchema.pre('save', async function(next) {
  try {
    // Normalize attachments if they come in as a string
    if (this.attachments && typeof this.attachments === 'string') {
      try {
        let cleanString = this.attachments.trim();
        if ((cleanString.startsWith('"') && cleanString.endsWith('"')) || 
            (cleanString.startsWith("'") && cleanString.endsWith("'"))) {
          cleanString = cleanString.slice(1, -1);
        }
        cleanString = cleanString.replace(/\\n/g, '').replace(/\\'/g, "'").replace(/\\"/g, '"');
        
        const parsed = JSON.parse(cleanString);
        if (Array.isArray(parsed)) {
          this.attachments = parsed.filter(att => 
            att && typeof att === 'object' && !Array.isArray(att)
          ).map(att => ({
            url: String(att.url || ''),
            name: String(att.name || ''),
            type: String(att.type || '')
          }));
        } else if (parsed && typeof parsed === 'object') {
          this.attachments = [{
            url: String(parsed.url || ''),
            name: String(parsed.name || ''),
            type: String(parsed.type || '')
          }];
        } else {
          this.attachments = [];
        }
      } catch (e) {
        console.error('Error parsing attachments in pre-save hook:', e);
        this.attachments = [];
      }
    }
    
    // Ensure attachments is always an array
    if (!Array.isArray(this.attachments)) {
      this.attachments = [];
    }

    // Generate referCode if not provided
    if (!this.referCode) {
      this.referCode = await generateReferCode('ReconcileBankAccountsVoucher');
    }

    // Set voucherDate if not provided
    if (!this.voucherDate) {
      this.voucherDate = new Date();
    }

    // Generate voucher number if not provided
    if (!this.voucherNumber) {
      const date = this.voucherDate || new Date();
      const year = date.getFullYear().toString().slice(-2);
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      
      const vouchersCount = await this.constructor.countDocuments({
        voucherDate: {
          $gte: startOfDay,
          $lte: endOfDay,
        },
        bankAccount: this.bankAccount,
      });
      
      this.voucherNumber = `RBV-${year}${month}${day}-${(vouchersCount + 1).toString().padStart(4, '0')}`;
    }

    // Generate transactionId if not provided
    if (!this.transactionId) {
      const timestamp = Date.now();
      const randomPart = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      this.transactionId = `TRX-RBV-${timestamp}-${randomPart}`;
    }

    // Calculate adjusted balance
    if (this.entries && Array.isArray(this.entries)) {
      // Calculate totals from entries
      const totalDeposits = this.entries
        .filter(e => e.statementType === 'credit')
        .reduce((sum, e) => sum + (e.statementAmount || 0), 0);
      
      const totalWithdrawals = this.entries
        .filter(e => e.statementType === 'debit')
        .reduce((sum, e) => sum + (e.statementAmount || 0), 0);
      
      // Calculate adjusted balance
      this.adjustedBalance = (this.bookBalance || 0) + 
                             (this.outstandingDeposits || 0) - 
                             (this.outstandingWithdrawals || 0) - 
                             (this.outstandingChecks || 0) + 
                             (this.interestEarned || 0) - 
                             (this.bankCharges || 0) - 
                             (this.errors || 0);
      
      // Calculate difference
      this.difference = Math.abs((this.statementBalance || 0) - (this.adjustedBalance || 0));
    }

    next();
  } catch (error) {
    return next(error);
  }
});

// Create indices for better query performance
reconcileBankAccountsVoucherSchema.index({ voucherNumber: 1 }, { unique: true });
reconcileBankAccountsVoucherSchema.index({ voucherDate: -1 });
reconcileBankAccountsVoucherSchema.index({ bankAccount: 1, statementDate: -1 });
reconcileBankAccountsVoucherSchema.index({ reconciliationStatus: 1 });
reconcileBankAccountsVoucherSchema.index({ status: 1 });
reconcileBankAccountsVoucherSchema.index({ statementDate: -1 });

const ReconcileBankAccountsVoucher = mongoose.model('ReconcileBankAccountsVoucher', reconcileBankAccountsVoucherSchema);

module.exports = ReconcileBankAccountsVoucher;

