const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');
const { generateReferCode } = require('../utils/referCodeGenerator');

const employeeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    mobileNo: {
      type: String,
      trim: true,
    },
    code: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
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
employeeSchema.plugin(autoIncrementPlugin);

// Pre-save hook to generate referCode
employeeSchema.pre('save', async function (next) {
  try {
    if (!this.referCode) {
      this.referCode = await generateReferCode('Employee');
    }
    next();
  } catch (error) {
    return next(error);
  }
});

employeeSchema.index({ name: 1 });
employeeSchema.index({ code: 1 });
employeeSchema.index({ referCode: 1 }, { unique: true });

const Employee = mongoose.model('Employee', employeeSchema);

module.exports = Employee;

