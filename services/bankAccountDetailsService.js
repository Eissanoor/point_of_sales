const BankAccount = require('../models/bankAccountModel');
const BankPaymentVoucher = require('../models/bankPaymentVoucherModel');
const JournalPaymentVoucher = require('../models/journalPaymentVoucherModel');
const CashPaymentVoucher = require('../models/cashPaymentVoucherModel');
const SarafEntryVoucher = require('../models/sarafEntryVoucherModel');
const BankAccountTransferVoucher = require('../models/bankAccountTransferVoucherModel');
const ReconcileBankAccountsVoucher = require('../models/reconcileBankAccountsVoucherModel');
const OpeningBalanceVoucher = require('../models/openingBalanceVoucherModel');
const { computeLedgerBalanceDelta, isDebitNormalAccount } = require('../utils/accountDebitCreditRules');

const BANK_PAYMENT_POSTED_STATUSES = ['pending', 'approved', 'completed'];
const JOURNAL_POSTED_STATUSES = ['completed', 'posted'];
const CASH_POSTED_STATUSES = ['completed', 'posted'];
const SARAF_POSTED_STATUSES = ['completed'];
const TRANSFER_COMPLETED_STATUS = 'completed';

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

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

const emptySourceSummary = () => ({
  debit: 0,
  credit: 0,
  count: 0,
});

const buildSummary = () => ({
  totalDebit: 0,
  totalCredit: 0,
  netMovement: 0,
  transactionCount: 0,
  transferOut: 0,
  transferIn: 0,
  transferCount: 0,
  bySource: {
    bankPaymentVoucher: emptySourceSummary(),
    journalPaymentVoucher: emptySourceSummary(),
    cashPaymentVoucher: emptySourceSummary(),
    sarafEntryVoucher: emptySourceSummary(),
    bankAccountTransfer: emptySourceSummary(),
    openingBalanceVoucher: emptySourceSummary(),
  },
});

const createdAtFromSourceId = (id) => {
  const hex = String(id || '');
  if (hex.length < 8) return null;
  const seconds = parseInt(hex.substring(0, 8), 16);
  if (!Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000);
};

const makeLedgerRow = ({
  date,
  createdAt,
  source,
  sourceId,
  reference,
  description,
  debit,
  credit,
  status,
  voucherType,
  counterpart,
  balanceApplied = true,
  metadata = {},
}) => ({
  date,
  createdAt: createdAt || createdAtFromSourceId(sourceId) || date || null,
  source,
  sourceId,
  reference: reference || '',
  description: description || '',
  debit: round2(debit || 0),
  credit: round2(credit || 0),
  status: status || '',
  voucherType: voucherType || '',
  counterpart: counterpart || null,
  balanceApplied,
  metadata,
});

