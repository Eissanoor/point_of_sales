const mongoose = require('mongoose');
const Expense = require('../models/expenseModel');
const BankPaymentVoucher = require('../models/bankPaymentVoucherModel');
const FinancialPayment = require('../models/financialPaymentModel');
const {
  EXPENSE_CATEGORY_PAYEE_TYPES,
  EXPENSE_CATEGORY_MODELS,
} = require('../utils/expensePayeeTypes');
const { paymentToLedgerRow } = require('./financialAccountDetailsService');
const { getEffectiveBankVoucherEntries } = require('../controllers/bankVoucherDoubleEntryHelpers');
const { computeLedgerBalanceDelta } = require('../utils/accountDebitCreditRules');

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

const parseDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const inDateRange = (date, startDate, endDate) => {
  if (!date) return true;
  const d = new Date(date);
  if (startDate && d < startDate) return false;
  if (endDate && d > endDate) return false;
  return true;
};

const normalizeEntryAccountModel = (accountModel) => {
  const s = (accountModel || '').trim().toLowerCase();
  if (s === 'expense') return 'Expense';
  return accountModel && accountModel.trim ? accountModel.trim() : '';
};

const emptyLedgerSourceSummary = () => ({ debit: 0, credit: 0, count: 0 });

const makeExpenseLedgerRow = ({
  date,
  source,
  sourceId,
  reference,
  description,
  debit,
  credit,
  status = '',
  voucherType = '',
  counterpart = null,
  balanceApplied = true,
  ledgerLabel = '',
  metadata = {},
}) => {
  const debitAmount = round2(debit || 0);
  const creditAmount = round2(credit || 0);
  return {
    date,
    source,
    sourceId,
    reference: reference || '',
    description: description || '',
    debit: debitAmount,
    credit: creditAmount,
    amount: round2(Math.max(debitAmount, creditAmount)),
    ledgerLabel: ledgerLabel || (debitAmount > 0 ? 'Debit' : 'Credit'),
    status,
    voucherType,
    counterpart,
    balanceApplied,
    metadata,
  };
};

const paginateLedgerRows = (items, page, limit) => {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;
  const total = items.length;

  return {
    page: pageNum,
    limit: limitNum,
    total,
    totalPages: Math.ceil(total / limitNum) || 1,
    results: items.slice(skip, skip + limitNum),
  };
};

const attachExpenseRunningBalance = (transactions) => {
  const asc = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));
  let running = 0;

  for (const row of asc) {
    if (row.balanceApplied !== false) {
      running = round2(
        running + computeLedgerBalanceDelta(row.debit, row.credit, 'Expense')
      );
    }
    row.runningBalance = running;
    row.outstandingBalance = round2(Math.max(0, running));
  }

  return asc.sort((a, b) => new Date(b.date) - new Date(a.date));
};

function readCategoryExpenseAmount(categoryItem) {
  if (categoryItem?.amountInPKR != null) return categoryItem.amountInPKR;
  if (categoryItem?.totalCost != null && categoryItem?.exchangeRate != null) {
    return round2(categoryItem.totalCost * categoryItem.exchangeRate);
  }
  return categoryItem?.totalCost || 0;
}

function buildExpenseIncurredLedgerRow(masterExpense, categoryDetails) {
  const amount =
    masterExpense?.amountInPKR ??
    (categoryDetails ? readCategoryExpenseAmount(categoryDetails) : 0);
  if (!amount) return null;

  const date =
    masterExpense?.expenseDate ||
    masterExpense?.createdAt ||
    categoryDetails?.createdAt ||
    new Date();

  return makeExpenseLedgerRow({
    date,
    source: 'expense',
    sourceId: masterExpense?._id || categoryDetails?._id,
    reference: masterExpense?.referCode || categoryDetails?.invoiceNo || '',
    description:
      masterExpense?.description ||
      categoryDetails?.notes ||
      'Expense incurred',
    debit: amount,
    credit: 0,
    ledgerLabel: 'Debit',
    status: masterExpense?.status || 'active',
    metadata: {
      expenseType: masterExpense?.expenseType,
      referenceId: masterExpense?.referenceId || categoryDetails?._id,
    },
  });
}

function voucherMatchesPayeeIds(voucher, payeeIdSet) {
  return (
    payeeIdSet.has(String(voucher.payee)) ||
    payeeIdSet.has(String(voucher.relatedExpense)) ||
    (voucher.financialModel === 'Expense' &&
      payeeIdSet.has(String(voucher.financialId)))
  );
}

