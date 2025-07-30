const Customer = require('../models/customerModel');

// @desc    Create a new customer
// @route   POST /api/customers
// @access  Private
const createCustomer = async (req, res) => {
  try {
    const { name, email, phoneNumber, cnicNumber, address, customerType, manager, country, state, city, deliveryAddress } = req.body;

    // Check if customer already exists with the same email
    const customerExists = await Customer.findOne({ name });
    if (customerExists) {
      return res.status(400).json({
        status: 'fail',
        message: 'Customer with this name already exists',
      });
    }

    // Create new customer
    const customer = await Customer.create({
      name,
      email,
      phoneNumber,
      cnicNumber,
      address,
      customerType,
      manager,
      country,
      state,
      city,
      deliveryAddress,
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

// @desc    Get all customers or search customers by name, email, or phoneNumber with pagination
// @route   GET /api/customers
// @access  Private
const getCustomers = async (req, res) => {
  try {
    const { search, page = 1, limit = 10 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    let query = {};

    // If search parameter exists, create a search query
    if (search) {
      query = {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { phoneNumber: { $regex: search, $options: 'i' } },
          { cnicNumber: { $regex: search, $options: 'i' } },
          { manager: { $regex: search, $options: 'i' } },
          { country: { $regex: search, $options: 'i' } },
          { city: { $regex: search, $options: 'i' } },
        ],
      };
    }

    // Count total documents for pagination info
    const totalCustomers = await Customer.countDocuments(query);

    // Find customers based on query with pagination
    const customers = await Customer.find(query)
      .limit(limitNum)
      .skip(skip)
      .sort({ createdAt: -1 });
    
    res.json({
      status: 'success',
      results: customers.length,
      totalPages: Math.ceil(totalCustomers / limitNum),
      currentPage: pageNum,
      totalCustomers,
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
      customer.cnicNumber = req.body.cnicNumber || customer.cnicNumber;
      customer.address = req.body.address || customer.address;
      customer.customerType = req.body.customerType || customer.customerType;
      customer.manager = req.body.manager || customer.manager;
      customer.country = req.body.country || customer.country;
      customer.state = req.body.state || customer.state;
      customer.city = req.body.city || customer.city;
      customer.deliveryAddress = req.body.deliveryAddress || customer.deliveryAddress;

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