async function fetchBankPaymentLedgerRows(bankAccountId, startDate, endDate) {
  const rows = [];
  const vouchers = await BankPaymentVoucher.find({
    bankAccount: bankAccountId,
    bankBalanceApplied: true,
  })
    .select('voucherNumber voucherDate voucherType amount status payeeName payeeType financialModel description notes createdAt')
    .lean();

  for (const v of vouchers) {
    if (!inDateRange(v.voucherDate, startDate, endDate)) continue;
    const amount = typeof v.amount === 'number' ? v.amount : parseFloat(v.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const isReceipt = v.voucherType === 'receipt';
    const payeeIsAssetOrExpense =
      isDebitNormalAccount(v.payeeType) || isDebitNormalAccount(v.financialModel);
    // Receipt to Asset/Expense still leaves the bank (debit / −amount).
    const bankDebit = !isReceipt || payeeIsAssetOrExpense;
    rows.push(
      makeLedgerRow({
        date: v.voucherDate,
        createdAt: v.createdAt,
        source: 'bankPaymentVoucher',
        sourceId: v._id,
        reference: v.voucherNumber,
        description: v.description || v.notes || `${isReceipt ? 'Receipt' : 'Payment'} - ${v.payeeName || v.payeeType || 'N/A'}`,
        debit: bankDebit ? amount : 0,
        credit: bankDebit ? 0 : amount,
        status: v.status,
        voucherType: v.voucherType,
        counterpart: v.payeeName || v.payeeType || null,
      })
    );
  }

  return rows;
}

async function fetchJournalLedgerRows(bankAccountId, startDate, endDate) {
  const rows = [];
  const bankIdStr = String(bankAccountId);

  const vouchers = await JournalPaymentVoucher.find({
    bankBalanceApplied: true,
    'entries.bankAccount': bankAccountId,
  })
    .select('voucherNumber voucherDate voucherType status entries description notes createdAt')
    .lean();

  for (const v of vouchers) {
    if (!Array.isArray(v.entries)) continue;
    for (const entry of v.entries) {
      if (!entry?.bankAccount || String(entry.bankAccount) !== bankIdStr) continue;

      const debit = typeof entry.debit === 'number' ? entry.debit : parseFloat(entry.debit || 0);
      const credit = typeof entry.credit === 'number' ? entry.credit : parseFloat(entry.credit || 0);
      if ((!Number.isFinite(debit) || debit <= 0) && (!Number.isFinite(credit) || credit <= 0)) continue;
      if (!inDateRange(v.voucherDate, startDate, endDate)) continue;

      rows.push(
        makeLedgerRow({
          date: v.voucherDate,
          createdAt: v.createdAt,
          source: 'journalPaymentVoucher',
          sourceId: v._id,
          reference: v.voucherNumber,
          description: entry.description || v.description || v.notes || `Journal - ${entry.accountName || entry.accountModel || ''}`,
          debit: debit > 0 ? debit : 0,
          credit: credit > 0 ? credit : 0,
          status: v.status,
          voucherType: v.voucherType,
          counterpart: entry.accountName || entry.accountModel || null,
        })
      );
    }
  }

  return rows;
}

async function fetchCashLedgerRows(bankAccountId, startDate, endDate) {
  const rows = [];
  const bankIdStr = String(bankAccountId);

  const vouchers = await CashPaymentVoucher.find({
    cashBalanceApplied: true,
    'entries.bankAccount': bankAccountId,
  })
    .select('voucherNumber voucherDate voucherType status entries description notes createdAt')
    .lean();

  for (const v of vouchers) {
    if (!Array.isArray(v.entries)) continue;
    for (const entry of v.entries) {
      if (!entry?.bankAccount || String(entry.bankAccount) !== bankIdStr) continue;

      const debit = typeof entry.debit === 'number' ? entry.debit : parseFloat(entry.debit || 0);
      const credit = typeof entry.credit === 'number' ? entry.credit : parseFloat(entry.credit || 0);
      if ((!Number.isFinite(debit) || debit <= 0) && (!Number.isFinite(credit) || credit <= 0)) continue;
      if (!inDateRange(v.voucherDate, startDate, endDate)) continue;

      rows.push(
        makeLedgerRow({
          date: v.voucherDate,
          createdAt: v.createdAt,
          source: 'cashPaymentVoucher',
          sourceId: v._id,
          reference: v.voucherNumber,
          description: entry.description || v.description || v.notes || `Cash voucher - ${entry.accountName || entry.accountModel || ''}`,
          debit: debit > 0 ? debit : 0,
          credit: credit > 0 ? credit : 0,
          status: v.status,
          voucherType: v.voucherType,
          counterpart: entry.accountName || entry.accountModel || null,
        })
      );
    }
  }

  return rows;
}

async function fetchSarafLedgerRows(bankAccountId, startDate, endDate) {
  const rows = [];
  const bankIdStr = String(bankAccountId);

  const vouchers = await SarafEntryVoucher.find({
    bankBalanceApplied: true,
    'entries.bankAccount': bankAccountId,
  })
    .select('voucherNumber voucherDate exchangeType status entries description notes createdAt')
    .lean();

  for (const v of vouchers) {
    if (!Array.isArray(v.entries)) continue;
    for (const entry of v.entries) {
      if (!entry?.bankAccount || String(entry.bankAccount) !== bankIdStr) continue;

      const debit = typeof entry.debit === 'number' ? entry.debit : parseFloat(entry.debit || 0);
      const credit = typeof entry.credit === 'number' ? entry.credit : parseFloat(entry.credit || 0);
      if ((!Number.isFinite(debit) || debit <= 0) && (!Number.isFinite(credit) || credit <= 0)) continue;
      if (!inDateRange(v.voucherDate, startDate, endDate)) continue;

      rows.push(
        makeLedgerRow({
          date: v.voucherDate,
          createdAt: v.createdAt,
          source: 'sarafEntryVoucher',
          sourceId: v._id,
          reference: v.voucherNumber,
          description: entry.description || v.description || v.notes || `Saraf ${v.exchangeType || 'exchange'} - ${entry.accountName || ''}`,
          debit: debit > 0 ? debit : 0,
          credit: credit > 0 ? credit : 0,
          status: v.status,
          voucherType: v.exchangeType,
          counterpart: entry.accountName || entry.accountModel || null,
        })
      );
    }
  }

  return rows;
}

async function fetchTransferLedgerRows(bankAccountId, startDate, endDate) {
  const rows = [];
  const bankIdStr = String(bankAccountId);

  const vouchers = await BankAccountTransferVoucher.find({
    status: TRANSFER_COMPLETED_STATUS,
    $or: [{ fromBankAccount: bankAccountId }, { toBankAccount: bankAccountId }],
  })
    .populate('fromBankAccount', 'accountName accountNumber')
    .populate('toBankAccount', 'accountName accountNumber')
    .select('voucherNumber voucherDate amount totalAmount transferFee status purpose description fromBankAccount toBankAccount createdAt')
    .lean();

  for (const v of vouchers) {
    if (!inDateRange(v.voucherDate, startDate, endDate)) continue;
    const amount = typeof v.amount === 'number' ? v.amount : parseFloat(v.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const isOutgoing = String(v.fromBankAccount?._id || v.fromBankAccount) === bankIdStr;
    const otherAccount = isOutgoing ? v.toBankAccount : v.fromBankAccount;
    const otherName = otherAccount?.accountName
      ? `${otherAccount.accountName} (${otherAccount.accountNumber || ''})`
      : 'Other bank account';

    rows.push(
      makeLedgerRow({
        date: v.voucherDate,
        createdAt: v.createdAt,
        source: 'bankAccountTransfer',
        sourceId: v._id,
        reference: v.voucherNumber,
        description: v.description || v.purpose || (isOutgoing ? `Transfer to ${otherName}` : `Transfer from ${otherName}`),
        debit: isOutgoing ? amount : 0,
        credit: isOutgoing ? 0 : amount,
        status: v.status,
        voucherType: isOutgoing ? 'transfer_out' : 'transfer_in',
        counterpart: otherName,
        balanceApplied: false,
        metadata: {
          transferFee: v.transferFee || 0,
          totalAmount: v.totalAmount || amount,
        },
      })
    );
  }

  return rows;
}

async function fetchOpeningBalanceRows(bankAccountId, startDate, endDate) {
  const rows = [];
  const vouchers = await OpeningBalanceVoucher.find({
    account: bankAccountId,
    accountModel: 'BankAccount',
    status: { $in: ['posted', 'completed', 'approved'] },
  })
    .select('voucherNumber voucherDate amount voucherType status description accountName createdAt')
    .lean();

  for (const v of vouchers) {
    if (!inDateRange(v.voucherDate, startDate, endDate)) continue;
    const amount = typeof v.amount === 'number' ? v.amount : parseFloat(v.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const isStart = v.voucherType === 'start';
    rows.push(
      makeLedgerRow({
        date: v.voucherDate,
        createdAt: v.createdAt,
        source: 'openingBalanceVoucher',
        sourceId: v._id,
        reference: v.voucherNumber,
        description: v.description || `${isStart ? 'Opening' : 'Closing'} balance - ${v.accountName || 'Bank account'}`,
        debit: isStart ? 0 : amount,
        credit: isStart ? amount : 0,
        status: v.status,
        voucherType: v.voucherType,
        counterpart: v.accountName || null,
        balanceApplied: false,
      })
    );
  }

  return rows;
}

function summarizeRows(rows) {
  const summary = buildSummary();

  for (const row of rows) {
    const isTransfer = row.source === 'bankAccountTransfer';

    if (isTransfer) {
      summary.transferCount += 1;
      if (row.debit > 0) summary.transferOut = round2(summary.transferOut + row.debit);
      if (row.credit > 0) summary.transferIn = round2(summary.transferIn + row.credit);
    }

    if (summary.bySource[row.source]) {
      summary.bySource[row.source].debit = round2(summary.bySource[row.source].debit + (row.debit || 0));
      summary.bySource[row.source].credit = round2(summary.bySource[row.source].credit + (row.credit || 0));
      summary.bySource[row.source].count += 1;
    }

    if (row.balanceApplied !== false) {
      summary.totalDebit = round2(summary.totalDebit + (row.debit || 0));
      summary.totalCredit = round2(summary.totalCredit + (row.credit || 0));
      summary.transactionCount += 1;
      summary.netMovement = round2(
        summary.netMovement + bankLedgerBalanceDelta(row)
      );
    }
  }

  return summary;
}

function ledgerTime(row) {
  const ms = new Date(row.date).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

function ledgerCreatedTime(row) {
  const raw = row.createdAt;
  if (!raw) return 0;
  const ms = new Date(raw).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

function ledgerRefNum(row) {
  const ref = String(row.reference || '');
  const match = ref.match(/(\d+)$/);
  return match ? Number(match[1]) : 0;
}

/** Oldest first: date, then createdAt, then voucher number (0001 before 0002). */
function compareLedgerChronological(a, b) {
  const dateDiff = ledgerTime(a) - ledgerTime(b);
  if (dateDiff !== 0) return dateDiff;

  const createdDiff = ledgerCreatedTime(a) - ledgerCreatedTime(b);
  if (createdDiff !== 0) return createdDiff;

  const refDiff = ledgerRefNum(a) - ledgerRefNum(b);
  if (refDiff !== 0) return refDiff;

  return String(a.sourceId || '').localeCompare(String(b.sourceId || ''));
}

function bankLedgerBalanceDelta(row) {
  return computeLedgerBalanceDelta(row.debit, row.credit);
}

function attachRunningBalance(transactions, openingBalance) {
  const chronological = [...transactions].sort(compareLedgerChronological);
  let running = round2(openingBalance || 0);

  for (const row of chronological) {
    if (row.balanceApplied !== false) {
      running = round2(running + bankLedgerBalanceDelta(row));
    }
    row.runningBalance = running;
  }

  // Display newest first; running balances stay chronological.
  return chronological.reverse();
}

function paginateArray(items, page, limit) {
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
}

async function getPendingCounts(bankAccountId) {
  const [bankPayments, journals, cashVouchers, sarafVouchers, transfers] = await Promise.all([
    BankPaymentVoucher.countDocuments({
      bankAccount: bankAccountId,
      bankBalanceApplied: { $ne: true },
      status: { $in: BANK_PAYMENT_POSTED_STATUSES },
    }),
    JournalPaymentVoucher.countDocuments({
      bankBalanceApplied: { $ne: true },
      status: { $in: JOURNAL_POSTED_STATUSES },
      'entries.bankAccount': bankAccountId,
    }),
    CashPaymentVoucher.countDocuments({
      cashBalanceApplied: { $ne: true },
      status: { $in: CASH_POSTED_STATUSES },
      'entries.bankAccount': bankAccountId,
    }),
    SarafEntryVoucher.countDocuments({
      bankBalanceApplied: { $ne: true },
      status: { $in: SARAF_POSTED_STATUSES },
      'entries.bankAccount': bankAccountId,
    }),
    BankAccountTransferVoucher.countDocuments({
      status: { $nin: [TRANSFER_COMPLETED_STATUS, 'cancelled', 'rejected', 'failed'] },
      $or: [{ fromBankAccount: bankAccountId }, { toBankAccount: bankAccountId }],
    }),
  ]);

  return {
    bankPaymentVouchers: bankPayments,
    journalPaymentVouchers: journals,
    cashPaymentVouchers: cashVouchers,
    sarafEntryVouchers: sarafVouchers,
    bankAccountTransfers: transfers,
    total: bankPayments + journals + cashVouchers + sarafVouchers + transfers,
  };
}

async function getReconciliationSummary(bankAccountId) {
  const [total, latest] = await Promise.all([
    ReconcileBankAccountsVoucher.countDocuments({ bankAccount: bankAccountId }),
    ReconcileBankAccountsVoucher.findOne({ bankAccount: bankAccountId })
      .sort({ statementDate: -1 })
      .select('statementDate statementBalance adjustedBalance difference status voucherNumber')
      .lean(),
  ]);

  return {
    totalReconciliations: total,
    latestReconciliation: latest || null,
  };
}

async function collectLedgerRows(bankAccountId, { startDate, endDate } = {}) {
  const [bankPayments, journals, cashVouchers, sarafVouchers, transfers, openingBalances] = await Promise.all([
    fetchBankPaymentLedgerRows(bankAccountId, startDate, endDate),
    fetchJournalLedgerRows(bankAccountId, startDate, endDate),
    fetchCashLedgerRows(bankAccountId, startDate, endDate),
    fetchSarafLedgerRows(bankAccountId, startDate, endDate),
    fetchTransferLedgerRows(bankAccountId, startDate, endDate),
    fetchOpeningBalanceRows(bankAccountId, startDate, endDate),
  ]);

  return [...bankPayments, ...journals, ...cashVouchers, ...sarafVouchers, ...transfers, ...openingBalances].sort(
    (a, b) => compareLedgerChronological(b, a)
  );
}

async function getBankAccountDetails(bankAccountId, options = {}) {
  const {
    startDate: startDateRaw,
    endDate: endDateRaw,
    page = 1,
    limit = 20,
    includeTransactions = true,
  } = options;

  const startDate = parseDate(startDateRaw);
  const endDate = parseDate(endDateRaw);
  if (endDate) endDate.setHours(23, 59, 59, 999);

  const bankAccount = await BankAccount.findById(bankAccountId)
    .populate('currency', 'name code symbol')
    .select('-__v')
    .lean();

  if (!bankAccount) return null;

  const allRows = await collectLedgerRows(bankAccountId, { startDate, endDate });
  const balanceAppliedRows = allRows.filter((r) => r.balanceApplied !== false);
  const summary = summarizeRows(allRows);
  const openingBalance = round2(bankAccount.openingBalance || 0);
  const currentBalance = round2(bankAccount.balance || 0);
  const calculatedBalance = round2(openingBalance + summary.netMovement);
  const balanceDifference = round2(currentBalance - calculatedBalance);

  const transactionsWithBalance = attachRunningBalance(balanceAppliedRows, openingBalance);

  const [pendingActivity, reconciliation] = await Promise.all([
    getPendingCounts(bankAccountId),
    getReconciliationSummary(bankAccountId),
  ]);

  const response = {
    bankAccount,
    summary: {
      openingBalance,
      currentBalance,
      calculatedBalance,
      balanceDifference,
      totalDebit: summary.totalDebit,
      totalCredit: summary.totalCredit,
      netMovement: summary.netMovement,
      transactionCount: summary.transactionCount,
      transfers: {
        out: summary.transferOut,
        in: summary.transferIn,
        count: summary.transferCount,
      },
      bySource: summary.bySource,
    },
    pendingActivity,
    reconciliation,
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

async function getAllBankAccountsDetails(options = {}) {
  const { isActive, startDate: startDateRaw, endDate: endDateRaw } = options;
  const startDate = parseDate(startDateRaw);
  const endDate = parseDate(endDateRaw);
  if (endDate) endDate.setHours(23, 59, 59, 999);

  const filter = {};
  if (isActive !== undefined) filter.isActive = isActive === 'true' || isActive === true;

  const bankAccounts = await BankAccount.find(filter)
    .populate('currency', 'name code symbol')
    .select('-__v')
    .sort({ accountName: 1 })
    .lean();

  const accounts = await Promise.all(
    bankAccounts.map(async (account) => {
      const rows = await collectLedgerRows(account._id, { startDate, endDate });
      const summary = summarizeRows(rows);
      const openingBalance = round2(account.openingBalance || 0);
      const currentBalance = round2(account.balance || 0);

      return {
        _id: account._id,
        accountName: account.accountName,
        accountNumber: account.accountNumber,
        bankName: account.bankName,
        branchName: account.branchName,
        accountType: account.accountType,
        currency: account.currency,
        isActive: account.isActive,
        referCode: account.referCode,
        openingBalance,
        currentBalance,
        calculatedBalance: round2(openingBalance + summary.netMovement),
        totalDebit: summary.totalDebit,
        totalCredit: summary.totalCredit,
        netMovement: summary.netMovement,
        transactionCount: summary.transactionCount,
        transfers: {
          out: summary.transferOut,
          in: summary.transferIn,
          count: summary.transferCount,
        },
        bySource: summary.bySource,
      };
    })
  );

  const totals = accounts.reduce(
    (acc, a) => {
      acc.totalOpeningBalance = round2(acc.totalOpeningBalance + a.openingBalance);
      acc.totalCurrentBalance = round2(acc.totalCurrentBalance + a.currentBalance);
      acc.totalDebit = round2(acc.totalDebit + a.totalDebit);
      acc.totalCredit = round2(acc.totalCredit + a.totalCredit);
      acc.netMovement = round2(acc.netMovement + a.netMovement);
      acc.transactionCount += a.transactionCount;
      return acc;
    },
    {
      accountCount: accounts.length,
      totalOpeningBalance: 0,
      totalCurrentBalance: 0,
      totalDebit: 0,
      totalCredit: 0,
      netMovement: 0,
      transactionCount: 0,
    }
  );

  return { totals, accounts };
}

module.exports = {
  getBankAccountDetails,
  getAllBankAccountsDetails,
  collectLedgerRows,
};
