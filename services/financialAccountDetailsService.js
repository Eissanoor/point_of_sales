const mongoose = require('mongoose');
const FinancialPayment = require('../models/financialPaymentModel');
const BankPaymentVoucher = require('../models/bankPaymentVoucherModel');
const {
  computeLedgerBalanceDelta,
  paymentEffectToDebitCredit,
  isDebitNormalAccount,
} = require('../utils/accountDebitCreditRules');
require('../models/userModel');
require('../models/currencyModel');

const MODEL_MAP = {
  Asset: () => require('../models/assetModel'),
  Expense: () => require('../models/expenseModel'),
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

const ledgerTime = (row) => {
  const ms = new Date(row.date).getTime();
  return Number.isNaN(ms) ? 0 : ms;
};

const ledgerCreatedTime = (row) => {
  const raw = row.createdAt || row.metadata?.createdAt;
  if (!raw) return 0;
  const ms = new Date(raw).getTime();
  return Number.isNaN(ms) ? 0 : ms;
};

const ledgerRefNum = (row) => {
  const ref = String(row.referCode || row.reference || row.code || '');
  const match = ref.match(/(\d+)$/);
  return match ? Number(match[1]) : 0;
};

/** Oldest first: date, then createdAt, then reference (FP-0130 before FP-0131). */
const compareLedgerChronological = (a, b) => {
  const dateDiff = ledgerTime(a) - ledgerTime(b);
  if (dateDiff !== 0) return dateDiff;

  const createdDiff = ledgerCreatedTime(a) - ledgerCreatedTime(b);
  if (createdDiff !== 0) return createdDiff;

  const refDiff = ledgerRefNum(a) - ledgerRefNum(b);
  if (refDiff !== 0) return refDiff;

  return String(a.sourceId || '').localeCompare(String(b.sourceId || ''));
};

const attachRunningBalance = (transactions, openingBalance, accountModel) => {
  const chronological = [...transactions].sort(compareLedgerChronological);
  let running = round2(openingBalance || 0);
  let hasApplied = running !== 0;

  for (const row of chronological) {
    if (row.balanceApplied !== false) {
      running = round2(running + remainingBalanceDelta(row, accountModel, !hasApplied));
      hasApplied = true;
    }
    row.runningBalance = running;
  }

  // Display newest first; running balances stay chronological.
  return chronological.reverse();
};

const isReceiptLedgerRow = (row) => {
  if (row.voucherType === 'receipt') return true;
  const text = `${row.reference || ''} ${row.description || ''} ${row.metadata?.voucherNumber || ''}`;
  return /\bBRV-|\bReceipt\b/i.test(text);
};

/**
 * Asset/Expense remaining:
 * Payment (BPV) first line: debit − credit (e.g. Debit 1000 → +1000).
 * Receipt (BRV): always subtracts (e.g. Debit 1000 → -1000).
 * Later payment lines also reduce remaining.
 */
const remainingBalanceDelta = (row, accountModel, isFirstApplied) => {
  if (!isDebitNormalAccount(accountModel)) {
    return computeLedgerBalanceDelta(row.debit, row.credit, accountModel);
  }

  const debit = row.debit || 0;
  const credit = row.credit || 0;
  const amount = debit + credit;

  if (isReceiptLedgerRow(row)) {
    return -amount;
  }

  if (isFirstApplied) {
    return debit - credit;
  }

  return -amount;
};

const paymentToLedgerRow = (payment, voucher) => {
  const amount = typeof payment.amount === 'number' ? payment.amount : parseFloat(payment.amount || 0);
  const amt = round2(amount);
  let mapped = paymentEffectToDebitCredit(amount, payment.effect, payment.relatedModel);

  // Asset/Expense: bank voucher (payment or receipt) always shows as debit.
  if (isDebitNormalAccount(payment.relatedModel)) {
    mapped = { debit: amt, credit: 0, ledgerLabel: 'Debit' };
  }

  const rawDescription = payment.description || payment.name || '';
  const description = rawDescription
    .replace(/\bDebit\b/g, mapped.ledgerLabel)
    .replace(/\bCredit\b/g, mapped.ledgerLabel);

  return {
    date: payment.paymentDate || payment.createdAt,
    createdAt: payment.createdAt || payment.paymentDate || null,
    source: 'financialPayment',
    sourceId: payment._id,
    reference: payment.referCode || payment.code || '',
    referCode: payment.referCode || '',
    description,
    debit: mapped.debit,
    credit: mapped.credit,
    amount: amt,
    effect: payment.effect || 'add',
    ledgerLabel: mapped.ledgerLabel,
    method: payment.method || '',
    status: payment.isActive === false ? 'inactive' : 'active',
    voucherType: voucher?.voucherType || '',
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
      voucherNumber: voucher?.voucherNumber || '',
    },
  };
};

const summarizeLedgerRows = (rows, accountModel) => {
  let totalDebit = 0;
  let totalCredit = 0;
  let transactionCount = 0;
  let netMovement = 0;
  let hasApplied = false;
  const chronological = [...rows].sort(compareLedgerChronological);

  for (const row of chronological) {
    if (row.balanceApplied === false) continue;
    totalDebit = round2(totalDebit + (row.debit || 0));
    totalCredit = round2(totalCredit + (row.credit || 0));
    netMovement = round2(
      netMovement + remainingBalanceDelta(row, accountModel, !hasApplied)
    );
    hasApplied = true;
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

  const paymentIds = payments.map((p) => p._id);
  const vouchers = paymentIds.length
    ? await BankPaymentVoucher.find({
        $or: [
          { relatedFinancialPayment: { $in: paymentIds } },
          { relatedFinancialPayments: { $in: paymentIds } },
          { financialModel: relatedModel, financialId: relatedObjectId },
        ],
      })
        .select('voucherNumber voucherType relatedFinancialPayment relatedFinancialPayments')
        .lean()
    : [];

  const voucherByFpId = new Map();
  for (const voucher of vouchers) {
    if (voucher.relatedFinancialPayment) {
      voucherByFpId.set(String(voucher.relatedFinancialPayment), voucher);
    }
    if (Array.isArray(voucher.relatedFinancialPayments)) {
      for (const fpId of voucher.relatedFinancialPayments) {
        voucherByFpId.set(String(fpId), voucher);
      }
    }
  }

  const voucherByNumber = new Map(
    vouchers.filter((v) => v.voucherNumber).map((v) => [String(v.voucherNumber), v])
  );

  const rows = [];
  for (const payment of payments) {
    if (!inDateRange(payment.paymentDate || payment.createdAt, startDate, endDate)) continue;
    const voucher =
      voucherByFpId.get(String(payment._id)) ||
      voucherByNumber.get(String(payment.code || ''));
    rows.push(paymentToLedgerRow(payment, voucher));
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
