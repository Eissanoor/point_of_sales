const mongoose = require('mongoose');
const Expense = require('../models/expenseModel');
const BankPaymentVoucher = require('../models/bankPaymentVoucherModel');
const FinancialPayment = require('../models/financialPaymentModel');
const {
  EXPENSE_CATEGORY_PAYEE_TYPES,
  EXPENSE_CATEGORY_MODELS,
} = require('../utils/expensePayeeTypes');

require('../models/userModel');
require('../models/currencyModel');
require('../models/supplierModel');
require('../models/transporterModel');
require('../models/warehouseModel');
require('../models/customerModel');
require('../models/bankAccountModel');
require('../models/categoryModel');
require('../models/productModel');
require('../models/shipmentModel');
require('../models/cashBookModel');
require('../models/purchaseModel');
require('../models/salesModel');
require('../models/paymentModel');
require('../models/supplierPaymentModel');

const EXPENSE_PAYEE_TYPES = ['Expense', ...EXPENSE_CATEGORY_PAYEE_TYPES];

const CATEGORY_POPULATE = {
  procurement: [
    { path: 'supplier', select: 'name email phoneNumber country city address' },
    { path: 'productCategory', select: 'name description' },
    { path: 'products.product', select: 'name sku description' },
    { path: 'currency', select: 'name code symbol exchangeRate' },
    { path: 'linkedShipment', select: 'shipmentId status' },
  ],
  logistics: [
    { path: 'transporter', select: 'name contactPerson phoneNumber email address' },
    { path: 'linkedWarehouse', select: 'name location address' },
    { path: 'linkedShipment', select: 'shipmentId batchNo status origin destination' },
    { path: 'currency', select: 'name code symbol exchangeRate' },
  ],
  warehouse: [
    { path: 'warehouse', select: 'name code location address' },
    { path: 'currency', select: 'name code symbol exchangeRate' },
    { path: 'linkedStock', select: 'name code' },
  ],
  sales_distribution: [
    { path: 'salesperson', select: 'name email phoneNumber' },
    { path: 'customer', select: 'name email contactPerson phoneNumber address' },
    { path: 'currency', select: 'name code symbol exchangeRate' },
    { path: 'linkedSalesInvoice', select: 'invoiceNumber totalAmount saleDate' },
  ],
  financial: [
    { path: 'currency', select: 'name code symbol exchangeRate' },
    { path: 'linkedBankAccount', select: 'accountName accountNumber bankName branchName' },
  ],
  operational: [
    { path: 'currency', select: 'name code symbol exchangeRate' },
  ],
  miscellaneous: [
    { path: 'currency', select: 'name code symbol exchangeRate' },
  ],
};

const BANK_VOUCHER_POPULATE = [
  { path: 'bankAccount', select: 'accountName accountNumber bankName branchName branchCode' },
  { path: 'currency', select: 'name code symbol' },
  { path: 'payee', select: 'name email phoneNumber address referCode expenseType totalAmount status' },
  { path: 'user', select: 'name email' },
  { path: 'approvalStatus.approvedBy', select: 'name email' },
  { path: 'relatedPurchase', select: 'invoiceNumber totalAmount' },
  { path: 'relatedSale', select: 'invoiceNumber grandTotal' },
  { path: 'relatedPayment', select: 'paymentNumber amount' },
  { path: 'relatedSupplierPayment', select: 'paymentNumber amount' },
  { path: 'relatedFinancialPayment', select: 'referCode amount paymentDate method relatedModel relatedId' },
  { path: 'relatedFinancialPayments', select: 'referCode amount paymentDate method relatedModel relatedId' },
  { path: 'relatedExpense', select: 'referCode expenseType totalAmount status amountInPKR' },
  { path: 'entries.account' },
  { path: 'entries.bankAccount', select: 'accountName accountNumber bankName' },
  { path: 'entries.cashBook', select: 'name code' },
];

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

const collectPayeeIds = (inputId, expense) => {
  const ids = new Set();
  if (inputId) ids.add(String(inputId));
  if (expense?._id) ids.add(String(expense._id));
  if (expense?.referenceId) ids.add(String(expense.referenceId));
  return [...ids];
};

