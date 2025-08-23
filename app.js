const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();

// Import routes
const userRoutes = require('./routes/userRoutes');
const productRoutes = require('./routes/productRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const customerRoutes = require('./routes/customerRoutes');
const productJourneyRoutes = require('./routes/productJourneyRoutes');
const salesRoutes = require('./routes/salesRoutes');
const salesJourneyRoutes = require('./routes/salesJourneyRoutes');
const supplierRoutes = require('./routes/supplierRoutes');
const supplierJourneyRoutes = require('./routes/supplierJourneyRoutes');
const supplierPaymentRoutes = require('./routes/supplierPaymentRoutes');
const currencyRoutes = require('./routes/currencyRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const warehouseRoutes = require('./routes/warehouseRoutes');
const stockTransferRoutes = require('./routes/stockTransferRoutes');
const shopRoutes = require('./routes/shopRoutes');

// Initialize express app
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
  origin: '*', // Allow all origins
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(compression()); // Compress all responses
app.use(morgan('dev')); // Log HTTP requests

// Connect to MongoDB
const connectDB = require('./config/db');
connectDB();

// Routes
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/productjourney', productJourneyRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/sales-journey', salesJourneyRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/supplier-journey', supplierJourneyRoutes);
app.use('/api/supplier-payments', supplierPaymentRoutes);
app.use('/api/currencies', currencyRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/warehouses', warehouseRoutes);
app.use('/api/stock-transfers', stockTransferRoutes);
app.use('/api/shops', shopRoutes);

// Root route
app.get('/', (req, res) => {
  res.send('API is running...');
});

// Error handling middleware
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    status: 'error',
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? null : err.stack
  });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app; 