function buildBankVoucherExpenseLedgerRows(bankPaymentVouchers, payeeIds) {
  const payeeIdSet = new Set(payeeIds.map(String));
  const rows = [];

  for (const voucher of bankPaymentVouchers) {
    const balanceApplied =
      voucher.status !== 'cancelled' && voucher.bankBalanceApplied !== false;
    const entries = getEffectiveBankVoucherEntries(voucher);
    let matchedFromEntries = false;

    for (const entry of entries) {
      if (normalizeEntryAccountModel(entry.accountModel) !== 'Expense') continue;
      if (!payeeIdSet.has(String(entry.account))) continue;

      const debit =
        typeof entry.debit === 'number' ? entry.debit : parseFloat(entry.debit || 0);
      const credit =
        typeof entry.credit === 'number' ? entry.credit : parseFloat(entry.credit || 0);
      if ((!Number.isFinite(debit) || debit <= 0) && (!Number.isFinite(credit) || credit <= 0)) {
        continue;
      }

      matchedFromEntries = true;
      rows.push(
        makeExpenseLedgerRow({
          date: voucher.voucherDate || voucher.createdAt,
          source: 'bankPaymentVoucher',
          sourceId: voucher._id,
          reference: voucher.voucherNumber || '',
          description:
            entry.description ||
            voucher.description ||
            voucher.notes ||
            `Bank ${voucher.voucherType || 'payment'} - ${voucher.payeeName || 'Expense'}`,
          debit: debit > 0 ? debit : 0,
          credit: credit > 0 ? credit : 0,
          status: voucher.status,
          voucherType: voucher.voucherType,
          counterpart: voucher.bankAccount?.accountName || voucher.payeeName || null,
          balanceApplied,
          metadata: {
            bankAccount: voucher.bankAccount,
            payeeType: voucher.payeeType,
            paymentMethod: voucher.paymentMethod,
          },
        })
      );
    }

    if (!matchedFromEntries && voucherMatchesPayeeIds(voucher, payeeIdSet)) {
      const amount =
        typeof voucher.amount === 'number' ? voucher.amount : parseFloat(voucher.amount || 0);
      if (!Number.isFinite(amount) || amount <= 0) continue;

      const isReceipt = voucher.voucherType === 'receipt';
      rows.push(
        makeExpenseLedgerRow({
          date: voucher.voucherDate || voucher.createdAt,
          source: 'bankPaymentVoucher',
          sourceId: voucher._id,
          reference: voucher.voucherNumber || '',
          description:
            voucher.description ||
            voucher.notes ||
            `Bank ${voucher.voucherType || 'payment'} - ${voucher.payeeName || 'Expense'}`,
          debit: isReceipt ? amount : 0,
          credit: isReceipt ? 0 : amount,
          status: voucher.status,
          voucherType: voucher.voucherType,
          counterpart: voucher.bankAccount?.accountName || voucher.payeeName || null,
          balanceApplied,
          metadata: {
            bankAccount: voucher.bankAccount,
            payeeType: voucher.payeeType,
            paymentMethod: voucher.paymentMethod,
          },
        })
      );
    }
  }

  return rows;
}

function collectLinkedFinancialPaymentIds(bankPaymentVouchers) {
  const ids = new Set();
  for (const voucher of bankPaymentVouchers) {
    if (voucher.relatedFinancialPayment) {
      const fpId = voucher.relatedFinancialPayment._id || voucher.relatedFinancialPayment;
      ids.add(String(fpId));
    }
    if (Array.isArray(voucher.relatedFinancialPayments)) {
      for (const fp of voucher.relatedFinancialPayments) {
        const fpId = fp?._id || fp;
        if (fpId) ids.add(String(fpId));
      }
    }
  }
  return ids;
}

function buildFinancialPaymentExpenseLedgerRows(
  financialPayments,
  linkedFinancialPaymentIds = new Set()
) {
  const rows = [];

  for (const payment of financialPayments) {
    if (linkedFinancialPaymentIds.has(String(payment._id))) continue;

    const row = paymentToLedgerRow(payment);
    rows.push(
      makeExpenseLedgerRow({
        date: row.date,
        source: 'financialPayment',
        sourceId: row.sourceId,
        reference: row.reference || row.referCode || '',
        description: row.description,
        debit: row.debit,
        credit: row.credit,
        ledgerLabel: row.ledgerLabel,
        status: row.status,
        voucherType: row.voucherType,
        counterpart: row.counterpart,
        balanceApplied: row.balanceApplied,
        metadata: row.metadata,
      })
    );
  }

  return rows;
}

