const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');

const logisticsExpenseSchema = new mongoose.Schema(
  {
    transporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transporter',
      required: [true, 'Transporter is required']
    },
    route: {
      type: String,
      required: [true, 'Route is required'],
      trim: true
    },
    vehicleContainerNo: {
      type: String,
      trim: true
    },
    freightCost: {
      type: Number,
      required: [true, 'Freight cost is required'],
      min: [0, 'Freight cost cannot be negative']
    },
    borderCrossingCharges: {
      type: Number,
      default: 0,
      min: [0, 'Border crossing charges cannot be negative']
    },
    transporterCommission: {
      type: Number,
      default: 0,
      min: [0, 'Transporter commission cannot be negative']
    },
    serviceFee: {
      type: Number,
      default: 0,
      min: [0, 'Service fee cannot be negative']
    },
    transitWarehouseCharges: {
      type: Number,
      default: 0,
      min: [0, 'Transit warehouse charges cannot be negative']
    },
    localTransportCharges: {
      type: Number,
      default: 0,
      min: [0, 'Local transport charges cannot be negative']
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
    linkedShipment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shipment'
    },
    linkedWarehouse: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse'
    },
    paymentMethod: {
      type: String,
      required: [true, 'Payment method is required'],
      enum: {
        values: ['cash', 'bank', 'credit', 'mixed'],
        message: 'Invalid payment method'
      }
    },
    supportingDocument: {
      fileName: String,
      fileUrl: String,
      fileType: String,
      uploadDate: {
        type: Date,
        default: Date.now
      }
    },
    transportStatus: {
      type: String,
      default: 'pending',
      enum: {
        values: ['pending', 'in_transit', 'delivered', 'cancelled'],
        message: 'Invalid transport status'
      }
    },
    departureDate: {
      type: Date
    },
    arrivalDate: {
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
logisticsExpenseSchema.pre('save', function(next) {
  // Calculate total cost from all components
  this.totalCost = (this.freightCost || 0) + 
                   (this.borderCrossingCharges || 0) + 
                   (this.transporterCommission || 0) + 
                   (this.serviceFee || 0) + 
                   (this.transitWarehouseCharges || 0) + 
                   (this.localTransportCharges || 0);
  
  // Calculate PKR amount
  if (this.totalCost && this.exchangeRate) {
    this.amountInPKR = this.totalCost * this.exchangeRate;
  }
  
  next();
});

// Apply the auto-increment plugin
logisticsExpenseSchema.plugin(autoIncrementPlugin);

const LogisticsExpense = mongoose.model('LogisticsExpense', logisticsExpenseSchema);

module.exports = LogisticsExpense;
