const mongoose = require('mongoose');

// Define the ReferCodeCounter model
let ReferCodeCounter;
try {
  ReferCodeCounter = mongoose.model('ReferCodeCounter');
} catch (error) {
  const ReferCodeCounterSchema = new mongoose.Schema({
    model: { type: String, required: true, unique: true },
    count: { type: Number, default: 0 }
  });
  ReferCodeCounter = mongoose.model('ReferCodeCounter', ReferCodeCounterSchema);
}

// Mapping of model names to their referCode prefixes
const REFER_CODE_PREFIXES = {
  'Product': 'PR',
  'Supplier': 'SP',
  'Customer': 'CM',
  'Shop': 'SH',
  'Warehouse': 'WH',
  'Purchase': 'PU',
  'BankAccount': 'BK',
  'BankPaymentVoucher': 'BPV',
  'CashPaymentVoucher': 'CPV',
  'JournalPaymentVoucher': 'JV',
  'Expense': 'EX',
  'Sales': 'SA'
};

/**
 * Generate a referCode for a model
 * @param {String} modelName - The name of the model
 * @returns {Promise<String>} - The generated referCode (e.g., PR-0001)
 */
async function generateReferCode(modelName) {
  const prefix = REFER_CODE_PREFIXES[modelName];
  
  if (!prefix) {
    throw new Error(`No referCode prefix defined for model: ${modelName}`);
  }

  try {
    // Find and update the counter for this model
    const counter = await ReferCodeCounter.findOneAndUpdate(
      { model: modelName },
      { $inc: { count: 1 } },
      { new: true, upsert: true }
    );
    
    // Generate referCode with zero-padded number (4 digits)
    const referCode = `${prefix}-${String(counter.count).padStart(4, '0')}`;
    return referCode;
  } catch (error) {
    throw new Error(`Error generating referCode for ${modelName}: ${error.message}`);
  }
}

module.exports = { generateReferCode, REFER_CODE_PREFIXES };

