const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');
const { generateReferCode } = require('../utils/referCodeGenerator');

// Saraf Entry Schema - for currency exchange transactions
const sarafEntryVoucherSchema = new mongoose.Schema(
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
    // Exchange type
    exchangeType: {
      type: String,
      required: true,
      enum: ['buy', 'sell', 'exchange', 'conversion'],
      default: 'exchange',
    },
    // From currency (source currency)
    fromCurrency: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Currency',
    },
    fromAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    // To currency (destination currency)
    toCurrency: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Currency',
    },
    toAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    // Exchange rate details
    exchangeRate: {
      type: Number,
      required: true,
      min: 0,
    },
    // Market rate vs actual rate
    marketRate: {
      type: Number,
      min: 0,
    },
    // Exchange gain/loss
    exchangeGain: {
      type: Number,
      default: 0,
    },
    exchangeLoss: {
      type: Number,
      default: 0,
    },
    // Commission/charges
    commission: {
      type: Number,
      default: 0,
      min: 0,
    },
    commissionPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    // Bank account references (if applicable)
    fromBankAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BankAccount',
    },
    toBankAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BankAccount',
    },
    // Cash account references (if applicable)
    fromCashAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CashAccount',
    },
    toCashAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CashAccount',
    },
    // Transaction references
    transactionId: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
    },
    referenceNumber: {
      type: String,
      trim: true,
    },
    // Bank transaction references
    bankTransactionId: {
      type: String,
      trim: true,
    },
    // Exchange dealer/saraf details
    sarafName: {
      type: String,
      trim: true,
    },
    sarafContact: {
      type: String,
      trim: true,
    },
    // Purpose and description
    purpose: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    // Status tracking
    status: {
      type: String,
      required: true,
      enum: ['draft', 'pending', 'approved', 'completed', 'cancelled', 'rejected'],
      default: 'draft',
    },
    // Approval workflow
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
    // Completion details
    completedAt: {
      type: Date,
    },
    completedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    // Related transactions
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
      ref: 'SupplierPayment',
    },
    relatedBankPaymentVoucher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BankPaymentVoucher',
    },
    relatedCashPaymentVoucher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CashPaymentVoucher',
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
sarafEntryVoucherSchema.plugin(autoIncrementPlugin);

// Pre-save hook to normalize attachments and generate referCode
sarafEntryVoucherSchema.pre('save', async function(next) {
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
      this.referCode = await generateReferCode('SarafEntryVoucher');
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
      
      this.voucherNumber = `SEV-${year}${month}${day}-${(vouchersCount + 1).toString().padStart(4, '0')}`;
    }

    // Generate transactionId if not provided
    if (!this.transactionId) {
      const timestamp = Date.now();
      const randomPart = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      this.transactionId = `TRX-SEV-${timestamp}-${randomPart}`;
    }

    // Validate that from and to currencies are different
    if (this.fromCurrency && this.toCurrency) {
      if (this.fromCurrency.toString() === this.toCurrency.toString()) {
        return next(new Error('Source and destination currencies cannot be the same'));
      }
    }

    // Calculate exchange gain/loss if market rate is provided
    if (this.marketRate && this.exchangeRate && this.fromAmount) {
      const marketValue = this.fromAmount * this.marketRate;
      const actualValue = this.fromAmount * this.exchangeRate;
      const difference = actualValue - marketValue;
      
      if (difference > 0) {
        this.exchangeGain = difference;
        this.exchangeLoss = 0;
      } else {
        this.exchangeGain = 0;
        this.exchangeLoss = Math.abs(difference);
      }
    }

    // Calculate commission if percentage is provided
    if (this.commissionPercentage > 0 && this.fromAmount) {
      this.commission = (this.fromAmount * this.commissionPercentage) / 100;
    }

    next();
  } catch (error) {
    return next(error);
  }
});

// Create indices for better query performance
sarafEntryVoucherSchema.index({ voucherNumber: 1 }, { unique: true });
sarafEntryVoucherSchema.index({ voucherDate: -1 });
sarafEntryVoucherSchema.index({ fromCurrency: 1, toCurrency: 1 });
sarafEntryVoucherSchema.index({ status: 1 });
sarafEntryVoucherSchema.index({ exchangeType: 1 });
sarafEntryVoucherSchema.index({ fromBankAccount: 1 });
sarafEntryVoucherSchema.index({ toBankAccount: 1 });

const SarafEntryVoucher = mongoose.model('SarafEntryVoucher', sarafEntryVoucherSchema);

module.exports = SarafEntryVoucher;

