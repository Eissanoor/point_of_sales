const mongoose = require('mongoose');
const FinancialPayment = require('../models/financialPaymentModel');
const {
  computeLedgerBalanceDelta,
  paymentEffectToDebitCredit,
  attachRunningBalanceForAccount,
} = require('../utils/accountDebitCreditRules');
require('../models/userModel');
require('../models/currencyModel');

const MODEL_MAP = {
  Asset: () => require('../models/assetModel'),
  Income: () => require('../models/incomeModel'),
  Liability: () => require('../models/liabilityModel'),
  PartnershipAccount: () => require('../models/partnershipAccountModel'),
  CashBook: () => require('../models/cashBookModel'),
  Capital: () => require('../models/capitalModel'),
  Owner: () => require('../models/ownerModel'),
  Employee: () => require('../models/employeeModel'),
  PropertyAccount: () => require('../models/propertyAccountModel'),
};

const parseDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

const inDateRange = (date, startDate, endDate) => {
  if (!date) return true;
  const d = new Date(date);
  if (startDate && d < startDate) return false;
  if (endDate && d > endDate) return false;
  return true;
};

const paginateArray = (items, page, limit) => {
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

const attachRunningBalance = (transactions, openingBalance, relatedModel) =>
  attachRunningBalanceForAccount(transactions, openingBalance, relatedModel);

const summarizeLedgerRows = (rows, relatedModel) => {
  let totalDebit = 0;
  let totalCredit = 0;
  let transactionCount = 0;
  let netMovement = 0;

  for (const row of rows) {
    if (row.balanceApplied === false) continue;
    totalDebit = round2(totalDebit + (row.debit || 0));
    totalCredit = round2(totalCredit + (row.credit || 0));
    netMovement = round2(
      netMovement + computeLedgerBalanceDelta(row.debit, row.credit, relatedModel)
    );
    transactionCount += 1;
  }

  return {
    totalDebit,
    totalCredit,
    netMovement,
    transactionCount,
    bySource: {
      financialPayment: {
        debit: totalDebit,
        credit: totalCredit,
        count: transactionCount,
      },
    },
  };
};

const paymentToLedgerRow = (payment) => {
  const amount = typeof payment.amount === 'number' ? payment.amount : parseFloat(payment.amount || 0);
  const relatedModel = payment.relatedModel || '';
  const { debit, credit, ledgerLabel } = paymentEffectToDebitCredit(
    amount,
    payment.effect,
    relatedModel
  );

  return {
    date: payment.paymentDate || payment.createdAt,
    source: 'financialPayment',
    sourceId: payment._id,
    reference: payment.referCode || payment.code || '',
    referCode: payment.referCode || '',
    description: payment.description || payment.name || '',
    debit,
    credit,
    amount: round2(amount),
    effect: payment.effect || 'add',
    ledgerLabel,
    method: payment.method || '',
    status: payment.isActive === false ? 'inactive' : 'active',
    voucherType: '',
    counterpart: null,
    balanceApplied: payment.isActive !== false,
    currency: payment.currency || null,
    user: payment.user || null,
    name: payment.name || '',
    code: payment.code || '',
    metadata: {
      relatedModel: payment.relatedModel,
      relatedId: payment.relatedId,
      paymentDate: payment.paymentDate,
      createdAt: payment.createdAt,
    },
  };
};

async function loadRelatedAccount(relatedModel, relatedId) {
  const loader = MODEL_MAP[relatedModel];
  if (!loader) return null;

  const Model = loader();
  const account = await Model.findById(relatedId).select('-__v').lean();
  return account;
}

function readStoredBalances(account) {
  if (!account || typeof account !== 'object') {
    return { openingBalance: 0, currentBalance: null };
  }

  const openingBalance =
    typeof account.openingBalance === 'number' ? round2(account.openingBalance) : 0;
  const currentBalance =
    typeof account.balance === 'number' ? round2(account.balance) : null;

  return { openingBalance, currentBalance };
}

async function fetchFinancialPaymentRows(relatedModel, relatedId, options = {}) {
  const { currencyId, startDate, endDate, includeInactive = false } = options;

  const relatedObjectId = mongoose.Types.ObjectId.isValid(String(relatedId))
    ? new mongoose.Types.ObjectId(String(relatedId))
    : relatedId;

  const paymentQuery = {
    relatedModel,
    relatedId: relatedObjectId,
  };

  if (!includeInactive) {
    paymentQuery.isActive = true;
  }

  if (currencyId) {
    const currencyObjectId = new mongoose.Types.ObjectId(String(currencyId));
    paymentQuery.$or = [
      { currency: currencyObjectId },
      { currency: String(currencyId) },
      { currency: null },
      { currency: { $exists: false } },
    ];
  }

  const payments = await FinancialPayment.find(paymentQuery)
    .populate({ path: 'user', select: 'name email', strictPopulate: false })
    .populate({ path: 'currency', select: 'name code symbol', strictPopulate: false })
    .sort({ createdAt: -1, paymentDate: -1 })
    .lean();

  const rows = [];
  for (const payment of payments) {
    if (!inDateRange(payment.paymentDate || payment.createdAt, startDate, endDate)) continue;
    rows.push(paymentToLedgerRow(payment));
  }

  return rows;
}

async function getFinancialAccountDetails(relatedModel, relatedId, options = {}) {
  const {
    currencyId,
    startDate: startDateRaw,
    endDate: endDateRaw,
    page = 1,
    limit = 20,
    includeTransactions = true,
  } = options;

  const startDate = parseDate(startDateRaw);
  const endDate = parseDate(endDateRaw);
  if (endDate) endDate.setHours(23, 59, 59, 999);

  const account = await loadRelatedAccount(relatedModel, relatedId);
  if (!account) return null;

  const allRows = await fetchFinancialPaymentRows(relatedModel, relatedId, {
    currencyId,
    startDate,
    endDate,
  });

  const balanceAppliedRows = allRows.filter((r) => r.balanceApplied !== false);
  const summary = summarizeLedgerRows(allRows, relatedModel);
  const { openingBalance, currentBalance: storedBalance } = readStoredBalances(account);
  const calculatedBalance = round2(openingBalance + summary.netMovement);
  const currentBalance = storedBalance !== null ? storedBalance : calculatedBalance;
  const balanceDifference =
    storedBalance !== null ? round2(storedBalance - calculatedBalance) : 0;

  const transactionsWithBalance = attachRunningBalance(
    balanceAppliedRows,
    openingBalance,
    relatedModel
  );

  let currency = null;
  if (currencyId && mongoose.Types.ObjectId.isValid(String(currencyId))) {
    const Currency = require('../models/currencyModel');
    currency = await Currency.findById(currencyId).select('name code symbol').lean();
  }

  const response = {
    account,
    relatedModel,
    relatedId: String(relatedId),
    currency,
    summary: {
      openingBalance,
      currentBalance,
      calculatedBalance,
      balanceDifference,
      totalDebit: summary.totalDebit,
      totalCredit: summary.totalCredit,
      netMovement: summary.netMovement,
      transactionCount: summary.transactionCount,
      bySource: summary.bySource,
    },
    recentTransactions: transactionsWithBalance.slice(0, 5),
  };

  if (includeTransactions) {
    const pagination = paginateArray(transactionsWithBalance, page, limit);
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

module.exports = {
  getFinancialAccountDetails,
  fetchFinancialPaymentRows,
  paymentToLedgerRow,
};
