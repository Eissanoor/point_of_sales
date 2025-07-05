const mongoose = require('mongoose');

// Define the Counter model outside the plugin to ensure it's only defined once
let Counter;
try {
  // Try to get the model if it already exists
  Counter = mongoose.model('Counter');
} catch (error) {
  // If the model doesn't exist, create it
  const CounterSchema = new mongoose.Schema({
    model: { type: String, required: true, unique: true },
    count: { type: Number, default: 0 }
  });
  Counter = mongoose.model('Counter', CounterSchema);
}

/**
 * Auto-increment plugin for Mongoose schemas
 * Adds an auto-incrementing ID field to any schema
 */
function autoIncrementPlugin(schema, options) {
  // Add the 'id' field to the schema
  schema.add({
    id: {
      type: Number,
      unique: true
    }
  });

  // Create a pre-save hook to auto-increment the ID
  schema.pre('save', async function(next) {
    // Skip if the document already has an ID
    if (this.id !== undefined) {
      return next();
    }

    try {
      // Get the model name
      const modelName = this.constructor.modelName;
      
      // Find and update the counter for this model
      const counter = await Counter.findOneAndUpdate(
        { model: modelName },
        { $inc: { count: 1 } },
        { new: true, upsert: true }
      );
      
      // Set the ID to the new count
      this.id = counter.count;
      next();
    } catch (error) {
      next(error);
    }
  });
}

module.exports = autoIncrementPlugin; 