const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');

const shipmentSchema = new mongoose.Schema(
  {
    shipmentId: {
      type: String,
      required: [true, 'Shipment ID is required'],
      unique: true,
      trim: true
    },
    batchNo: {
      type: String,
      required: [true, 'Batch number is required'],
      trim: true
    },
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
      required: [true, 'Supplier is required']
    },
    transporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transporter'
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
      }
    }],
    origin: {
      country: {
        type: String,
        required: [true, 'Origin country is required'],
        trim: true
      },
      city: {
        type: String,
        required: [true, 'Origin city is required'],
        trim: true
      },
      address: {
        type: String,
        trim: true
      }
    },
    destination: {
      country: {
        type: String,
        required: [true, 'Destination country is required'],
        trim: true
      },
      city: {
        type: String,
        required: [true, 'Destination city is required'],
        trim: true
      },
      warehouse: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Warehouse'
      }
    },
    status: {
      type: String,
      default: 'pending',
      enum: {
        values: ['pending', 'shipped', 'in_transit', 'customs_clearance', 'delivered', 'cancelled'],
        message: 'Invalid status'
      }
    },
    shipmentDate: {
      type: Date
    },
    estimatedArrival: {
      type: Date
    },
    actualArrival: {
      type: Date
    },
    trackingNumber: {
      type: String,
      trim: true
    },
    totalWeight: {
      type: Number,
      min: [0, 'Weight cannot be negative']
    },
    
    currency: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Currency',
      required: [true, 'Currency is required']
    },
    documents: [{
      documentType: {
        type: String,
        enum: ['invoice', 'packing_list', 'bill_of_lading', 'customs_declaration', 'insurance'],
        required: true
      },
      fileName: String,
      fileUrl: String,
      uploadDate: {
        type: Date,
        default: Date.now
      }
    }],
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

// Pre-save middleware to calculate total value
shipmentSchema.pre('save', function(next) {
  if (this.products && this.products.length > 0) {
    this.totalValue = this.products.reduce((total, product) => {
      return total + (product.quantity * product.unitPrice);
    }, 0);
  }
  next();
});

// Apply the auto-increment plugin
shipmentSchema.plugin(autoIncrementPlugin);

const Shipment = mongoose.model('Shipment', shipmentSchema);

module.exports = Shipment;
