const ProcurementExpense = require('../models/procurementExpenseModel');
const Supplier = require('../models/supplierModel');
const Product = require('../models/productModel');
const Category = require('../models/categoryModel');
const Currency = require('../models/currencyModel');

// @desc    Fetch all procurement expenses
// @route   GET /api/procurement-expenses
// @access  Private
const getProcurementExpenses = async (req, res) => {
  try {
    const { supplier, category, status, page = 1, limit = 10 } = req.query;
    
    let query = { isActive: true };
    
    if (supplier) query.supplier = supplier;
    if (category) query.productCategory = category;
    if (status) query.paymentStatus = status;
    
    const expenses = await ProcurementExpense.find(query)
      .populate('supplier', 'name email country')
      .populate('productCategory', 'name description')
      .populate('products.product', 'name sku')
      .populate('currency', 'name code symbol')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await ProcurementExpense.countDocuments(query);
    
    res.json({
      status: 'success',
      results: expenses.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      data: expenses
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// @desc    Fetch single procurement expense
// @route   GET /api/procurement-expenses/:id
// @access  Private
const getProcurementExpenseById = async (req, res) => {
  try {
    const expense = await ProcurementExpense.findById(req.params.id)
      .populate('supplier', 'name email phoneNumber country city address')
      .populate('productCategory', 'name description')
      .populate('products.product', 'name sku description')
      .populate('currency', 'name code symbol exchangeRate')
      .populate('linkedShipment', 'shipmentId status');
    
    if (!expense) {
      return res.status(404).json({
        status: 'fail',
        message: 'Procurement expense not found'
      });
    }
    
    res.json({
      status: 'success',
      data: expense
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// @desc    Create procurement expense
// @route   POST /api/procurement-expenses
// @access  Private
const createProcurementExpense = async (req, res) => {
  try {
    const {
      supplier,
      purchaseOrderNo,
      invoiceNo,
      productCategory,
      products,
      currency,
      exchangeRate,
      importDuty,
      packagingCost,
      handlingCost,
      linkedShipment,
      linkedBatch,
      paymentMethod,
      dueDate,
      notes
    } = req.body;
    
    // Validate required fields
    if (!supplier || !invoiceNo || !productCategory || !products || !currency || !paymentMethod) {
      return res.status(400).json({
        status: 'fail',
        message: 'Required fields: supplier, invoiceNo, productCategory, products, currency, paymentMethod'
      });
    }
    
    // Get exchange rate if not provided
    let finalExchangeRate = exchangeRate;
    if (!finalExchangeRate) {
      const currencyDoc = await Currency.findById(currency);
      if (currencyDoc) {
        finalExchangeRate = currencyDoc.exchangeRate;
      }
    }
    
    const procurementExpense = new ProcurementExpense({
      supplier,
      purchaseOrderNo,
      invoiceNo,
      productCategory,
      products,
      currency,
      exchangeRate: finalExchangeRate,
      importDuty: importDuty || 0,
      packagingCost: packagingCost || 0,
      handlingCost: handlingCost || 0,
      linkedShipment,
      linkedBatch,
      paymentMethod,
      dueDate,
      notes
    });
    
    const savedExpense = await procurementExpense.save();
    
    // Populate the response
    const populatedExpense = await ProcurementExpense.findById(savedExpense._id)
      .populate('supplier', 'name email')
      .populate('productCategory', 'name')
      .populate('products.product', 'name sku')
      .populate('currency', 'name code symbol');
    
    res.status(201).json({
      status: 'success',
      data: populatedExpense,
      message: 'Procurement expense created successfully'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// @desc    Update procurement expense
// @route   PUT /api/procurement-expenses/:id
// @access  Private
const updateProcurementExpense = async (req, res) => {
  try {
    const expense = await ProcurementExpense.findById(req.params.id);
    
    if (!expense) {
      return res.status(404).json({
        status: 'fail',
        message: 'Procurement expense not found'
      });
    }
    
    // Update fields
    Object.keys(req.body).forEach(key => {
      if (req.body[key] !== undefined) {
        expense[key] = req.body[key];
      }
    });
    
    const updatedExpense = await expense.save();
    
    res.json({
      status: 'success',
      data: updatedExpense,
      message: 'Procurement expense updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// @desc    Delete procurement expense
// @route   DELETE /api/procurement-expenses/:id
// @access  Private
const deleteProcurementExpense = async (req, res) => {
  try {
    const expense = await ProcurementExpense.findById(req.params.id);
    
    if (!expense) {
      return res.status(404).json({
        status: 'fail',
        message: 'Procurement expense not found'
      });
    }
    
    expense.isActive = false;
    await expense.save();
    
    res.json({
      status: 'success',
      message: 'Procurement expense deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// @desc    Update payment status
// @route   PUT /api/procurement-expenses/:id/payment
// @access  Private
const updatePaymentStatus = async (req, res) => {
  try {
    const { paymentStatus, paidDate } = req.body;
    
    const expense = await ProcurementExpense.findById(req.params.id);
    
    if (!expense) {
      return res.status(404).json({
        status: 'fail',
        message: 'Procurement expense not found'
      });
    }
    
    expense.paymentStatus = paymentStatus;
    if (paymentStatus === 'paid' && paidDate) {
      expense.paidDate = new Date(paidDate);
    }
    
    await expense.save();
    
    res.json({
      status: 'success',
      data: expense,
      message: 'Payment status updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// @desc    Get procurement expenses by supplier
// @route   GET /api/procurement-expenses/supplier/:supplierId
// @access  Private
const getProcurementExpensesBySupplier = async (req, res) => {
  try {
    const expenses = await ProcurementExpense.find({ 
      supplier: req.params.supplierId,
      isActive: true 
    })
      .populate('productCategory', 'name')
      .populate('currency', 'name code symbol')
      .sort({ createdAt: -1 });
    
    const totalAmount = expenses.reduce((sum, expense) => sum + expense.amountInPKR, 0);
    
    res.json({
      status: 'success',
      results: expenses.length,
      totalAmount,
      data: expenses
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

module.exports = {
  getProcurementExpenses,
  getProcurementExpenseById,
  createProcurementExpense,
  updateProcurementExpense,
  deleteProcurementExpense,
  updatePaymentStatus,
  getProcurementExpensesBySupplier
};
