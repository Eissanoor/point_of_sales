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
const subCategoryRoutes = require('./routes/subCategoryRoutes');
const customerRoutes = require('./routes/customerRoutes');
const productJourneyRoutes = require('./routes/productJourneyRoutes');
const salesRoutes = require('./routes/salesRoutes');
const salesJourneyRoutes = require('./routes/salesJourneyRoutes');
const supplierRoutes = require('./routes/supplierRoutes');
const supplierJourneyRoutes = require('./routes/supplierJourneyRoutes');
const supplierPaymentRoutes = require('./routes/supplierPaymentRoutes');
const customerJourneyRoutes = require('./routes/customerJourneyRoutes');
const currencyRoutes = require('./routes/currencyRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const warehouseRoutes = require('./routes/warehouseRoutes');
const stockTransferRoutes = require('./routes/stockTransferRoutes');
const shopRoutes = require('./routes/shopRoutes');
const expenseRoutes = require('./routes/expenseRoutes');
const procurementExpenseRoutes = require('./routes/procurementExpenseRoutes');
const logisticsExpenseRoutes = require('./routes/logisticsExpenseRoutes');
const transporterRoutes = require('./routes/transporterRoutes');
const shipmentRoutes = require('./routes/shipmentRoutes');
const salesDistributionExpenseRoutes = require('./routes/salesDistributionExpenseRoutes');
const warehouseExpenseRoutes = require('./routes/warehouseExpenseRoutes');
const operationalExpenseRoutes = require('./routes/operationalExpenseRoutes');
const miscellaneousExpenseRoutes = require('./routes/miscellaneousExpenseRoutes');
const financialExpenseRoutes = require('./routes/financialExpenseRoutes');
const bankAccountRoutes = require('./routes/bankAccountRoutes');
const bankPaymentVoucherRoutes = require('./routes/bankPaymentVoucherRoutes');
const cashPaymentVoucherRoutes = require('./routes/cashPaymentVoucherRoutes');
const cashBookRoutes = require('./routes/cashBookRoutes');
const capitalRoutes = require('./routes/capitalRoutes');
const assetRoutes = require('./routes/assetRoutes');
const journalPaymentVoucherRoutes = require('./routes/journalPaymentVoucherRoutes');
const openingBalanceVoucherRoutes = require('./routes/openingBalanceVoucherRoutes');
const reconcileBankAccountsVoucherRoutes = require('./routes/reconcileBankAccountsVoucherRoutes');
const bankAccountTransferVoucherRoutes = require('./routes/bankAccountTransferVoucherRoutes');
const sarafEntryVoucherRoutes = require('./routes/sarafEntryVoucherRoutes');
const purchaseRoutes = require('./routes/purchaseRoutes');
const quantityUnitRoutes = require('./routes/quantityUnitRoutes');
const packingUnitRoutes = require('./routes/packingUnitRoutes');
const pochuesRoutes = require('./routes/pochuesRoutes');
const productDamageRoutes = require('./routes/productDamageRoutes');
const productReturnRoutes = require('./routes/productReturnRoutes');
const ownerRoutes = require('./routes/ownerRoutes');
const partnershipAccountRoutes = require('./routes/partnershipAccountRoutes');
const incomeRoutes = require('./routes/incomeRoutes');
const propertyAccountRoutes = require('./routes/propertyAccountRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const liabilityRoutes = require('./routes/liabilityRoutes');

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
app.use('/api/subcategories', subCategoryRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/productjourney', productJourneyRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/sales-journey', salesJourneyRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/supplier-journey', supplierJourneyRoutes);
app.use('/api/supplier-payments', supplierPaymentRoutes);
app.use('/api/customer-journey', customerJourneyRoutes);
app.use('/api/currencies', currencyRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/warehouses', warehouseRoutes);
app.use('/api/stock-transfers', stockTransferRoutes);
app.use('/api/shops', shopRoutes);
// Specific expense routes first
app.use('/api/expenses/procurement', procurementExpenseRoutes);
app.use('/api/expenses/logistics', logisticsExpenseRoutes);
app.use('/api/expenses/sales-distribution', salesDistributionExpenseRoutes);
app.use('/api/expenses/warehouse', warehouseExpenseRoutes);
app.use('/api/expenses/operational', operationalExpenseRoutes);
app.use('/api/expenses/miscellaneous', miscellaneousExpenseRoutes);
app.use('/api/expenses/financial', financialExpenseRoutes);

// General expense routes after specific ones
app.use('/api/expenses', expenseRoutes);

// Other routes
app.use('/api/transporters', transporterRoutes);
app.use('/api/shipments', shipmentRoutes);
app.use('/api/bank-accounts', bankAccountRoutes);
app.use('/api/bank-payment-vouchers', bankPaymentVoucherRoutes);
app.use('/api/cash-payment-vouchers', cashPaymentVoucherRoutes);
app.use('/api/cash-books', cashBookRoutes);
app.use('/api/capitals', capitalRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/journal-payment-vouchers', journalPaymentVoucherRoutes);
app.use('/api/opening-balance-vouchers', openingBalanceVoucherRoutes);
app.use('/api/reconcile-bank-accounts-vouchers', reconcileBankAccountsVoucherRoutes);
app.use('/api/bank-account-transfer-vouchers', bankAccountTransferVoucherRoutes);
app.use('/api/saraf-entry-vouchers', sarafEntryVoucherRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/quantity-units', quantityUnitRoutes);
app.use('/api/packing-units', packingUnitRoutes);
app.use('/api/pochues', pochuesRoutes);
app.use('/api/product-damages', productDamageRoutes);
app.use('/api/product-returns', productReturnRoutes);
app.use('/api/owners', ownerRoutes);
app.use('/api/partnership-accounts', partnershipAccountRoutes);
app.use('/api/incomes', incomeRoutes);
app.use('/api/property-accounts', propertyAccountRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/liabilities', liabilityRoutes);

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