function summarizeExpenseLedgerRows(rows) {
  const bySource = {
    expense: emptyLedgerSourceSummary(),
    bankPaymentVoucher: emptyLedgerSourceSummary(),
    financialPayment: emptyLedgerSourceSummary(),
  };

  let totalDebit = 0;
  let totalCredit = 0;
  let transactionCount = 0;

  let netMovement = 0;

  for (const row of rows) {
    if (row.balanceApplied === false) continue;
    totalDebit = round2(totalDebit + (row.debit || 0));
    totalCredit = round2(totalCredit + (row.credit || 0));
    netMovement = round2(
      netMovement + computeLedgerBalanceDelta(row.debit, row.credit, 'Expense')
    );
    transactionCount += 1;

    const bucket = bySource[row.source] || emptyLedgerSourceSummary();
    bucket.debit = round2(bucket.debit + (row.debit || 0));
    bucket.credit = round2(bucket.credit + (row.credit || 0));
    bucket.count += 1;
    bySource[row.source] = bucket;
  }

  return {
    totalDebit,
    totalCredit,
    netMovement,
    transactionCount,
    bySource,
  };
}

function buildExpenseLedger({
  masterExpense,
  categoryDetails,
  bankPaymentVouchers,
  financialPayments,
  payeeIds,
  paymentSummary,
  startDate,
  endDate,
  page,
  limit,
  includeTransactions = true,
}) {
  const incurredRow = buildExpenseIncurredLedgerRow(masterExpense, categoryDetails);
  const voucherRows = buildBankVoucherExpenseLedgerRows(bankPaymentVouchers, payeeIds);
  const linkedFinancialPaymentIds = collectLinkedFinancialPaymentIds(bankPaymentVouchers);
  const paymentRows = buildFinancialPaymentExpenseLedgerRows(
    financialPayments,
    linkedFinancialPaymentIds
  );

  const allRows = [incurredRow, ...voucherRows, ...paymentRows]
    .filter(Boolean)
    .filter((row) => inDateRange(row.date, startDate, endDate));

  const ledgerSummary = summarizeExpenseLedgerRows(allRows);
  const transactionsWithBalance = attachExpenseRunningBalance(allRows);
  const expenseAmount = paymentSummary?.expenseAmount ?? ledgerSummary.totalDebit;
  const paidAmount = paymentSummary?.paidAmount ?? ledgerSummary.totalCredit;
  const remainingBalance =
    paymentSummary?.remainingBalance ??
    round2(Math.max(0, expenseAmount - paidAmount));

  const response = {
    summary: {
      expenseAmount: round2(expenseAmount),
      totalDebit: ledgerSummary.totalDebit,
      totalCredit: ledgerSummary.totalCredit,
      paidAmount: round2(paidAmount),
      remainingBalance,
      netMovement: ledgerSummary.netMovement,
      transactionCount: ledgerSummary.transactionCount,
      paymentStatus: paymentSummary?.paymentStatus || 'pending',
      bySource: ledgerSummary.bySource,
    },
    recentTransactions: transactionsWithBalance.slice(0, 5),
  };

  if (includeTransactions) {
    const pagination = paginateLedgerRows(transactionsWithBalance, page, limit);
    response.transactions = pagination.results;
    response.pagination = {
      page: pagination.page,
      limit: pagination.limit,
      total: pagination.total,
      totalPages: pagination.totalPages,
    };
  }

  return response;
}

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
    // Expense payments use reversed rules: credit-side (subtract) reduces owed balance
    if (payment.effect === 'subtract') {
      paidViaFinancialPayments = round2(
        paidViaFinancialPayments + (payment.amount || 0)
      );
    }
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
  const {
    expenseType: expenseTypeHint,
    startDate: startDateRaw,
    endDate: endDateRaw,
    page,
    limit,
    includeLedger = true,
    includeTransactions = true,
  } = options;

  const startDate = parseDate(startDateRaw);
  const endDate = parseDate(endDateRaw);
  if (endDate) endDate.setHours(23, 59, 59, 999);

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

  const response = {
    expenseType,
    expense: masterExpense,
    categoryDetails,
    transactions: {
      bankPaymentVouchers,
      financialPayments,
    },
    summary,
  };

  if (includeLedger) {
    response.ledger = buildExpenseLedger({
      masterExpense,
      categoryDetails,
      bankPaymentVouchers,
      financialPayments,
      payeeIds,
      paymentSummary: summary,
      startDate,
      endDate,
      page,
      limit,
      includeTransactions,
    });
  }

  return response;
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
  buildExpenseLedger,
};
