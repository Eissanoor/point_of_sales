const Employee = require('../models/employeeModel');
const APIFeatures = require('../utils/apiFeatures');

// @desc    Create a new employee
// @route   POST /api/employees
// @access  Private
const createEmployee = async (req, res) => {
  try {
    const { name, phoneNumber, position, salary } = req.body;

    const employee = await Employee.create({
      name,
      phoneNumber,
      position,
      salary: typeof salary === 'string' ? parseFloat(salary) : salary,
    });

    res.status(201).json({
      status: 'success',
      message: 'Employee created successfully',
      data: { employee },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get all employees
// @route   GET /api/employees
// @access  Private
const getEmployees = async (req, res) => {
  try {
    const features = new APIFeatures(Employee.find(), req.query)
      .filter()
      .sort()
      .limitFields()
      .paginate();

    const employees = await features.query.select('-__v');

    res.status(200).json({
      status: 'success',
      results: employees.length,
      data: { employees },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get employee by ID
// @route   GET /api/employees/:id
// @access  Private
const getEmployeeById = async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id).select('-__v');

    if (!employee) {
      return res.status(404).json({
        status: 'fail',
        message: 'Employee not found',
      });
    }

    res.status(200).json({
      status: 'success',
      data: { employee },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Update employee
// @route   PUT /api/employees/:id
// @access  Private
const updateEmployee = async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id);

    if (!employee) {
      return res.status(404).json({
        status: 'fail',
        message: 'Employee not found',
      });
    }

    const { name, phoneNumber, position, salary, isActive } = req.body;

    if (name !== undefined) employee.name = name;
    if (phoneNumber !== undefined) employee.phoneNumber = phoneNumber;
    if (position !== undefined) employee.position = position;
    if (salary !== undefined) {
      employee.salary =
        typeof salary === 'string' ? parseFloat(salary) : salary;
    }
    if (isActive !== undefined) employee.isActive = isActive;

    const updatedEmployee = await employee.save();

    res.status(200).json({
      status: 'success',
      message: 'Employee updated successfully',
      data: { employee: updatedEmployee },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Delete employee
// @route   DELETE /api/employees/:id
// @access  Private
const deleteEmployee = async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id);

    if (!employee) {
      return res.status(404).json({
        status: 'fail',
        message: 'Employee not found',
      });
    }

    await Employee.findByIdAndDelete(req.params.id);

    res.status(200).json({
      status: 'success',
      message: 'Employee deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

module.exports = {
  createEmployee,
  getEmployees,
  getEmployeeById,
  updateEmployee,
  deleteEmployee,
};