async function resolveExpenseRecord(id, expenseTypeHint) {
  if (!mongoose.Types.ObjectId.isValid(String(id))) {
    return null;
  }

  let expense = await Expense.findOne({ _id: id, isActive: true }).lean();
  if (expense) {
    return { expense, expenseType: expense.expenseType, referenceId: expense.referenceId };
  }

  expense = await Expense.findOne({ referenceId: id, isActive: true }).lean();
  if (expense) {
    return { expense, expenseType: expense.expenseType, referenceId: expense.referenceId };
  }

  const typesToTry = expenseTypeHint
    ? [expenseTypeHint]
    : EXPENSE_CATEGORY_PAYEE_TYPES;

  for (const type of typesToTry) {
    if (!EXPENSE_CATEGORY_MODELS[type]) continue;

    const detail = await EXPENSE_CATEGORY_MODELS[type].findById(id).lean();
    if (!detail || detail.isActive === false) continue;

    const linkedExpense = await Expense.findOne({
      referenceId: id,
      expenseType: type,
      isActive: true,
    }).lean();

    return {
      expense: linkedExpense,
      expenseType: type,
      referenceId: detail._id,
    };
  }

  return null;
}

async function loadMasterExpense(expense) {
  if (!expense) return null;

  return Expense.findById(expense._id)
    .populate('currency', 'name code symbol exchangeRate')
    .populate('createdBy', 'name email')
    .populate('approvedBy', 'name email')
    .select('-__v')
    .lean();
}

async function loadCategoryDetails(expenseType, referenceId) {
  const CategoryModel = EXPENSE_CATEGORY_MODELS[expenseType];
  if (!CategoryModel || !referenceId) return null;

  let query = CategoryModel.findById(referenceId);
  const populatePaths = CATEGORY_POPULATE[expenseType] || [];
  for (const populateOption of populatePaths) {
    query = query.populate(populateOption);
  }

  return query.select('-__v').lean();
}

async function fetchBankPaymentVouchers(payeeIds) {
  const objectIds = payeeIds
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  if (objectIds.length === 0) return [];

  let query = BankPaymentVoucher.find({
    $or: [
      { relatedExpense: { $in: objectIds } },
      {
        payee: { $in: objectIds },
        payeeType: { $in: EXPENSE_PAYEE_TYPES },
      },
      {
        financialModel: 'Expense',
        financialId: { $in: objectIds },
      },
    ],
  }).sort({ voucherDate: -1, createdAt: -1 });

  for (const populateOption of BANK_VOUCHER_POPULATE) {
    query = query.populate(populateOption);
  }

  return query.select('-__v').lean();
}

async function fetchFinancialPayments(payeeIds) {
  const objectIds = payeeIds
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  if (objectIds.length === 0) return [];

  return FinancialPayment.find({
    relatedModel: 'Expense',
    relatedId: { $in: objectIds },
  })
    .populate('user', 'name email')
    .populate('currency', 'name code symbol')
    .sort({ paymentDate: -1, createdAt: -1 })
    .select('-__v')
    .lean();
}

function buildPaymentSummary(expense, bankPaymentVouchers, financialPayments) {
  const expenseAmount = expense?.amountInPKR ?? expense?.totalAmount ?? 0;
  let paidViaVouchers = 0;
  let paidViaFinancialPayments = 0;

  for (const voucher of bankPaymentVouchers) {
    if (voucher.status === 'cancelled') continue;
    paidViaVouchers = round2(paidViaVouchers + (voucher.amount || 0));
  }

  for (const payment of financialPayments) {
    if (payment.isActive === false) continue;
    if (payment.effect === 'subtract') continue;
    paidViaFinancialPayments = round2(
      paidViaFinancialPayments + (payment.amount || 0)
    );
  }

  const totalPaid = round2(paidViaVouchers + paidViaFinancialPayments);
  const remainingBalance = round2(Math.max(0, expenseAmount - totalPaid));

  return {
    expenseAmount: round2(expenseAmount),
    paidViaVouchers,
    paidViaFinancialPayments,
    totalPaid,
    remainingBalance,
    bankPaymentVoucherCount: bankPaymentVouchers.length,
    financialPaymentCount: financialPayments.length,
    paymentStatus: expense?.status || 'unknown',
  };
}

async function getExpenseDetails(id, options = {}) {
  const { expenseType: expenseTypeHint } = options;

  const resolved = await resolveExpenseRecord(id, expenseTypeHint);
  if (!resolved) return null;

  const { expense, expenseType, referenceId } = resolved;
  const payeeIds = collectPayeeIds(id, expense);

  const [masterExpense, categoryDetails, bankPaymentVouchers, financialPayments] =
    await Promise.all([
      loadMasterExpense(expense),
      loadCategoryDetails(expenseType, referenceId),
      fetchBankPaymentVouchers(payeeIds),
      fetchFinancialPayments(payeeIds),
    ]);

  if (!masterExpense && !categoryDetails) return null;

  const summary = buildPaymentSummary(
    masterExpense,
    bankPaymentVouchers,
    financialPayments
  );

  return {
    expenseType,
    expense: masterExpense,
    categoryDetails,
    transactions: {
      bankPaymentVouchers,
      financialPayments,
    },
    summary,
  };
}

module.exports = {
  getExpenseDetails,
  resolveExpenseRecord,
};
