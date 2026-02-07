const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');
const { generateReferCode } = require('../utils/referCodeGenerator');

const customerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      default: null,
    },
    email: {
      type: String,
      required: false,
      lowercase: true,
      trim: true,
      default: null,
    },
    phoneNumber: {
      type: String,
      trim: true,
      default: null,
    },
    cnicNumber: {
      type: String,
      trim: true,
      default: null,
    },
    address: {
      type: String,
      trim: true,
      default: null,
    },
    manager: {
      type: String,
      trim: true,
      default: null,
    },
    country: {
      type: String,
      trim: true,
      default: null,
    },
    state: {
      type: String,
      trim: true,
      default: null,
    },
    city: {
      type: String,
      trim: true,
      default: null,
    },
    deliveryAddress: {
      type: String,
      trim: true,
      default: null,
    },
    customerType: {
      type: String,
      trim: true,
      default: null,
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
customerSchema.plugin(autoIncrementPlugin);

// Pre-save hook to generate referCode and handle empty strings
customerSchema.pre('save', async function(next) {
  // Convert empty strings to null for all optional fields including email
  const optionalFields = ['name', 'email', 'phoneNumber', 'cnicNumber', 'address', 'manager', 'country', 'state', 'city', 'deliveryAddress', 'customerType'];
  optionalFields.forEach(field => {
    if (this[field] === '' || (this[field] && typeof this[field] === 'string' && this[field].trim() === '')) {
      this[field] = null;
    }
  });
  
  // Trim email if it exists
  if (this.email && typeof this.email === 'string') {
    this.email = this.email.trim();
    // Convert empty string to null after trim
    if (this.email === '') {
      this.email = null;
    } else {
      // Convert to lowercase only if not null
      this.email = this.email.toLowerCase();
    }
  }
  
  if (!this.referCode) {
    try {
      this.referCode = await generateReferCode('Customer');
    } catch (error) {
      return next(error);
    }
  }
  next();
});

const Customer = mongoose.model('Customer', customerSchema);

module.exports = Customer; 