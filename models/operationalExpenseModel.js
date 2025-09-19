const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');

const operationalExpenseSchema = new mongoose.Schema(
  {
    expenseSubType: {
      type: String,
      required: [true, 'Expense sub-type is required'],
      enum: {
        values: ['salaries', 'office_rent', 'utilities', 'office_supplies', 'software', 'equipment', 'insurance'],
        message: 'Invalid expense sub-type'
      }
    },
    employeeSalaries: {
      type: Number,
      default: 0,
      min: [0, 'Employee salaries cannot be negative']
    },
    officeRent: {
      type: Number,
      default: 0,
      min: [0, 'Office rent cannot be negative']
    },
    utilities: {
      electricity: {
        type: Number,
        default: 0,
        min: [0, 'Electricity cost cannot be negative']
      },
      internet: {
        type: Number,
        default: 0,
        min: [0, 'Internet cost cannot be negative']
      },
      phone: {
        type: Number,
        default: 0,
        min: [0, 'Phone cost cannot be negative']
      },
      water: {
        type: Number,
        default: 0,
        min: [0, 'Water cost cannot be negative']
      }
    },
    officeSupplies: {
      type: Number,
      default: 0,
      min: [0, 'Office supplies cost cannot be negative']
    },
    stationery: {
      type: Number,
      default: 0,
      min: [0, 'Stationery cost cannot be negative']
    },
    softwareExpenses: {
      type: Number,
      default: 0,
      min: [0, 'Software expenses cannot be negative']
    },
    equipmentCost: {
      type: Number,
      default: 0,
      min: [0, 'Equipment cost cannot be negative']
    },
    insuranceCost: {
      type: Number,
      default: 0,
      min: [0, 'Insurance cost cannot be negative']
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
    department: {
      type: String,
      trim: true,
      enum: {
        values: ['administration', 'sales', 'finance', 'hr', 'it', 'operations'],
        message: 'Invalid department'
      }
    },
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
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
        type: Date
      },
      endDate: {
        type: Date
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
operationalExpenseSchema.pre('save', function(next) {
  // Calculate total utilities cost
  const totalUtilities = (this.utilities.electricity || 0) + 
                         (this.utilities.internet || 0) + 
                         (this.utilities.phone || 0) + 
                         (this.utilities.water || 0);
  
  // Calculate total cost from all components
  this.totalCost = (this.employeeSalaries || 0) + 
                   (this.officeRent || 0) + 
                   totalUtilities + 
                   (this.officeSupplies || 0) + 
                   (this.stationery || 0) + 
                   (this.softwareExpenses || 0) + 
                   (this.equipmentCost || 0) + 
                   (this.insuranceCost || 0);
  
  // Calculate PKR amount
  if (this.totalCost && this.exchangeRate) {
    this.amountInPKR = this.totalCost * this.exchangeRate;
  }
  
  next();
});

// Apply the auto-increment plugin
operationalExpenseSchema.plugin(autoIncrementPlugin);

const OperationalExpense = mongoose.model('OperationalExpense', operationalExpenseSchema);

module.exports = OperationalExpense;
