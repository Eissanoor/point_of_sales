const Currency = require('../models/currencyModel');
const ExchangeRateHistory = require('../models/exchangeRateHistoryModel');

/**
 * Convert amount from one currency to another
 * @param {string} fromCurrencyId - Source currency ID
 * @param {string} toCurrencyId - Target currency ID
 * @param {number} amount - Amount to convert
 * @param {Date} date - Optional date for historical conversion
 * @returns {Promise<Object>} - Conversion result
 */
const convertAmount = async (fromCurrencyId, toCurrencyId, amount, date = null) => {
  if (!fromCurrencyId || !toCurrencyId || amount === undefined) {
    throw new Error('Missing required parameters: fromCurrencyId, toCurrencyId, amount');
  }

  const amountNum = parseFloat(amount);
  if (isNaN(amountNum)) {
    throw new Error('Amount must be a valid number');
  }

  // Get the currencies
  const fromCurrency = await Currency.findById(fromCurrencyId);
  const toCurrency = await Currency.findById(toCurrencyId);

  if (!fromCurrency || !toCurrency) {
    throw new Error('One or both currencies not found');
  }

  // Get base currency
  const baseCurrency = await Currency.findOne({ isBaseCurrency: true });
  if (!baseCurrency) {
    throw new Error('Base currency not found. Please set a base currency first.');
  }

  // If a specific date is provided, get historical rates
  let fromRate = fromCurrency.exchangeRate;
  let toRate = toCurrency.exchangeRate;

  if (date) {
    const historyDate = new Date(date);
    
    // Get historical rate for fromCurrency
    const fromCurrencyHistory = await ExchangeRateHistory.findOne({
      currency: fromCurrencyId,
      effectiveDate: { $lte: historyDate }
    }).sort({ effectiveDate: -1 });

    // Get historical rate for toCurrency
    const toCurrencyHistory = await ExchangeRateHistory.findOne({
      currency: toCurrencyId,
      effectiveDate: { $lte: historyDate }
    }).sort({ effectiveDate: -1 });

    // Use historical rates if available
    if (fromCurrencyHistory) {
      fromRate = fromCurrencyHistory.newRate;
    }
    
    if (toCurrencyHistory) {
      toRate = toCurrencyHistory.newRate;
    }
  }

  // Perform conversion
  let convertedAmount;
  
  if (fromCurrency.isBaseCurrency) {
    // Direct conversion from base to target
    convertedAmount = amountNum * toRate;
  } else if (toCurrency.isBaseCurrency) {
    // Direct conversion from source to base
    convertedAmount = amountNum / fromRate;
  } else {
    // Convert to base first, then to target
    const amountInBase = amountNum / fromRate;
    convertedAmount = amountInBase * toRate;
  }

  return {
    from: {
      currency: fromCurrency,
      amount: amountNum
    },
    to: {
      currency: toCurrency,
      amount: convertedAmount
    },
    rate: toRate / fromRate,
    formula: `${amountNum} ${fromCurrency.code} × (${toRate} / ${fromRate}) = ${convertedAmount.toFixed(2)} ${toCurrency.code}`,
    date: date ? new Date(date) : new Date()
  };
};

/**
 * Get exchange rate between two currencies
 * @param {string} fromCurrencyId - Source currency ID
 * @param {string} toCurrencyId - Target currency ID
 * @param {Date} date - Optional date for historical rate
 * @returns {Promise<number>} - Exchange rate
 */
const getExchangeRate = async (fromCurrencyId, toCurrencyId, date = null) => {
  if (!fromCurrencyId || !toCurrencyId) {
    throw new Error('Missing required parameters: fromCurrencyId, toCurrencyId');
  }

  // Get the currencies
  const fromCurrency = await Currency.findById(fromCurrencyId);
  const toCurrency = await Currency.findById(toCurrencyId);

  if (!fromCurrency || !toCurrency) {
    throw new Error('One or both currencies not found');
  }

  // If a specific date is provided, get historical rates
  let fromRate = fromCurrency.exchangeRate;
  let toRate = toCurrency.exchangeRate;

  if (date) {
    const historyDate = new Date(date);
    
    // Get historical rate for fromCurrency
    const fromCurrencyHistory = await ExchangeRateHistory.findOne({
      currency: fromCurrencyId,
      effectiveDate: { $lte: historyDate }
    }).sort({ effectiveDate: -1 });

    // Get historical rate for toCurrency
    const toCurrencyHistory = await ExchangeRateHistory.findOne({
      currency: toCurrencyId,
      effectiveDate: { $lte: historyDate }
    }).sort({ effectiveDate: -1 });

    // Use historical rates if available
    if (fromCurrencyHistory) {
      fromRate = fromCurrencyHistory.newRate;
    }
    
    if (toCurrencyHistory) {
      toRate = toCurrencyHistory.newRate;
    }
  }

  // Calculate exchange rate
  return toRate / fromRate;
};

/**
 * Format amount with currency symbol
 * @param {number} amount - Amount to format
 * @param {Object} currency - Currency object
 * @returns {string} - Formatted amount with currency symbol
 */
const formatAmountWithCurrency = (amount, currency) => {
  if (!currency) {
    return amount.toFixed(2);
  }
  
  return `${currency.symbol} ${amount.toFixed(2)}`;
};

module.exports = {
  convertAmount,
  getExchangeRate,
  formatAmountWithCurrency
};
