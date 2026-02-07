const Customer = require('../models/customerModel');

// @desc    Create a new customer
// @route   POST /api/customers
// @access  Private
const createCustomer = async (req, res) => {
  try {
    const { name, email, phoneNumber, cnicNumber, address, customerType, manager, country, state, city, deliveryAddress } = req.body;

    // Check if customer already exists with the same email (only if email is provided and not null/empty)
    // This prevents null/empty emails from being treated as duplicates
    if (email && email !== null && email !== undefined && typeof email === 'string' && email.trim() !== '') {
      const normalizedEmail = email.trim().toLowerCase();
      const customerExists = await Customer.findOne({ 
        email: normalizedEmail 
      });
      if (customerExists) {
        return res.status(400).json({
          status: 'fail',
          message: 'Customer with this email already exists',
        });
      }
    }

    // Prepare customer data - convert empty strings to null for all optional fields
    const customerData = {
      name: name && name.trim() !== '' ? name.trim() : null,
      email: email && email !== null && email !== undefined && typeof email === 'string' && email.trim() !== '' 
        ? email.trim().toLowerCase() 
        : null,
      phoneNumber: phoneNumber && phoneNumber.trim() !== '' ? phoneNumber.trim() : null,
      cnicNumber: cnicNumber && cnicNumber.trim() !== '' ? cnicNumber.trim() : null,
      address: address && address.trim() !== '' ? address.trim() : null,
      customerType: customerType && customerType.trim() !== '' ? customerType.trim() : null,
      manager: manager && manager.trim() !== '' ? manager.trim() : null,
      country: country && country.trim() !== '' ? country.trim() : null,
      state: state && state.trim() !== '' ? state.trim() : null,
      city: city && city.trim() !== '' ? city.trim() : null,
      deliveryAddress: deliveryAddress && deliveryAddress.trim() !== '' ? deliveryAddress.trim() : null,
    };

    // Create new customer
    const customer = await Customer.create(customerData);

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
      // Update email if provided - allow null/empty values
      if (req.body.email !== undefined) {
        // Check for duplicate email (only if email is provided and not null/empty)
        if (req.body.email && req.body.email !== null && typeof req.body.email === 'string' && req.body.email.trim() !== '') {
          const emailToCheck = req.body.email.trim().toLowerCase();
          const existingCustomer = await Customer.findOne({ 
            email: emailToCheck,
            _id: { $ne: req.params.id } // Exclude current customer
          });
          if (existingCustomer) {
            return res.status(400).json({
              status: 'fail',
              message: 'Customer with this email already exists',
            });
          }
          customer.email = emailToCheck;
        } else {
          // Set email to null if empty or null
          customer.email = null;
        }
      }

      // Update optional fields - convert empty strings to null
      if (req.body.name !== undefined) {
        customer.name = req.body.name && req.body.name.trim() !== '' ? req.body.name.trim() : null;
      }
      if (req.body.phoneNumber !== undefined) {
        customer.phoneNumber = req.body.phoneNumber && req.body.phoneNumber.trim() !== '' ? req.body.phoneNumber.trim() : null;
      }
      if (req.body.cnicNumber !== undefined) {
        customer.cnicNumber = req.body.cnicNumber && req.body.cnicNumber.trim() !== '' ? req.body.cnicNumber.trim() : null;
      }
      if (req.body.address !== undefined) {
        customer.address = req.body.address && req.body.address.trim() !== '' ? req.body.address.trim() : null;
      }
      if (req.body.customerType !== undefined) {
        customer.customerType = req.body.customerType && req.body.customerType.trim() !== '' ? req.body.customerType.trim() : null;
      }
      if (req.body.manager !== undefined) {
        customer.manager = req.body.manager && req.body.manager.trim() !== '' ? req.body.manager.trim() : null;
      }
      if (req.body.country !== undefined) {
        customer.country = req.body.country && req.body.country.trim() !== '' ? req.body.country.trim() : null;
      }
      if (req.body.state !== undefined) {
        customer.state = req.body.state && req.body.state.trim() !== '' ? req.body.state.trim() : null;
      }
      if (req.body.city !== undefined) {
        customer.city = req.body.city && req.body.city.trim() !== '' ? req.body.city.trim() : null;
      }
      if (req.body.deliveryAddress !== undefined) {
        customer.deliveryAddress = req.body.deliveryAddress && req.body.deliveryAddress.trim() !== '' ? req.body.deliveryAddress.trim() : null;
      }

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