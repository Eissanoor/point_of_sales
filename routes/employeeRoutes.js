const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const {
  getEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deleteEmployee,
} = require('../controllers/employeeController');

// @route   GET /api/employees
// @desc    Get all employees
// @access  Private
router.route('/').get(protect, getEmployees);

// @route   POST /api/employees
// @desc    Create new employee
// @access  Private
router.route('/').post(protect, createEmployee);

// @route   GET /api/employees/:id
// @desc    Get employee by ID
// @access  Private
router.route('/:id').get(protect, getEmployeeById);

// @route   PUT /api/employees/:id
// @desc    Update employee
// @access  Private
router.route('/:id').put(protect, updateEmployee);

// @route   DELETE /api/employees/:id
// @desc    Delete employee
// @access  Private
router.route('/:id').delete(protect, deleteEmployee);

module.exports = router;

