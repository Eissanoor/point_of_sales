const CashBook = require('../models/cashBookModel');
const APIFeatures = require('../utils/apiFeatures');

// @desc    Create a new cash book entry
// @route   POST /api/cash-books
// @access  Private
const createCashBook = async (req, res) => {
  try {
    const { name, mobileNo, code, description } = req.body;

    // Validate user is authenticated
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        status: 'fail',
        message: 'User not authenticated',
      });
    }

    const cashBook = await CashBook.create({
      name,
      mobileNo,
      code,
      description,
      user: req.user._id,
    });

    // Populate before sending response
    const populatedCashBook = await CashBook.findById(cashBook._id)
      .populate('user', 'name email')
      .select('-__v');

    res.status(201).json({
      status: 'success',
      message: 'Cash book entry created successfully',
      data: {
        cashBook: populatedCashBook,
      },
    });
  } catch (error) {
    console.error('Error creating cash book entry:', error);
    
    if (error.name === 'ValidationError') {
      const validationErrors = Object.keys(error.errors).map(key => ({
        field: key,
        message: error.errors[key].message,
      }));
      
      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: validationErrors,
      });
    }
    
    if (error.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern)[0];
      return res.status(400).json({
        status: 'error',
        message: `${duplicateField} already exists`,
        field: duplicateField,
      });
    }
    
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get all cash book entries with filtering and pagination
// @route   GET /api/cash-books
// @access  Private
const getCashBooks = async (req, res) => {
  try {
    const features = new APIFeatures(CashBook.find(), req.query)
      .filter()
      .sort()
      .limitFields()
      .paginate();

    const cashBooks = await features.query
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .select('-__v');

    // Build filter query for count
    const queryObj = { ...req.query };
    const excludedFields = ['page', 'sort', 'limit', 'fields'];
    excludedFields.forEach(el => delete queryObj[el]);
    let queryStr = JSON.stringify(queryObj);
    queryStr = queryStr.replace(/\b(gte|gt|lte|lt)\b/g, match => `$${match}`);
    const filterQuery = queryStr ? JSON.parse(queryStr) : {};
    
    const totalCashBooks = await CashBook.countDocuments(filterQuery);

    res.status(200).json({
      status: 'success',
      results: cashBooks.length,
      totalCashBooks,
      data: {
        cashBooks,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get cash book entry by ID
// @route   GET /api/cash-books/:id
// @access  Private
const getCashBookById = async (req, res) => {
  try {
    const cashBook = await CashBook.findById(req.params.id)
      .populate('user', 'name email')
      .select('-__v');

    if (!cashBook) {
      return res.status(404).json({
        status: 'fail',
        message: 'Cash book entry not found',
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        cashBook,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Update cash book entry
// @route   PUT /api/cash-books/:id
// @access  Private
const updateCashBook = async (req, res) => {
  try {
    const cashBook = await CashBook.findById(req.params.id);

    if (!cashBook) {
      return res.status(404).json({
        status: 'fail',
        message: 'Cash book entry not found',
      });
    }

    const { name, mobileNo, code, description, isActive } = req.body;

    // Update fields
    if (name !== undefined) cashBook.name = name;
    if (mobileNo !== undefined) cashBook.mobileNo = mobileNo;
    if (code !== undefined) cashBook.code = code;
    if (description !== undefined) cashBook.description = description;
    if (isActive !== undefined) cashBook.isActive = isActive;

    const updatedCashBook = await cashBook.save();

    // Populate before sending response
    const populatedCashBook = await CashBook.findById(updatedCashBook._id)
      .populate('user', 'name email')
      .select('-__v');

    res.status(200).json({
      status: 'success',
      message: 'Cash book entry updated successfully',
      data: {
        cashBook: populatedCashBook,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Delete cash book entry
// @route   DELETE /api/cash-books/:id
// @access  Private
const deleteCashBook = async (req, res) => {
  try {
    const cashBook = await CashBook.findById(req.params.id);

    if (!cashBook) {
      return res.status(404).json({
        status: 'fail',
        message: 'Cash book entry not found',
      });
    }

    await CashBook.findByIdAndDelete(req.params.id);

    res.status(200).json({
      status: 'success',
      message: 'Cash book entry deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

module.exports = {
  createCashBook,
  getCashBooks,
  getCashBookById,
  updateCashBook,
  deleteCashBook,
};
