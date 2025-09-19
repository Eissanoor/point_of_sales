const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');

const warehouseExpenseSchema = new mongoose.Schema(
  {
    warehouse: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse',
      required: [true, 'Warehouse is required']
    },
    expenseSubType: {
      type: String,
      required: [true, 'Expense sub-type is required'],
      enum: {
        values: ['rent', 'salaries', 'utilities', 'maintenance', 'security', 'insurance'],
        message: 'Invalid expense sub-type'
      }
    },
    rentAmount: {
      type: Number,
      default: 0,
      min: [0, 'Rent amount cannot be negative']
    },
    staffSalaries: {
      type: Number,
      default: 0,
      min: [0, 'Staff salaries cannot be negative']
    },
    securityCost: {
      type: Number,
      default: 0,
      min: [0, 'Security cost cannot be negative']
    },
    utilities: {
      electricity: {
        type: Number,
        default: 0,
        min: [0, 'Electricity cost cannot be negative']
      },
      water: {
        type: Number,
        default: 0,
        min: [0, 'Water cost cannot be negative']
      },
      gas: {
        type: Number,
        default: 0,
        min: [0, 'Gas cost cannot be negative']
      },
      internet: {
        type: Number,
        default: 0,
        min: [0, 'Internet cost cannot be negative']
      }
    },
    repairsCost: {
      type: Number,
      default: 0,
      min: [0, 'Repairs cost cannot be negative']
    },
    maintenanceCost: {
      type: Number,
      default: 0,
      min: [0, 'Maintenance cost cannot be negative']
    },
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
    storageDuration: {
      type: String,
      enum: {
        values: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'],
        message: 'Invalid storage duration'
      }
    },
    linkedStock: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
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
    expensePeriod: {
      startDate: {
        type: Date,
        required: [true, 'Start date is required']
      },
      endDate: {
        type: Date,
        required: [true, 'End date is required']
      }
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
warehouseExpenseSchema.pre('save', function(next) {
  // Calculate total utilities cost
  const totalUtilities = (this.utilities.electricity || 0) + 
                         (this.utilities.water || 0) + 
                         (this.utilities.gas || 0) + 
                         (this.utilities.internet || 0);
  
  // Calculate total cost from all components
  this.totalCost = (this.rentAmount || 0) + 
                   (this.staffSalaries || 0) + 
                   (this.securityCost || 0) + 
                   totalUtilities + 
                   (this.repairsCost || 0) + 
                   (this.maintenanceCost || 0);
  
  // Calculate PKR amount
  if (this.totalCost && this.exchangeRate) {
    this.amountInPKR = this.totalCost * this.exchangeRate;
  }
  
  next();
});

// Apply the auto-increment plugin
warehouseExpenseSchema.plugin(autoIncrementPlugin);

const WarehouseExpense = mongoose.model('WarehouseExpense', warehouseExpenseSchema);

module.exports = WarehouseExpense;
