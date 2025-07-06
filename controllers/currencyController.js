const Currency = require('../models/currencyModel');

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
    const { name, symbol, isActive, code } = req.body;

    // Check if currency already exists
    const currencyExists = await Currency.findOne({ name });
    
    if (currencyExists) {
      return res.status(400).json({
        status: 'fail',
        message: 'Currency with this name already exists',
      });
    }

    const currency = new Currency({
      name,
      symbol,
      isActive: isActive !== undefined ? isActive : true,
      code: code || name.substring(0, 3).toUpperCase(),
    });

    const createdCurrency = await currency.save();

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
    const { name, symbol, isActive, code } = req.body;

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

    // Update currency info
    currency.name = name || currency.name;
    currency.symbol = symbol || currency.symbol;
    currency.isActive = isActive !== undefined ? isActive : currency.isActive;
    
    // Update code if provided, otherwise keep existing or generate from name if name changed
    if (code) {
      currency.code = code;
    } else if (name && name !== currency.name && !currency.code) {
      currency.code = name.substring(0, 3).toUpperCase();
    }

    const updatedCurrency = await currency.save();

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

// @desc    Get default currency
// @route   GET /api/currencies/default
// @access  Public
const getDefaultCurrency = async (req, res) => {
  try {
    const defaultCurrency = await Currency.findOne({ isDefault: true });

    if (defaultCurrency) {
      res.json({
        status: 'success',
        data: defaultCurrency,
      });
    } else {
      res.status(404).json({
        status: 'fail',
        message: 'No default currency found',
      });
    }
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
  getDefaultCurrency
}; 