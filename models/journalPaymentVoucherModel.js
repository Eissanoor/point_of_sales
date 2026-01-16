const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');
const { generateReferCode } = require('../utils/referCodeGenerator');

// Journal Entry Schema for debit/credit entries
const journalEntrySchema = new mongoose.Schema({
  account: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'accountModel',
  },
  accountModel: {
    type: String,
    required: true,
    enum: ['BankAccount', 'CashAccount', 'Supplier', 'Customer', 'Expense', 'Income', 'Asset', 'Liability', 'Equity'],
  },
  accountName: {
    type: String,
    trim: true,
  },
  debit: {
    type: Number,
    default: 0,
    min: 0,
  },
  credit: {
    type: Number,
    default: 0,
    min: 0,
  },
  description: {
    type: String,
    trim: true,
  },
}, { _id: true });

const journalPaymentVoucherSchema = new mongoose.Schema(
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
    voucherType: {
      type: String,
      required: true,
      enum: ['journal_entry', 'adjustment', 'reversal', 'opening_balance', 'closing_entry', 'other'],
      default: 'journal_entry',
    },
    // Journal entries (debit and credit sides)
    entries: {
      type: [journalEntrySchema],
      required: true,
      validate: {
        validator: function(v) {
          // Must have at least 2 entries (one debit, one credit)
          if (!Array.isArray(v) || v.length < 2) {
            return false;
          }
          
          // Calculate total debits and credits
          const totalDebits = v.reduce((sum, entry) => sum + (entry.debit || 0), 0);
          const totalCredits = v.reduce((sum, entry) => sum + (entry.credit || 0), 0);
          
          // Debits must equal credits (double-entry bookkeeping)
          return Math.abs(totalDebits - totalCredits) < 0.01; // Allow small floating point differences
        },
        message: 'Journal entries must have at least 2 entries and total debits must equal total credits'
      }
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
    // Reference to related transactions
    relatedPurchase: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Purchase',
    },
    relatedSale: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Sales',
    },
    relatedPayment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
    },
    relatedSupplierPayment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment', // Now references unified Payment model
    },
    relatedBankPaymentVoucher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BankPaymentVoucher',
    },
    relatedCashPaymentVoucher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CashPaymentVoucher',
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
      enum: ['draft', 'pending', 'approved', 'posted', 'cancelled', 'rejected'],
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
    postedAt: {
      type: Date,
    },
    postedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
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
journalPaymentVoucherSchema.plugin(autoIncrementPlugin);

// Pre-save hook to normalize attachments and generate referCode
journalPaymentVoucherSchema.pre('save', async function(next) {
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
      this.referCode = await generateReferCode('JournalPaymentVoucher');
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
        voucherType: this.voucherType,
      });
      
      const prefix = this.voucherType === 'journal_entry' ? 'JV' : 
                     this.voucherType === 'adjustment' ? 'JA' :
                     this.voucherType === 'reversal' ? 'JR' :
                     this.voucherType === 'opening_balance' ? 'JO' :
                     this.voucherType === 'closing_entry' ? 'JC' : 'JV';
      this.voucherNumber = `${prefix}-${year}${month}${day}-${(vouchersCount + 1).toString().padStart(4, '0')}`;
    }

    // Generate transactionId if not provided
    if (!this.transactionId) {
      const timestamp = Date.now();
      const randomPart = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      const prefix = this.voucherType === 'journal_entry' ? 'JV' : 
                     this.voucherType === 'adjustment' ? 'JA' :
                     this.voucherType === 'reversal' ? 'JR' :
                     this.voucherType === 'opening_balance' ? 'JO' :
                     this.voucherType === 'closing_entry' ? 'JC' : 'JV';
      this.transactionId = `TRX-${prefix}-${timestamp}-${randomPart}`;
    }

    // Validate entries balance (debits must equal credits)
    if (this.entries && Array.isArray(this.entries) && this.entries.length > 0) {
      const totalDebits = this.entries.reduce((sum, entry) => sum + (entry.debit || 0), 0);
      const totalCredits = this.entries.reduce((sum, entry) => sum + (entry.credit || 0), 0);
      
      // This validation is already done in the schema validator, but we can add additional checks here if needed
      if (Math.abs(totalDebits - totalCredits) > 0.01) {
        return next(new Error(`Total debits (${totalDebits}) must equal total credits (${totalCredits})`));
      }
    }

    next();
  } catch (error) {
    return next(error);
  }
});

// Virtual for total amount
journalPaymentVoucherSchema.virtual('totalAmount').get(function() {
  if (!this.entries || !Array.isArray(this.entries)) return 0;
  const totalDebits = this.entries.reduce((sum, entry) => sum + (entry.debit || 0), 0);
  return totalDebits;
});

// Create indices for better query performance
journalPaymentVoucherSchema.index({ voucherNumber: 1 }, { unique: true });
journalPaymentVoucherSchema.index({ voucherDate: -1 });
journalPaymentVoucherSchema.index({ status: 1 });
journalPaymentVoucherSchema.index({ voucherType: 1 });
journalPaymentVoucherSchema.index({ 'entries.account': 1 });
journalPaymentVoucherSchema.index({ 'entries.accountModel': 1 });

const JournalPaymentVoucher = mongoose.model('JournalPaymentVoucher', journalPaymentVoucherSchema);

module.exports = JournalPaymentVoucher;

