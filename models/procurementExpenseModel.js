const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');

const procurementExpenseSchema = new mongoose.Schema(
  {
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
      required: [true, 'Supplier is required']
    },
    purchaseOrderNo: {
      type: String,
      trim: true
    },
    invoiceNo: {
      type: String,
      required: [true, 'Invoice number is required'],
      trim: true
    },
    productCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Product category is required']
    },
    products: [{
      product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
      },
      quantity: {
        type: Number,
        required: true,
        min: [0, 'Quantity cannot be negative']
      },
      unitPrice: {
        type: Number,
        required: true,
        min: [0, 'Unit price cannot be negative']
      },
      totalPrice: {
        type: Number,
        default: 0
      }
    }],
    totalCost: {
      type: Number,
     
      min: [0, 'Total cost cannot be negative']
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
    importDuty: {
      type: Number,
      default: 0,
      min: [0, 'Import duty cannot be negative']
    },
    packagingCost: {
      type: Number,
      default: 0,
      min: [0, 'Packaging cost cannot be negative']
    },
    handlingCost: {
      type: Number,
      default: 0,
      min: [0, 'Handling cost cannot be negative']
    },
    linkedShipment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shipment'
    },
    linkedBatch: {
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
    paymentStatus: {
      type: String,
      default: 'pending',
      enum: {
        values: ['pending', 'partial', 'paid', 'overdue'],
        message: 'Invalid payment status'
      }
    },
    dueDate: {
      type: Date
    },
    paidDate: {
      type: Date
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
procurementExpenseSchema.pre('save', function(next) {
  // Calculate total cost from products
  if (this.products && this.products.length > 0) {
    this.totalCost = this.products.reduce((total, product) => {
      product.totalPrice = product.quantity * product.unitPrice;
      return total + product.totalPrice;
    }, 0);
    
    // Add additional costs
    this.totalCost += (this.importDuty || 0) + (this.packagingCost || 0) + (this.handlingCost || 0);
  }
  
  // Calculate PKR amount
  if (this.totalCost && this.exchangeRate) {
    this.amountInPKR = this.totalCost * this.exchangeRate;
  }
  
  next();
});

// Apply the auto-increment plugin
procurementExpenseSchema.plugin(autoIncrementPlugin);

const ProcurementExpense = mongoose.model('ProcurementExpense', procurementExpenseSchema);

module.exports = ProcurementExpense;
