const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');
const { generateReferCode } = require('../utils/referCodeGenerator');

// Opening Balance Entry Schema
const openingBalanceEntrySchema = new mongoose.Schema({
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
  // Opening balance can be debit or credit
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

const openingBalanceVoucherSchema = new mongoose.Schema(
  {
    voucherNumber: {
      type: String,
      required: false,
      unique: true,
    },
    voucherDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    financialYear: {
      type: String,
      required: true,
      trim: true,
      // Format: "2024-2025" or "FY2024"
    },
    periodStartDate: {
      type: Date,
      required: true,
    },
    periodEndDate: {
      type: Date,
      required: false,
    },
    // Opening balance entries
    entries: {
      type: [openingBalanceEntrySchema],
      required: true,
      validate: {
        validator: function(v) {
          // Must have at least 1 entry
          if (!Array.isArray(v) || v.length < 1) {
            return false;
          }
          
          // Each entry must have either debit or credit (not both, not neither)
          const allValid = v.every(entry => {
            const hasDebit = entry.debit > 0;
            const hasCredit = entry.credit > 0;
            return (hasDebit && !hasCredit) || (!hasDebit && hasCredit);
          });
          
          return allValid;
        },
        message: 'Opening balance entries must have at least 1 entry, and each entry must have either debit OR credit (not both, not neither)'
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
openingBalanceVoucherSchema.plugin(autoIncrementPlugin);

// Pre-save hook to normalize attachments and generate referCode
openingBalanceVoucherSchema.pre('save', async function(next) {
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
      this.referCode = await generateReferCode('OpeningBalanceVoucher');
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
      });
      
      this.voucherNumber = `OBV-${year}${month}${day}-${(vouchersCount + 1).toString().padStart(4, '0')}`;
    }

    // Generate transactionId if not provided
    if (!this.transactionId) {
      const timestamp = Date.now();
      const randomPart = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      this.transactionId = `TRX-OBV-${timestamp}-${randomPart}`;
    }

    next();
  } catch (error) {
    return next(error);
  }
});

// Virtual for total debit amount
openingBalanceVoucherSchema.virtual('totalDebits').get(function() {
  if (!this.entries || !Array.isArray(this.entries)) return 0;
  return this.entries.reduce((sum, entry) => sum + (entry.debit || 0), 0);
});

// Virtual for total credit amount
openingBalanceVoucherSchema.virtual('totalCredits').get(function() {
  if (!this.entries || !Array.isArray(this.entries)) return 0;
  return this.entries.reduce((sum, entry) => sum + (entry.credit || 0), 0);
});

// Create indices for better query performance
openingBalanceVoucherSchema.index({ voucherNumber: 1 }, { unique: true });
openingBalanceVoucherSchema.index({ voucherDate: -1 });
openingBalanceVoucherSchema.index({ financialYear: 1 });
openingBalanceVoucherSchema.index({ status: 1 });
openingBalanceVoucherSchema.index({ 'entries.account': 1 });
openingBalanceVoucherSchema.index({ 'entries.accountModel': 1 });

const OpeningBalanceVoucher = mongoose.model('OpeningBalanceVoucher', openingBalanceVoucherSchema);

module.exports = OpeningBalanceVoucher;

