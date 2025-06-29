const Customer = require('../models/customerModel');

// @desc    Create a new customer
// @route   POST /api/customers
// @access  Private
const createCustomer = async (req, res) => {
  try {
    const { name, email, phoneNumber, address, customerType } = req.body;

    // Check if customer already exists with the same email
    const customerExists = await Customer.findOne({ email });
    if (customerExists) {
      return res.status(400).json({
        status: 'fail',
        message: 'Customer with this email already exists',
      });
    }

    // Create new customer
    const customer = await Customer.create({
      name,
      email,
      phoneNumber,
      address,
      customerType,
    });

    if (customer) {
      res.status(201).json({
        status: 'success',
        data: customer,
      });
    } else {
      res.status(400).json({
        status: 'fail',
        message: 'Invalid customer data',
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get all customers
// @route   GET /api/customers
// @access  Private
const getCustomers = async (req, res) => {
  try {
    const customers = await Customer.find({});
    res.json({
      status: 'success',
      results: customers.length,
      data: customers,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get customer by ID
// @route   GET /api/customers/:id
// @access  Private
const getCustomerById = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);

    if (customer) {
      res.json({
        status: 'success',
        data: customer,
      });
    } else {
      res.status(404).json({
        status: 'fail',
        message: 'Customer not found',
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Update customer by ID
// @route   PUT /api/customers/:id
// @access  Private
const updateCustomer = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);

    if (customer) {
      customer.name = req.body.name || customer.name;
      customer.email = req.body.email || customer.email;
      customer.phoneNumber = req.body.phoneNumber || customer.phoneNumber;
      customer.address = req.body.address || customer.address;
      customer.customerType = req.body.customerType || customer.customerType;

      const updatedCustomer = await customer.save();

      res.json({
        status: 'success',
        data: updatedCustomer,
      });
    } else {
      res.status(404).json({
        status: 'fail',
        message: 'Customer not found',
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Delete customer
// @route   DELETE /api/customers/:id
// @access  Private
const deleteCustomer = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);

    if (customer) {
      await Customer.deleteOne({ _id: req.params.id });
      res.json({
        status: 'success',
        message: 'Customer removed',
      });
    } else {
      res.status(404).json({
        status: 'fail',
        message: 'Customer not found',
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
  createCustomer,
  getCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
}; 