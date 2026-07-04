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

async function fetchBankPaymentVouchersLean(payeeIds) {
  const objectIds = payeeIds
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  if (objectIds.length === 0) return [];

  return BankPaymentVoucher.find({
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
  })
    .select('voucherNumber voucherDate amount status payee relatedExpense financialId financialModel')
    .sort({ voucherDate: -1, createdAt: -1 })
    .lean();
}

async function fetchFinancialPaymentsLean(payeeIds) {
  const objectIds = payeeIds
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  if (objectIds.length === 0) return [];

  return FinancialPayment.find({
    relatedModel: 'Expense',
    relatedId: { $in: objectIds },
  })
    .select('referCode amount paymentDate method effect isActive relatedId')
    .sort({ paymentDate: -1, createdAt: -1 })
    .lean();
}

function matchTransactionsForPayeeIds(allVouchers, allPayments, payeeIds) {
  const idSet = new Set(payeeIds.map(String));
  const seenVoucherIds = new Set();
  const vouchers = [];

  for (const voucher of allVouchers) {
    const voucherId = String(voucher._id);
    if (seenVoucherIds.has(voucherId)) continue;

    const matches =
      idSet.has(String(voucher.payee)) ||
      idSet.has(String(voucher.relatedExpense)) ||
      (voucher.financialModel === 'Expense' &&
        idSet.has(String(voucher.financialId)));

    if (matches) {
      seenVoucherIds.add(voucherId);
      vouchers.push(voucher);
    }
  }

  const payments = allPayments.filter((payment) =>
    idSet.has(String(payment.relatedId))
  );

  return { vouchers, payments };
}

function readCategoryExpenseAmount(categoryItem) {
  if (categoryItem?.amountInPKR != null) return categoryItem.amountInPKR;
  if (categoryItem?.totalCost != null && categoryItem?.exchangeRate != null) {
    return round2(categoryItem.totalCost * categoryItem.exchangeRate);
  }
  return categoryItem?.totalCost || 0;
}

async function syncExpensePaymentAmounts(expenseId) {
  const expense = await Expense.findById(expenseId);
  if (!expense || !expense.isActive) return null;

  const payeeIds = collectPayeeIds(expense._id, expense);
  const [vouchers, payments] = await Promise.all([
    fetchBankPaymentVouchersLean(payeeIds),
    fetchFinancialPaymentsLean(payeeIds),
  ]);

  const summary = buildPaymentSummary(expense, vouchers, payments);

  expense.paidAmount = summary.paidAmount;
  expense.remainingBalance = summary.remainingBalance;

  if (expense.status !== 'cancelled') {
    if (summary.paymentStatus === 'paid') expense.status = 'paid';
    else if (summary.paymentStatus === 'partial') expense.status = 'partial';
  }

  await expense.save();

  const CategoryModel = EXPENSE_CATEGORY_MODELS[expense.expenseType];
  if (CategoryModel && expense.referenceId) {
    const detail = await CategoryModel.findById(expense.referenceId);
    if (detail) {
      if (detail.paymentStatus !== undefined) {
        detail.paymentStatus = summary.paymentStatus;
      }
      if (detail.paidDate !== undefined && summary.paymentStatus === 'paid') {
        const lastVoucher = vouchers.find((v) => v.status !== 'cancelled');
        detail.paidDate = lastVoucher?.voucherDate || new Date();
      }
      await detail.save();
    }
  }

  return { expense, summary };
}

async function enrichCategoryExpenseList(expenseType, categoryExpenses) {
  if (!Array.isArray(categoryExpenses) || categoryExpenses.length === 0) {
    return [];
  }

  const items = categoryExpenses.map((item) =>
    typeof item.toObject === 'function' ? item.toObject() : { ...item }
  );
  const referenceIds = items.map((item) => item._id);

  const masterExpenses = await Expense.find({
    referenceId: { $in: referenceIds },
    expenseType,
    isActive: true,
  })
    .select('_id referCode referenceId totalAmount amountInPKR status paidAmount remainingBalance')
    .lean();

  const masterByReference = new Map(
    masterExpenses.map((expense) => [String(expense.referenceId), expense])
  );

  const allPayeeIds = new Set();
  for (const item of items) {
    allPayeeIds.add(String(item._id));
    const master = masterByReference.get(String(item._id));
    if (master?._id) allPayeeIds.add(String(master._id));
  }

  const [allVouchers, allPayments] = await Promise.all([
    fetchBankPaymentVouchersLean([...allPayeeIds]),
    fetchFinancialPaymentsLean([...allPayeeIds]),
  ]);

  return items.map((item) => {
    const masterExpense = masterByReference.get(String(item._id));
    const payeeIds = collectPayeeIds(item._id, masterExpense);
    const { vouchers, payments } = matchTransactionsForPayeeIds(
      allVouchers,
      allPayments,
      payeeIds
    );

    const expenseAmount =
      masterExpense?.amountInPKR ?? readCategoryExpenseAmount(item);
    const paymentInfo = buildPaymentSummary(expenseAmount, vouchers, payments);

    return {
      ...item,
      masterExpense: masterExpense || null,
      paymentInfo,
    };
  });
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

function buildPaymentSummary(expenseOrAmount, bankPaymentVouchers, financialPayments) {
  const expenseAmount =
    typeof expenseOrAmount === 'number'
      ? expenseOrAmount
      : expenseOrAmount?.amountInPKR ?? expenseOrAmount?.totalAmount ?? 0;
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

  let paymentStatus = 'pending';
  if (totalPaid > 0 && remainingBalance > 0) paymentStatus = 'partial';
  if (remainingBalance <= 0 && totalPaid > 0) paymentStatus = 'paid';

  return {
    expenseAmount: round2(expenseAmount),
    paidViaVouchers,
    paidViaFinancialPayments,
    paidAmount: totalPaid,
    totalPaid,
    remainingBalance,
    bankPaymentVoucherCount: bankPaymentVouchers.length,
    financialPaymentCount: financialPayments.length,
    paymentStatus,
    masterStatus:
      paymentStatus === 'paid'
        ? 'paid'
        : paymentStatus === 'partial'
          ? 'partial'
          : expenseOrAmount?.status || 'pending',
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

async function enrichMasterExpenseList(expenses) {
  if (!Array.isArray(expenses) || expenses.length === 0) return [];

  const items = expenses.map((item) =>
    typeof item.toObject === 'function' ? item.toObject() : { ...item }
  );

  const allPayeeIds = new Set();
  for (const item of items) {
    allPayeeIds.add(String(item._id));
    if (item.referenceId) allPayeeIds.add(String(item.referenceId));
  }

  const [allVouchers, allPayments] = await Promise.all([
    fetchBankPaymentVouchersLean([...allPayeeIds]),
    fetchFinancialPaymentsLean([...allPayeeIds]),
  ]);

  return items.map((item) => {
    const payeeIds = collectPayeeIds(item._id, item);
    const { vouchers, payments } = matchTransactionsForPayeeIds(
      allVouchers,
      allPayments,
      payeeIds
    );
    const paymentInfo = buildPaymentSummary(item, vouchers, payments);

    return {
      ...item,
      paymentInfo,
    };
  });
}

module.exports = {
  getExpenseDetails,
  resolveExpenseRecord,
  syncExpensePaymentAmounts,
  enrichCategoryExpenseList,
  enrichMasterExpenseList,
  buildPaymentSummary,
};
