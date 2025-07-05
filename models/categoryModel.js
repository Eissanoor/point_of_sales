const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please enter category name'],
      trim: true,
      unique: true,
    },
    description: {
      type: String,
      required: [true, 'Please enter category description'],
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

// Apply the auto-increment plugin
categorySchema.plugin(autoIncrementPlugin);

const Category = mongoose.model('Category', categorySchema);

module.exports = Category; 