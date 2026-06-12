const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');
const { generateReferCode } = require('../utils/referCodeGenerator');

const cashPaymentVoucherSchema = new mongoose.Schema(
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
      enum: ['payment', 'receipt', 'transfer'],
      default: 'payment',
    },
    cashBook: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'CashBook',
    },
    payeeType: {
      type: String,
      required: true,
      enum: [
        'supplier',
        'customer',
        'employee',
        'Asset',
        'Income',
        'Liability',
        'PartnershipAccount',
        'CashBook',
        'BankAccount',
        'Capital',
        'Owner',
        'Employee',
        'PropertyAccount',
        'other',
      ],
      default: 'other',
    },
    payee: {
      type: mongoose.Schema.Types.ObjectId,
      required: false,
      refPath: 'payeeModel',
    },
    payeeModel: {
      type: String,
      required: false,
      enum: [
        'Supplier',
        'Customer',
        'User',
        'Asset',
        'Income',
        'Liability',
        'PartnershipAccount',
        'CashBook',
        'BankAccount',
        'Capital',
        'Owner',
        'Employee',
        'PropertyAccount',
        null,
      ],
    },
    payeeName: {
      type: String,
      trim: true,
    },
    financialModel: {
      type: String,
      enum: [
        'Asset',
        'Income',
        'Liability',
        'PartnershipAccount',
        'CashBook',
        'Capital',
        'Owner',
        'Employee',
        'PropertyAccount',
        null,
      ],
      default: null,
    },
    financialId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'financialModel',
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
    paymentMethod: {
      type: String,
      required: true,
      enum: ['cash', 'petty_cash', 'cash_register', 'other'],
      default: 'cash',
    },
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
    relatedFinancialPayment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FinancialPayment',
    },
    /** Ledger line on source cash book (visible in GET /financial-payments/related/CashBook/:id) */
    relatedCashBookFinancialPayment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FinancialPayment',
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
    cashBalanceApplied: {
      type: Boolean,
      default: false,
    },
    // When payeeType is BankAccount, balance on the payee bank account has been adjusted
    payeeBankBalanceApplied: {
      type: Boolean,
      default: false,
    },
    payeeCashBookBalanceApplied: {
      type: Boolean,
      default: false,
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

cashPaymentVoucherSchema.plugin(autoIncrementPlugin);

cashPaymentVoucherSchema.pre('save', async function(next) {
  try {
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
    
    if (!Array.isArray(this.attachments)) {
      this.attachments = [];
    }

    if (!this.referCode) {
      this.referCode = await generateReferCode('CashPaymentVoucher');
    }

    if (!this.voucherDate) {
      this.voucherDate = new Date();
    }

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
      
      const prefix = this.voucherType === 'payment' ? 'CPV' : this.voucherType === 'receipt' ? 'CRV' : 'CTV';
      this.voucherNumber = `${prefix}-${year}${month}${day}-${(vouchersCount + 1).toString().padStart(4, '0')}`;
    }

    if (!this.transactionId) {
      const timestamp = Date.now();
      const randomPart = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      const prefix = this.voucherType === 'payment' ? 'CPV' : this.voucherType === 'receipt' ? 'CRV' : 'CTV';
      this.transactionId = `TRX-${prefix}-${timestamp}-${randomPart}`;
    }

    if (this.payeeType === 'supplier') {
      this.payeeModel = 'Supplier';
    } else if (this.payeeType === 'customer') {
      this.payeeModel = 'Customer';
    } else if (this.payeeType === 'employee') {
      this.payeeModel = 'User';
    }

    if (this.payeeType === 'BankAccount' && this.payee) {
      this.payeeModel = 'BankAccount';
      this.financialModel = null;
      this.financialId = null;
    }

    const financialModels = [
      'Asset',
      'Income',
      'Liability',
      'PartnershipAccount',
      'CashBook',
      'Capital',
      'Owner',
      'Employee',
      'PropertyAccount',
    ];
    if (financialModels.includes(this.payeeType) && this.payee) {
      this.payeeModel = this.payeeType;
      this.financialModel = this.payeeType;
      this.financialId = this.payee;
    }

    next();
  } catch (error) {
    return next(error);
  }
});

cashPaymentVoucherSchema.index({ voucherNumber: 1 }, { unique: true });
cashPaymentVoucherSchema.index({ voucherDate: -1 });
cashPaymentVoucherSchema.index({ cashBook: 1, voucherDate: -1 });
cashPaymentVoucherSchema.index({ payeeType: 1, payee: 1 });
cashPaymentVoucherSchema.index({ financialModel: 1, financialId: 1 });
cashPaymentVoucherSchema.index({ status: 1 });
cashPaymentVoucherSchema.index({ voucherType: 1 });

const CashPaymentVoucher = mongoose.model('CashPaymentVoucher', cashPaymentVoucherSchema);

module.exports = CashPaymentVoucher;
