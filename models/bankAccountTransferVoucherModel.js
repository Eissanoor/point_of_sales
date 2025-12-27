const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');
const { generateReferCode } = require('../utils/referCodeGenerator');

const bankAccountTransferVoucherSchema = new mongoose.Schema(
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
    // Source bank account (from)
    fromBankAccount: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'BankAccount',
    },
    // Destination bank account (to)
    toBankAccount: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'BankAccount',
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Currency',
    },
    currencyExchangeRate: {
      type: Number,
      default: 1,
    },
    // Transfer method
    transferMethod: {
      type: String,
      required: true,
      enum: ['wire_transfer', 'online_transfer', 'rtgs', 'neft', 'imps', 'swift', 'ach', 'other'],
      default: 'online_transfer',
    },
    // Transfer fees
    transferFee: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Total amount including fees
    totalAmount: {
      type: Number,
      default: 0,
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
    fromBankTransactionId: {
      type: String,
      trim: true,
    },
    toBankTransactionId: {
      type: String,
      trim: true,
    },
    // Transfer initiation and completion dates
    initiatedAt: {
      type: Date,
    },
    completedAt: {
      type: Date,
    },
    // Transfer purpose/reason
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
      enum: ['draft', 'pending', 'initiated', 'in_transit', 'completed', 'failed', 'cancelled', 'rejected'],
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
    // Failure details if transfer fails
    failureDetails: {
      reason: {
        type: String,
        trim: true,
      },
      failedAt: {
        type: Date,
      },
      retryAttempts: {
        type: Number,
        default: 0,
      },
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
bankAccountTransferVoucherSchema.plugin(autoIncrementPlugin);

// Pre-save hook to normalize attachments and generate referCode
bankAccountTransferVoucherSchema.pre('save', async function(next) {
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
      this.referCode = await generateReferCode('BankAccountTransferVoucher');
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
      
      this.voucherNumber = `BTV-${year}${month}${day}-${(vouchersCount + 1).toString().padStart(4, '0')}`;
    }

    // Generate transactionId if not provided
    if (!this.transactionId) {
      const timestamp = Date.now();
      const randomPart = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      this.transactionId = `TRX-BTV-${timestamp}-${randomPart}`;
    }

    // Calculate total amount (amount + transfer fee)
    if (this.amount !== undefined && this.transferFee !== undefined) {
      this.totalAmount = (this.amount || 0) + (this.transferFee || 0);
    }

    // Validate that from and to accounts are different
    if (this.fromBankAccount && this.toBankAccount) {
      if (this.fromBankAccount.toString() === this.toBankAccount.toString()) {
        return next(new Error('Source and destination bank accounts cannot be the same'));
      }
    }

    next();
  } catch (error) {
    return next(error);
  }
});

// Create indices for better query performance
bankAccountTransferVoucherSchema.index({ voucherNumber: 1 }, { unique: true });
bankAccountTransferVoucherSchema.index({ voucherDate: -1 });
bankAccountTransferVoucherSchema.index({ fromBankAccount: 1, voucherDate: -1 });
bankAccountTransferVoucherSchema.index({ toBankAccount: 1, voucherDate: -1 });
bankAccountTransferVoucherSchema.index({ status: 1 });
bankAccountTransferVoucherSchema.index({ transferMethod: 1 });

const BankAccountTransferVoucher = mongoose.model('BankAccountTransferVoucher', bankAccountTransferVoucherSchema);

module.exports = BankAccountTransferVoucher;

