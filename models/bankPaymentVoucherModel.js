const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');
const { generateReferCode } = require('../utils/referCodeGenerator');

const bankPaymentVoucherSchema = new mongoose.Schema(
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
    bankAccount: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'BankAccount',
    },
    payeeType: {
      type: String,
      required: true,
      enum: ['supplier', 'customer', 'employee', 'other'],
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
      enum: ['Supplier', 'Customer', 'User', null],
    },
    payeeName: {
      type: String,
      trim: true,
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
      enum: ['bank_transfer', 'check', 'online_payment', 'wire_transfer', 'dd', 'other'],
      default: 'bank_transfer',
    },
    checkNumber: {
      type: String,
      trim: true,
    },
    transactionId: {
      type: String,
      trim: true,
      unique: true,
      sparse: true, // Allow null/undefined values but ensure uniqueness when present
    },
    referenceNumber: {
      type: String,
      trim: true,
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
      ref: 'SupplierPayment',
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
    attachments: [{
      url: String,
      name: String,
      type: String,
    }],
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
bankPaymentVoucherSchema.plugin(autoIncrementPlugin);

// Pre-save hook to generate referCode and voucher number
bankPaymentVoucherSchema.pre('save', async function(next) {
  try {
    // Generate referCode if not provided
    if (!this.referCode) {
      this.referCode = await generateReferCode('BankPaymentVoucher');
    }

    // Set voucherDate if not provided
    if (!this.voucherDate) {
      this.voucherDate = new Date();
    }

    // Generate voucher number if not provided
    if (!this.voucherNumber) {
      // Use voucherDate for generating number, or current date if not set
      const date = this.voucherDate || new Date();
      const year = date.getFullYear().toString().slice(-2);
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      
      // Get count of vouchers for the voucher date
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
      
      const prefix = this.voucherType === 'payment' ? 'BPV' : this.voucherType === 'receipt' ? 'BRV' : 'BTV';
      this.voucherNumber = `${prefix}-${year}${month}${day}-${(vouchersCount + 1).toString().padStart(4, '0')}`;
    }

    // Generate transactionId if not provided
    if (!this.transactionId) {
      const timestamp = Date.now();
      const randomPart = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      const prefix = this.voucherType === 'payment' ? 'BPV' : this.voucherType === 'receipt' ? 'BRV' : 'BTV';
      this.transactionId = `TRX-${prefix}-${timestamp}-${randomPart}`;
    }

    // Validate and clean attachments array - prevent strings from being saved
    if (this.attachments) {
      let cleanAttachments = [];
      
      // If it's a string, try to parse it
      if (typeof this.attachments === 'string') {
        try {
          const parsed = JSON.parse(this.attachments);
          if (Array.isArray(parsed)) {
            cleanAttachments = parsed;
          } else {
            cleanAttachments = [];
          }
        } catch (e) {
          cleanAttachments = [];
        }
      } else if (Array.isArray(this.attachments)) {
        cleanAttachments = this.attachments;
      } else {
        cleanAttachments = [];
      }
      
      // Deep clean: process each element
      const finalAttachments = [];
      for (const att of cleanAttachments) {
        let processedAtt = att;
        
        // If element is a string, try to parse it
        if (typeof processedAtt === 'string') {
          try {
            processedAtt = JSON.parse(processedAtt);
            // If parsing results in an array, take first element
            if (Array.isArray(processedAtt) && processedAtt.length > 0) {
              processedAtt = processedAtt[0];
            }
          } catch (e) {
            // Skip invalid strings
            continue;
          }
        }
        
        // If it's an array, take first element
        if (Array.isArray(processedAtt) && processedAtt.length > 0) {
          processedAtt = processedAtt[0];
        }
        
        // Only add if it's a valid object with url
        if (processedAtt && typeof processedAtt === 'object' && !Array.isArray(processedAtt) && processedAtt.url) {
          finalAttachments.push({
            url: String(processedAtt.url || ''),
            name: String(processedAtt.name || ''),
            type: String(processedAtt.type || '')
          });
        }
      }
      
      this.attachments = finalAttachments;
    }

    // Set payeeModel based on payeeType
    if (this.payeeType === 'supplier') {
      this.payeeModel = 'Supplier';
    } else if (this.payeeType === 'customer') {
      this.payeeModel = 'Customer';
    } else if (this.payeeType === 'employee') {
      this.payeeModel = 'User'; // Employee uses User model
    }

    next();
  } catch (error) {
    return next(error);
  }
});

// Create indices for better query performance
bankPaymentVoucherSchema.index({ voucherNumber: 1 }, { unique: true });
bankPaymentVoucherSchema.index({ voucherDate: -1 });
bankPaymentVoucherSchema.index({ bankAccount: 1, voucherDate: -1 });
bankPaymentVoucherSchema.index({ payeeType: 1, payee: 1 });
bankPaymentVoucherSchema.index({ status: 1 });
bankPaymentVoucherSchema.index({ voucherType: 1 });

const BankPaymentVoucher = mongoose.model('BankPaymentVoucher', bankPaymentVoucherSchema);

module.exports = BankPaymentVoucher;

