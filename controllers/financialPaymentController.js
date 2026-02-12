const FinancialPayment = require('../models/financialPaymentModel');
const APIFeatures = require('../utils/apiFeatures');

// @desc    Create a new financial payment
// @route   POST /api/financial-payments
// @access  Private
const createFinancialPayment = async (req, res) => {
  try {
    const {
      name,
      mobileNo,
      code,
      description,
      amount,
      paymentDate,
      method,
      relatedModel,
      relatedId,
      isActive,
    } = req.body;

    // Validate user is authenticated
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        status: 'fail',
        message: 'User not authenticated',
      });
    }

    const financialPayment = await FinancialPayment.create({
      name,
      mobileNo,
      code,
      description,
      amount: typeof amount === 'string' ? parseFloat(amount) : amount,
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      method,
      relatedModel,
      relatedId,
      isActive,
      user: req.user._id,
    });

    const populatedPayment = await FinancialPayment.findById(
      financialPayment._id
    )
      .populate('user', 'name email')
      .populate({
        path: 'relatedId',
        select: 'name code description',
      })
      .select('-__v');

    res.status(201).json({
      status: 'success',
      message: 'Financial payment created successfully',
      data: { financialPayment: populatedPayment },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get all financial payments
// @route   GET /api/financial-payments
// @access  Private
const getFinancialPayments = async (req, res) => {
  try {
    const features = new APIFeatures(FinancialPayment.find(), req.query)
      .filter()
      .sort()
      .limitFields()
      .paginate();

    const financialPayments = await features.query
      .populate('user', 'name email')
      .populate({
        path: 'relatedId',
        select: 'name code description',
      })
      .sort({ paymentDate: -1 })
      .select('-__v');

    res.status(200).json({
      status: 'success',
      results: financialPayments.length,
      data: { financialPayments },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get financial payment by ID
// @route   GET /api/financial-payments/:id
// @access  Private
const getFinancialPaymentById = async (req, res) => {
  try {
    const financialPayment = await FinancialPayment.findById(req.params.id)
      .populate('user', 'name email')
      .populate({
        path: 'relatedId',
        select: 'name code description',
      })
      .select('-__v');

    if (!financialPayment) {
      return res.status(404).json({
        status: 'fail',
        message: 'Financial payment not found',
      });
    }

    res.status(200).json({
      status: 'success',
      data: { financialPayment },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Update financial payment
// @route   PUT /api/financial-payments/:id
// @access  Private
const updateFinancialPayment = async (req, res) => {
  try {
    const financialPayment = await FinancialPayment.findById(req.params.id);

    if (!financialPayment) {
      return res.status(404).json({
        status: 'fail',
        message: 'Financial payment not found',
      });
    }

    const {
      name,
      mobileNo,
      code,
      description,
      amount,
      paymentDate,
      method,
      relatedModel,
      relatedId,
      isActive,
    } = req.body;

    if (name !== undefined) financialPayment.name = name;
    if (mobileNo !== undefined) financialPayment.mobileNo = mobileNo;
    if (code !== undefined) financialPayment.code = code;
    if (description !== undefined) financialPayment.description = description;
    if (amount !== undefined) {
      financialPayment.amount =
        typeof amount === 'string' ? parseFloat(amount) : amount;
    }
    if (paymentDate !== undefined) {
      const parsedDate = new Date(paymentDate);
      if (!isNaN(parsedDate.getTime())) {
        financialPayment.paymentDate = parsedDate;
      }
    }
    if (method !== undefined) financialPayment.method = method;
    if (relatedModel !== undefined)
      financialPayment.relatedModel = relatedModel;
    if (relatedId !== undefined) financialPayment.relatedId = relatedId;
    if (isActive !== undefined) financialPayment.isActive = isActive;

    const updatedFinancialPayment = await financialPayment.save();

    const populatedPayment = await FinancialPayment.findById(
      updatedFinancialPayment._id
    )
      .populate('user', 'name email')
      .populate({
        path: 'relatedId',
        select: 'name code description',
      })
      .select('-__v');

    res.status(200).json({
      status: 'success',
      message: 'Financial payment updated successfully',
      data: { financialPayment: populatedPayment },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Delete financial payment
// @route   DELETE /api/financial-payments/:id
// @access  Private
const deleteFinancialPayment = async (req, res) => {
  try {
    const financialPayment = await FinancialPayment.findById(req.params.id);

    if (!financialPayment) {
      return res.status(404).json({
        status: 'fail',
        message: 'Financial payment not found',
      });
    }

    await FinancialPayment.findByIdAndDelete(req.params.id);

    res.status(200).json({
      status: 'success',
      message: 'Financial payment deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get financial payments by related model and id
// @route   GET /api/financial-payments/related/:relatedModel/:relatedId
// @access  Private
const getFinancialPaymentsByRelated = async (req, res) => {
  try {
    const { relatedModel, relatedId } = req.params;

    const allowedModels = [
      'Asset',
      'Income',
      'Liability',
      'PartnershipAccount',
      'CashBook',
      'Capital',
      'Owner',
      'Employee',
      'PropertyAccount',
    ];

    if (!allowedModels.includes(relatedModel)) {
      return res.status(400).json({
        status: 'fail',
        message: `Invalid relatedModel. Allowed values: ${allowedModels.join(
          ', '
        )}`,
      });
    }

    const payments = await FinancialPayment.find({
      relatedModel,
      relatedId,
    })
      .populate('user', 'name email')
      .populate({
        path: 'relatedId',
        select: 'name code description',
      })
      .sort({ paymentDate: -1 })
      .select('-__v');

    const totalAmount = payments.reduce(
      (sum, payment) => sum + (payment.amount || 0),
      0
    );

    res.status(200).json({
      status: 'success',
      results: payments.length,
      totalAmount,
      data: { financialPayments: payments },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

module.exports = {
  createFinancialPayment,
  getFinancialPayments,
  getFinancialPaymentById,
  updateFinancialPayment,
  deleteFinancialPayment,
  getFinancialPaymentsByRelated,
};


