const mongoose = require('mongoose');
const autoIncrementPlugin = require('./autoIncrementPlugin');

const subCategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please enter subcategory name'],
      trim: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Please select a category'],
    },
    description: {
      type: String,
      default: '',
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

// Compound unique index to ensure subcategory name is unique within a category
subCategorySchema.index({ name: 1, category: 1 }, { unique: true });

// Apply the auto-increment plugin
subCategorySchema.plugin(autoIncrementPlugin);

const SubCategory = mongoose.model('SubCategory', subCategorySchema);

module.exports = SubCategory;

