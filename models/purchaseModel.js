const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');

// Schema for individual purchase items
const purchaseItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'Please select a product'],
    ref: 'Product',
  },
  quantity: {
    type: Number,
    required: [true, 'Please enter purchase quantity'],
    min: [1, 'Quantity must be at least 1'],
  },
  purchaseRate: {
    type: Number,
    required: [true, 'Please enter purchase rate'],
    min: [0, 'Purchase rate cannot be negative'],
  },
  retailRate: {
    type: Number,
    required: [true, 'Please enter retail rate'],
    min: [0, 'Retail rate cannot be negative'],
  },
  wholesaleRate: {
    type: Number,
    required: [true, 'Please enter wholesale rate'],
    min: [0, 'Wholesale rate cannot be negative'],
  },
  itemTotal: {
    type: Number,
    
    min: [0, 'Item total cannot be negative'],
  },
}, { _id: false });

const purchaseSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, 'Please select a supplier'],
      ref: 'Supplier',
    },
    locationType: {
      type: String,
      enum: ['warehouse', 'shop'],
      default: 'warehouse',
    },
    warehouse: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse',
      required: function () {
        return this.locationType === 'warehouse';
      },
    },
    shop: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shop',
      required: function () {
        return this.locationType === 'shop';
      },
    },
    bankAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BankAccount',
      default: null,
    },
    currency: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Currency',
    },
    currencyExchangeRate: {
      type: Number,
      default: 1, // Store the exchange rate at the time of purchase
    },
    items: [purchaseItemSchema], // Array of purchase items
    purchaseDate: {
      type: Date,
      required: [true, 'Please enter purchase date'],
      default: Date.now,
    },
    totalAmount: {
      type: Number,
     
      min: [0, 'Total amount cannot be negative'],
    },
    totalQuantity: {
      type: Number,
      
      min: [0, 'Total quantity cannot be negative'],
    },
    invoiceNumber: {
      type: String,
      default: '',
    },
    notes: {
      type: String,
      default: '',
    },
    transactionRecipt: {
      url: { type: String, default: '' },
      publicId: { type: String, default: '' },
      fileName: { type: String, default: '' },
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'bank', 'credit', 'check', 'online'],
      default: 'cash',
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'cancelled'],
      default: 'completed',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Calculate totals and generate invoice number before saving
purchaseSchema.pre('save', async function(next) {
  try {
    // Generate invoice number if not provided
    if (!this.invoiceNumber || this.invoiceNumber === '') {
      const currentDate = new Date();
      const year = currentDate.getFullYear();
      const month = String(currentDate.getMonth() + 1).padStart(2, '0');
      
      // Get the count of purchases for this month
      const startOfMonth = new Date(year, currentDate.getMonth(), 1);
      const endOfMonth = new Date(year, currentDate.getMonth() + 1, 0);
      
      const monthlyCount = await this.constructor.countDocuments({
        purchaseDate: {
          $gte: startOfMonth,
          $lte: endOfMonth
        },
        isActive: true
      });
      
      // Generate invoice number: PUR-YYYY-MM-XXXX
      const invoiceNumber = `PUR-${year}-${month}-${String(monthlyCount + 1).padStart(4, '0')}`;
      this.invoiceNumber = invoiceNumber;
    }
    
    // Calculate totals if items exist
    if (this.items && this.items.length > 0) {
      // Calculate item totals
      this.items.forEach(item => {
        item.itemTotal = item.quantity * item.purchaseRate;
      });
      
      // Calculate total amount and total quantity
      this.totalAmount = this.items.reduce((sum, item) => sum + item.itemTotal, 0);
      this.totalQuantity = this.items.reduce((sum, item) => sum + item.quantity, 0);
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

// Apply the auto-increment plugin
purchaseSchema.plugin(autoIncrementPlugin);

// Index for better query performance
purchaseSchema.index({ product: 1, purchaseDate: -1 });
purchaseSchema.index({ supplier: 1, purchaseDate: -1 });
purchaseSchema.index({ warehouse: 1, purchaseDate: -1 });
purchaseSchema.index({ shop: 1, purchaseDate: -1 });
purchaseSchema.index({ locationType: 1, purchaseDate: -1 });

const Purchase = mongoose.model('Purchase', purchaseSchema);

module.exports = Purchase;
