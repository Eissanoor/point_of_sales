const Currency = require('../models/currencyModel');
const ExchangeRateHistory = require('../models/exchangeRateHistoryModel');

// @desc    Fetch all currencies
// @route   GET /api/currencies
// @access  Public
const getCurrencies = async (req, res) => {
  try {
    const currencies = await Currency.find({});

    res.json({
      status: 'success',
      results: currencies.length,
      data: currencies,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Fetch single currency
// @route   GET /api/currencies/:id
// @access  Public
const getCurrencyById = async (req, res) => {
  try {
    const currency = await Currency.findById(req.params.id);

    if (currency) {
      res.json({
        status: 'success',
        data: currency,
      });
    } else {
      res.status(404).json({
        status: 'fail',
        message: 'Currency not found',
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Create a currency
// @route   POST /api/currencies
// @access  Private/Admin
const createCurrency = async (req, res) => {
  try {
    const { name, symbol, isActive, code, exchangeRate, isBaseCurrency } = req.body;

    // Check if currency already exists
    const currencyExists = await Currency.findOne({ name });
    
    if (currencyExists) {
      return res.status(400).json({
        status: 'fail',
        message: 'Currency with this name already exists',
      });
    }

    // If this is set as base currency, check if another base currency exists
    if (isBaseCurrency) {
      const existingBaseCurrency = await Currency.findOne({ isBaseCurrency: true });
      
      if (existingBaseCurrency) {
        return res.status(400).json({
          status: 'fail',
          message: 'A base currency already exists. Please update the existing base currency instead.',
        });
      }
    }

    const currency = new Currency({
      name,
      symbol,
      exchangeRate: exchangeRate || 1,
      isBaseCurrency: isBaseCurrency || false,
      isActive: isActive !== undefined ? isActive : true,
      code: code || name.substring(0, 3).toUpperCase(),
    });

    const createdCurrency = await currency.save();

    // Create exchange rate history record if not base currency
    if (!isBaseCurrency && exchangeRate) {
      const exchangeRateHistory = new ExchangeRateHistory({
        currency: createdCurrency._id,
        previousRate: exchangeRate, // Initial rate, so previous = new
        newRate: exchangeRate,
        user: req.user._id,
        notes: 'Initial exchange rate set during currency creation',
      });
      
      await exchangeRateHistory.save();
    }

    res.status(201).json({
      status: 'success',
      data: createdCurrency,
      message: 'Currency created successfully',
    });
  } catch (error) {
    if (error.code === 11000 && error.keyPattern && error.keyPattern.code) {
      return res.status(400).json({
        status: 'fail',
        message: 'Currency with this code already exists. Please provide a unique code.',
      });
    }
    
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Update a currency
// @route   PUT /api/currencies/:id
// @access  Private/Admin
const updateCurrency = async (req, res) => {
  try {
    const { name, symbol, isActive, code, exchangeRate, isBaseCurrency, notes } = req.body;

    const currency = await Currency.findById(req.params.id);

    if (!currency) {
      return res.status(404).json({
        status: 'fail',
        message: 'Currency not found',
      });
    }

    // If updating name, check if it already exists
    if (name && name !== currency.name) {
      const currencyExists = await Currency.findOne({
        name,
        _id: { $ne: req.params.id }
      });

      if (currencyExists) {
        return res.status(400).json({
          status: 'fail',
          message: 'Currency with this name already exists',
        });
      }
    }

    // If updating code, check if it already exists
    if (code && code !== currency.code) {
      const codeExists = await Currency.findOne({
        code,
        _id: { $ne: req.params.id }
      });

      if (codeExists) {
        return res.status(400).json({
          status: 'fail',
          message: 'Currency with this code already exists',
        });
      }
    }

    // If changing to base currency, check if another base currency exists
    if (isBaseCurrency && !currency.isBaseCurrency) {
      const existingBaseCurrency = await Currency.findOne({ 
        isBaseCurrency: true,
        _id: { $ne: req.params.id }
      });
      
      if (existingBaseCurrency) {
        return res.status(400).json({
          status: 'fail',
          message: 'A base currency already exists. Please update the existing base currency first.',
        });
      }
    }

    // Check if exchange rate is being updated
    const isExchangeRateUpdated = exchangeRate !== undefined && 
                                 exchangeRate !== currency.exchangeRate;

    // Store previous exchange rate for history
    const previousExchangeRate = currency.exchangeRate;

    // Update currency info
    currency.name = name || currency.name;
    currency.symbol = symbol || currency.symbol;
    currency.isActive = isActive !== undefined ? isActive : currency.isActive;
    currency.isBaseCurrency = isBaseCurrency !== undefined ? isBaseCurrency : currency.isBaseCurrency;
    
    // If it's the base currency, always set exchange rate to 1
    if (currency.isBaseCurrency) {
      currency.exchangeRate = 1;
    } else if (exchangeRate !== undefined) {
      currency.exchangeRate = exchangeRate;
    }
    
    // Update code if provided, otherwise keep existing or generate from name if name changed
    if (code) {
      currency.code = code;
    } else if (name && name !== currency.name && !currency.code) {
      currency.code = name.substring(0, 3).toUpperCase();
    }

    const updatedCurrency = await currency.save();

    // Create exchange rate history record if exchange rate was updated
    if (isExchangeRateUpdated) {
      const exchangeRateHistory = new ExchangeRateHistory({
        currency: updatedCurrency._id,
        previousRate: previousExchangeRate,
        newRate: updatedCurrency.exchangeRate,
        user: req.user._id,
        notes: notes || 'Exchange rate updated',
      });
      
      await exchangeRateHistory.save();
    }

    res.json({
      status: 'success',
      data: updatedCurrency,
      message: 'Currency updated successfully',
    });
  } catch (error) {
    // Handle duplicate key error specifically
    if (error.code === 11000 && error.keyPattern && error.keyPattern.code) {
      return res.status(400).json({
        status: 'fail',
        message: 'Currency with this code already exists. Please provide a unique code.',
      });
    }
    
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Delete a currency
// @route   DELETE /api/currencies/:id
// @access  Private/Admin
const deleteCurrency = async (req, res) => {
  try {
    const currency = await Currency.findById(req.params.id);

    if (currency) {
      await Currency.deleteOne({ _id: req.params.id });
      
      res.json({
        status: 'success',
        message: 'Currency removed',
      });
    } else {
      res.status(404).json({
        status: 'fail',
        message: 'Currency not found',
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get base currency
// @route   GET /api/currencies/base
// @access  Public
const getBaseCurrency = async (req, res) => {
  try {
    const baseCurrency = await Currency.findOne({ isBaseCurrency: true });

    if (baseCurrency) {
      res.json({
        status: 'success',
        data: baseCurrency,
      });
    } else {
      res.status(404).json({
        status: 'fail',
        message: 'No base currency found',
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get exchange rate history for a currency
// @route   GET /api/currencies/:id/exchange-history
// @access  Private
const getExchangeRateHistory = async (req, res) => {
  try {
    const currency = await Currency.findById(req.params.id);

    if (!currency) {
      return res.status(404).json({
        status: 'fail',
        message: 'Currency not found',
      });
    }

    const history = await ExchangeRateHistory.find({ currency: req.params.id })
      .sort({ effectiveDate: -1 })
      .populate('user', 'name email');

    res.json({
      status: 'success',
      results: history.length,
      data: history,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Update exchange rate for a currency
// @route   POST /api/currencies/:id/exchange-rate
// @access  Private/Admin
const updateExchangeRate = async (req, res) => {
  try {
    const { exchangeRate, notes } = req.body;
    
    if (!exchangeRate) {
      return res.status(400).json({
        status: 'fail',
        message: 'Please provide an exchange rate',
      });
    }

    const currency = await Currency.findById(req.params.id);

    if (!currency) {
      return res.status(404).json({
        status: 'fail',
        message: 'Currency not found',
      });
    }

    // Don't allow updating exchange rate for base currency
    if (currency.isBaseCurrency) {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot update exchange rate for base currency',
      });
    }

    // Store previous exchange rate for history
    const previousExchangeRate = currency.exchangeRate;

    // Update currency exchange rate
    currency.exchangeRate = exchangeRate;
    const updatedCurrency = await currency.save();

    // Create exchange rate history record
    const exchangeRateHistory = new ExchangeRateHistory({
      currency: updatedCurrency._id,
      previousRate: previousExchangeRate,
      newRate: updatedCurrency.exchangeRate,
      user: req.user._id,
      notes: notes || 'Exchange rate updated',
    });
    
    await exchangeRateHistory.save();

    res.json({
      status: 'success',
      data: updatedCurrency,
      message: 'Exchange rate updated successfully',
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get exchange rate at a specific date
// @route   GET /api/currencies/:id/exchange-rate-at-date
// @access  Private
const getExchangeRateAtDate = async (req, res) => {
  try {
    const { date } = req.query;
    
    if (!date) {
      return res.status(400).json({
        status: 'fail',
        message: 'Please provide a date',
      });
    }

    const queryDate = new Date(date);
    
    if (isNaN(queryDate.getTime())) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid date format',
      });
    }

    const currency = await Currency.findById(req.params.id);

    if (!currency) {
      return res.status(404).json({
        status: 'fail',
        message: 'Currency not found',
      });
    }

    // Find the exchange rate history record that was effective at the given date
    const exchangeRateHistory = await ExchangeRateHistory.findOne({
      currency: req.params.id,
      effectiveDate: { $lte: queryDate }
    }).sort({ effectiveDate: -1 });

    if (exchangeRateHistory) {
      res.json({
        status: 'success',
        data: {
          currency: currency,
          exchangeRate: exchangeRateHistory.newRate,
          effectiveDate: exchangeRateHistory.effectiveDate,
        },
      });
    } else {
      // If no history found, return the current exchange rate
      res.json({
        status: 'success',
        data: {
          currency: currency,
          exchangeRate: currency.exchangeRate,
          effectiveDate: null,
          message: 'No historical exchange rate found for this date, returning current rate',
        },
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Convert amount between currencies
// @route   GET /api/currencies/convert
// @access  Public
const convertCurrency = async (req, res) => {
  try {
    const { fromCurrency, toCurrency, amount } = req.query;
    
    if (!fromCurrency || !toCurrency || !amount) {
      return res.status(400).json({
        status: 'fail',
        message: 'Please provide fromCurrency, toCurrency, and amount',
      });
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Amount must be a valid number',
      });
    }

    // Get the currencies
    const fromCurrencyDoc = await Currency.findById(fromCurrency);
    const toCurrencyDoc = await Currency.findById(toCurrency);

    if (!fromCurrencyDoc || !toCurrencyDoc) {
      return res.status(404).json({
        status: 'fail',
        message: 'One or both currencies not found',
      });
    }

    // Get base currency
    const baseCurrency = await Currency.findOne({ isBaseCurrency: true });
    if (!baseCurrency) {
      return res.status(404).json({
        status: 'fail',
        message: 'Base currency not found. Please set a base currency first.',
      });
    }

    // Convert to base currency first, then to target currency
    // If fromCurrency is the base currency, we just multiply by toCurrency's rate
    // If toCurrency is the base currency, we divide by fromCurrency's rate
    // Otherwise, we convert to base first, then to target
    let convertedAmount;
    
    if (fromCurrencyDoc.isBaseCurrency) {
      // Direct conversion from base to target
      convertedAmount = amountNum * toCurrencyDoc.exchangeRate;
    } else if (toCurrencyDoc.isBaseCurrency) {
      // Direct conversion from source to base
      convertedAmount = amountNum / fromCurrencyDoc.exchangeRate;
    } else {
      // Convert to base first, then to target
      const amountInBase = amountNum / fromCurrencyDoc.exchangeRate;
      convertedAmount = amountInBase * toCurrencyDoc.exchangeRate;
    }

    res.json({
      status: 'success',
      data: {
        from: {
          currency: fromCurrencyDoc,
          amount: amountNum
        },
        to: {
          currency: toCurrencyDoc,
          amount: convertedAmount
        },
        rate: toCurrencyDoc.exchangeRate / fromCurrencyDoc.exchangeRate,
        formula: `${amountNum} ${fromCurrencyDoc.code} × (${toCurrencyDoc.exchangeRate} / ${fromCurrencyDoc.exchangeRate}) = ${convertedAmount.toFixed(2)} ${toCurrencyDoc.code}`
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Update multiple exchange rates at once
// @route   POST /api/currencies/bulk-update-rates
// @access  Private/Admin
const bulkUpdateExchangeRates = async (req, res) => {
  try {
    const { rates, notes } = req.body;
    
    if (!rates || !Array.isArray(rates) || rates.length === 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'Please provide an array of rates',
      });
    }

    const baseCurrency = await Currency.findOne({ isBaseCurrency: true });
    if (!baseCurrency) {
      return res.status(404).json({
        status: 'fail',
        message: 'Base currency not found. Please set a base currency first.',
      });
    }

    const results = {
      success: [],
      failed: []
    };

    // Process each rate update
    for (const rateUpdate of rates) {
      const { currencyId, exchangeRate } = rateUpdate;
      
      if (!currencyId || !exchangeRate) {
        results.failed.push({
          currencyId,
          reason: 'Missing currencyId or exchangeRate',
        });
        continue;
      }

      try {
        const currency = await Currency.findById(currencyId);
        
        if (!currency) {
          results.failed.push({
            currencyId,
            reason: 'Currency not found',
          });
          continue;
        }

        // Don't update base currency
        if (currency.isBaseCurrency) {
          results.failed.push({
            currencyId,
            reason: 'Cannot update exchange rate for base currency',
          });
          continue;
        }

        // Store previous exchange rate for history
        const previousExchangeRate = currency.exchangeRate;

        // Update currency exchange rate
        currency.exchangeRate = exchangeRate;
        const updatedCurrency = await currency.save();

        // Create exchange rate history record
        const exchangeRateHistory = new ExchangeRateHistory({
          currency: updatedCurrency._id,
          previousRate: previousExchangeRate,
          newRate: updatedCurrency.exchangeRate,
          user: req.user._id,
          notes: notes || 'Exchange rate updated in bulk update',
        });
        
        await exchangeRateHistory.save();

        results.success.push({
          currency: updatedCurrency,
          previousRate: previousExchangeRate,
          newRate: updatedCurrency.exchangeRate,
        });
      } catch (error) {
        results.failed.push({
          currencyId,
          reason: error.message,
        });
      }
    }

    res.json({
      status: 'success',
      data: results,
      message: `${results.success.length} currencies updated successfully, ${results.failed.length} failed`,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

module.exports = {
  getCurrencies,
  getCurrencyById,
  createCurrency,
  updateCurrency,
  deleteCurrency,
  getBaseCurrency,
  getExchangeRateHistory,
  updateExchangeRate,
  getExchangeRateAtDate,
  convertCurrency,
  bulkUpdateExchangeRates
}; 