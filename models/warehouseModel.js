const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');
const { generateReferCode } = require('../utils/referCodeGenerator');

const warehouseSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    branch: {
      type: String,
      trim: true,
    },
    country: {
      type: String,
      trim: true,
    },
    state: {
      type: String,
      trim: true,
    },
    city: {
      type: String,
      trim: true,
    },
    zipCode: {
      type: String,
      trim: true,
    },
    contactPerson: {
      type: String,
      trim: true,
    },
    phoneNumber: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['active', 'inactive'],
      default: 'active',
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
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
warehouseSchema.plugin(autoIncrementPlugin);

// Pre-save hook to generate referCode
warehouseSchema.pre('save', async function(next) {
  if (!this.referCode) {
    try {
      this.referCode = await generateReferCode('Warehouse');
    } catch (error) {
      return next(error);
    }
  }
  next();
});

// Create indices for faster queries
warehouseSchema.index({ name: 1 });
warehouseSchema.index({ code: 1 }, { unique: true });
warehouseSchema.index({ status: 1 });

const Warehouse = mongoose.model('Warehouse', warehouseSchema);

module.exports = Warehouse;
