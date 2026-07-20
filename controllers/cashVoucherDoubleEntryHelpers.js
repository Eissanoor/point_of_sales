const mongoose = require('mongoose');
const CashPaymentVoucher = require('../models/cashPaymentVoucherModel');
const CashAccount = require('../models/cashAccountModel');
const CashBook = require('../models/cashBookModel');
const BankAccount = require('../models/bankAccountModel');
const SupplierPayment = require('../models/supplierPaymentModel');
const Payment = require('../models/paymentModel');
const SupplierJourney = require('../models/supplierJourneyModel');
const PaymentJourney = require('../models/paymentJourneyModel');
const Purchase = require('../models/purchaseModel');
const FinancialPayment = require('../models/financialPaymentModel');
const {
  isDebitNormalAccount,
  isAssetAccount,
  resolveFinancialPaymentEffectFromEntry,
  getFinancialPaymentLedgerLabel,
} = require('../utils/accountDebitCreditRules');

const FINANCIAL_ACCOUNT_MODELS = [
  'Asset',
  'Expense',
  'Income',
  'Liability',
  'PartnershipAccount',
  'CashBook',
  'Capital',
  'Owner',
  'Employee',
  'PropertyAccount',
];

const ENTRY_ACCOUNT_MODEL_MAP = {
  bankaccount: 'BankAccount',
  cashaccount: 'CashAccount',
  supplier: 'Supplier',
  customer: 'Customer',
  expense: 'Expense',
  income: 'Income',
  asset: 'Asset',
  liability: 'Liability',
  equity: 'Equity',
  partnershipaccount: 'PartnershipAccount',
  cashbook: 'CashBook',
  capital: 'Capital',
  owner: 'Owner',
  employee: 'Employee',
  propertyaccount: 'PropertyAccount',
};

const PAYEE_TYPE_TO_ACCOUNT_MODEL = {
  supplier: 'Supplier',
  customer: 'Customer',
  employee: 'Employee',
  Asset: 'Asset',
  Expense: 'Expense',
  Income: 'Income',
  Liability: 'Liability',
  PartnershipAccount: 'PartnershipAccount',
  CashBook: 'CashBook',
  BankAccount: 'BankAccount',
  Capital: 'Capital',
  Owner: 'Owner',
  Employee: 'Employee',
  PropertyAccount: 'PropertyAccount',
  procurement: 'Expense',
  logistics: 'Expense',
  warehouse: 'Expense',
  sales_distribution: 'Expense',
  financial: 'Expense',
  operational: 'Expense',
  miscellaneous: 'Expense',
};

/** Align with cashPaymentVoucherController posting statuses. */
const CASH_VOUCHER_BALANCE_POSTED_STATUSES = ['pending', 'approved', 'completed'];

const parseLineAmount = (value) => {
  const n = typeof value === 'number' ? value : parseFloat(value || 0);
  return Number.isFinite(n) ? n : 0;
};

const parseLineDebitCredit = (entry) => {
  if (!entry) return { debit: 0, credit: 0 };
  return {
    debit: parseLineAmount(entry.debit),
    credit: parseLineAmount(entry.credit),
  };
};

/**
 * Balance delta for cash/bank books: debit = subtract, credit = add (base rules).
 * Asset/Expense do not update cash/bank via this path — they use FinancialPayment.effect.
 */
const computeBalanceDeltaFromDebitCredit = (debit, credit) => {
  let delta = 0;
  const d = parseLineAmount(debit);
  const c = parseLineAmount(credit);
  if (d > 0) delta -= d;
  if (c > 0) delta += c;
  return delta;
};

const parseVoucherAmount = (amount) => {
  const amt = typeof amount === 'number' ? amount : parseFloat(amount);
  return Number.isFinite(amt) && amt > 0 ? amt : 0;
};

const normalizeEntryAccountModel = (accountModel) => {
  const s = (accountModel || '').trim().toLowerCase();
  return ENTRY_ACCOUNT_MODEL_MAP[s] || (accountModel && accountModel.trim ? accountModel.trim() : '');
};

const normalizeCashVoucherEntryAccountModel = (entry) => {
  let accountModel = entry.accountModel;
  if (Array.isArray(accountModel)) accountModel = accountModel[0];
  if (typeof accountModel !== 'string') return '';
  accountModel = accountModel.trim();
  const normalized = ENTRY_ACCOUNT_MODEL_MAP[accountModel.toLowerCase()] || accountModel;
  entry.accountModel = normalized;
  return normalized;
};

const resolveCashVoucherEntryBankAccountRefs = (entry) => {
  if (entry.accountModel !== 'BankAccount') return;
  const accEmpty =
    entry.account === undefined ||
    entry.account === null ||
    (typeof entry.account === 'string' && entry.account.trim() === '');
  const bankEmpty =
    entry.bankAccount === undefined ||
    entry.bankAccount === null ||
    (typeof entry.bankAccount === 'string' && entry.bankAccount.trim() === '');
  if (accEmpty && !bankEmpty) {
    entry.account = typeof entry.bankAccount === 'string' ? entry.bankAccount.trim() : entry.bankAccount;
  } else if (bankEmpty && !accEmpty) {
    entry.bankAccount = typeof entry.account === 'string' ? entry.account.trim() : entry.account;
  }
};

const resolveCashVoucherEntryCashAccountRefs = (entry) => {
  if (entry.accountModel !== 'CashAccount') return;
  const accEmpty =
    entry.account === undefined ||
    entry.account === null ||
    (typeof entry.account === 'string' && entry.account.trim() === '');
  const cashEmpty =
    entry.cashAccount === undefined ||
    entry.cashAccount === null ||
    (typeof entry.cashAccount === 'string' && entry.cashAccount.trim() === '');
  if (accEmpty && !cashEmpty) {
    entry.account = typeof entry.cashAccount === 'string' ? entry.cashAccount.trim() : entry.cashAccount;
  } else if (cashEmpty && !accEmpty) {
    entry.cashAccount = typeof entry.account === 'string' ? entry.account.trim() : entry.account;
  }
};

/**
 * Parse `entries` from JSON body / form-data (same behaviour as journal voucher).
 */
const parseCashVoucherEntriesFromBody = (entries) => {
  let parsedEntries = entries;
  if (typeof entries === 'string') {
    try {
      let cleanString = entries.trim();
      if (
        (cleanString.startsWith('"') && cleanString.endsWith('"')) ||
        (cleanString.startsWith("'") && cleanString.endsWith("'"))
      ) {
        cleanString = cleanString.slice(1, -1);
      }
      cleanString = cleanString
        .replace(/\\n/g, '')
        .replace(/\\r/g, '')
        .replace(/\\t/g, '')
        .replace(/\\'/g, "'")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
      const parsed = JSON.parse(cleanString);
      if (Array.isArray(parsed)) parsedEntries = parsed;
    } catch (e) {
      return null;
    }
  }
  if (!Array.isArray(parsedEntries) && typeof parsedEntries === 'object' && parsedEntries !== null) {
    const keys = Object.keys(parsedEntries);
    const numericKeys = keys.filter((key) => /^\d+$/.test(key));
    if (numericKeys.length > 0) {
      parsedEntries = numericKeys
        .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
        .map((key) => {
          const entryValue = parsedEntries[key];
          if (typeof entryValue === 'string') {
            try {
              return JSON.parse(entryValue);
            } catch {
              return entryValue;
            }
          }
          return entryValue;
        });
    }
  }
  return Array.isArray(parsedEntries) ? parsedEntries : null;
};

/**
 * Validate and normalize lines for save. Returns { ok, normalizedEntries } or { ok: false, response }.
 */
const validateAndNormalizeCashVoucherEntries = async (parsedEntries) => {
  if (!parsedEntries || !Array.isArray(parsedEntries) || parsedEntries.length < 2) {
    return {
      ok: false,
      response: {
        status: 400,
        body: {
          status: 'fail',
          message: 'Cash voucher with entries must have at least 2 lines. Send entries as a JSON array.',
        },
      },
    };
  }

  const totalDebits = parsedEntries.reduce((sum, entry) => {
    const debit = typeof entry.debit === 'string' ? parseFloat(entry.debit) : entry.debit || 0;
    return sum + debit;
  }, 0);
  const totalCredits = parsedEntries.reduce((sum, entry) => {
    const credit = typeof entry.credit === 'string' ? parseFloat(entry.credit) : entry.credit || 0;
    return sum + credit;
  }, 0);

  if (Math.abs(totalDebits - totalCredits) > 0.01) {
    return {
      ok: false,
      response: {
        status: 400,
        body: {
          status: 'fail',
          message: `Total debits (${totalDebits}) must equal total credits (${totalCredits})`,
          totalDebits,
          totalCredits,
        },
      },
    };
  }

  for (let i = 0; i < parsedEntries.length; i++) {
    const entry = parsedEntries[i];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return {
        ok: false,
        response: {
          status: 400,
          body: {
            status: 'fail',
            message: `Entry ${i} is invalid.`,
            receivedEntry: entry,
          },
        },
      };
    }

    let accountModel = entry.accountModel;
    if (Array.isArray(accountModel)) accountModel = accountModel[0];
    if (!accountModel || (typeof accountModel !== 'string' && !Array.isArray(entry.accountModel))) {
      return {
        ok: false,
        response: {
          status: 400,
          body: {
            status: 'fail',
            message: `Entry ${i} is missing accountModel.`,
            receivedEntry: entry,
          },
        },
      };
    }

    normalizeCashVoucherEntryAccountModel(entry);
    resolveCashVoucherEntryBankAccountRefs(entry);
    resolveCashVoucherEntryCashAccountRefs(entry);

    if (!entry.account) {
      return {
        ok: false,
        response: {
          status: 400,
          body: {
            status: 'fail',
            message: `Entry ${i} is missing account. For BankAccount send bankAccount only; for CashAccount send cashAccount only.`,
            receivedEntry: entry,
          },
        },
      };
    }

    if (entry.bankAccount) {
      const exists = await BankAccount.findById(entry.bankAccount);
      if (!exists) {
        return {
          ok: false,
          response: {
            status: 404,
            body: { status: 'fail', message: `Entry ${i}: bank account not found.` },
          },
        };
      }
    }
    if (entry.cashAccount) {
      const exists = await CashAccount.findById(entry.cashAccount);
      if (!exists) {
        return {
          ok: false,
          response: {
            status: 404,
            body: { status: 'fail', message: `Entry ${i}: cash account not found.` },
          },
        };
      }
    }

    const debit = typeof entry.debit === 'string' ? parseFloat(entry.debit) : entry.debit || 0;
    const credit = typeof entry.credit === 'string' ? parseFloat(entry.credit) : entry.credit || 0;
    if (debit < 0 || credit < 0) {
      return {
        ok: false,
        response: { status: 400, body: { status: 'fail', message: 'Debit and credit cannot be negative' } },
      };
    }
    if (debit > 0 && credit > 0) {
      return {
        ok: false,
        response: {
          status: 400,
          body: { status: 'fail', message: 'An entry cannot have both debit and credit' },
        },
      };
    }
    if (debit === 0 && credit === 0) {
      return {
        ok: false,
        response: {
          status: 400,
          body: { status: 'fail', message: 'Each entry must have either debit or credit' },
        },
      };
    }
  }

  const normalizedEntries = parsedEntries.map((entry) => {
    normalizeCashVoucherEntryAccountModel(entry);
    resolveCashVoucherEntryBankAccountRefs(entry);
    resolveCashVoucherEntryCashAccountRefs(entry);
    return {
      account: entry.account,
      cashAccount: entry.cashAccount || undefined,
      bankAccount: entry.bankAccount || undefined,
      accountModel: entry.accountModel,
      accountName: entry.accountName || '',
      debit: typeof entry.debit === 'string' ? parseFloat(entry.debit) : entry.debit || 0,
      credit: typeof entry.credit === 'string' ? parseFloat(entry.credit) : entry.credit || 0,
      description: entry.description || '',
    };
  });

  return { ok: true, normalizedEntries, totalDebits };
};

const isCashVoucherDoubleEntry = (v) => Array.isArray(v.entries) && v.entries.length >= 2;

/**
 * Build journal lines from legacy cashBook + payee fields.
 * Cash/bank always use base rules (debit = subtract, credit = add).
 * Asset/Expense payees use reversed rules (debit = add, credit = subtract).
 */
const buildLegacyEntriesFromCashVoucher = (voucher) => {
  const amt = parseVoucherAmount(voucher.amount);
  if (!amt || !voucher.cashBook) return [];

  const cashBookId = voucher.cashBook.toString();
  const cashLine = {
    account: cashBookId,
    cashBook: cashBookId,
    accountModel: 'CashBook',
    accountName: '',
    description: voucher.description || '',
  };

  const payeeModel =
    voucher.financialModel ||
    PAYEE_TYPE_TO_ACCOUNT_MODEL[voucher.payeeType] ||
    (FINANCIAL_ACCOUNT_MODELS.includes(voucher.payeeType) ? voucher.payeeType : null) ||
    (voucher.payeeModel && voucher.payeeModel !== 'User' ? voucher.payeeModel : null);

  if (!voucher.payee || !payeeModel || voucher.payeeType === 'other') {
    if (voucher.voucherType === 'receipt') {
      return [{ ...cashLine, debit: 0, credit: amt }];
    }
    if (voucher.voucherType === 'payment' || voucher.voucherType === 'transfer') {
      return [{ ...cashLine, debit: amt, credit: 0 }];
    }
    return [];
  }

  const payeeId = voucher.payee.toString();
  const payeeLine = {
    account: payeeId,
    accountModel: payeeModel,
    accountName: voucher.payeeName || '',
    description: voucher.description || '',
  };

  if (payeeModel === 'BankAccount') {
    payeeLine.bankAccount = payeeId;
  } else if (payeeModel === 'CashBook') {
    payeeLine.cashBook = payeeId;
  } else if (payeeModel === 'CashAccount') {
    payeeLine.cashAccount = payeeId;
  }

  const payeeUsesDebitNormal = isDebitNormalAccount(payeeModel);

  if (voucher.voucherType === 'receipt') {
    // Receipt: cash credit (+), payee debit — opposite ledger columns.
    // Asset/Expense (debit-normal): Debit = add; Income/etc: Debit = subtract.
    return [
      { ...cashLine, debit: 0, credit: amt },
      { ...payeeLine, debit: amt, credit: 0 },
    ];
  }

  if (payeeUsesDebitNormal) {
    if (isAssetAccount(payeeModel)) {
      // Asset purchase: cash debit (-), asset debit (+)
      return [
        { ...cashLine, debit: amt, credit: 0 },
        { ...payeeLine, debit: amt, credit: 0 },
      ];
    }
    // Expense payment: cash debit (-), expense credit (-)
    return [
      { ...cashLine, debit: amt, credit: 0 },
      { ...payeeLine, debit: 0, credit: amt },
    ];
  }

  return [
    { ...cashLine, debit: amt, credit: 0 },
    { ...payeeLine, debit: 0, credit: amt },
  ];
};

const getEffectiveCashVoucherEntries = (voucher) => {
  if (isCashVoucherDoubleEntry(voucher)) return voucher.entries;
  return buildLegacyEntriesFromCashVoucher(voucher);
};

const resolveFinancialTargetFromVoucher = (voucher) => {
  if (voucher.financialModel && voucher.financialId && FINANCIAL_ACCOUNT_MODELS.includes(voucher.financialModel)) {
    return { model: voucher.financialModel, id: voucher.financialId };
  }

  const fromPayeeType =
    PAYEE_TYPE_TO_ACCOUNT_MODEL[voucher.payeeType] ||
    (FINANCIAL_ACCOUNT_MODELS.includes(voucher.payeeType) ? voucher.payeeType : null);

  if (fromPayeeType && FINANCIAL_ACCOUNT_MODELS.includes(fromPayeeType) && voucher.payee) {
    return { model: fromPayeeType, id: voucher.payee };
  }

  return null;
};

/**
 * FinancialPayment.effect for cash vouchers — same rules as bank vouchers.
 * Receipt: payee debit → Asset/Expense add; Income/etc subtract.
 * Payment: Asset add; Expense subtract; base accounts add.
 */
const resolveFinancialPaymentEffectFromVoucher = (voucher) => {
  const target = resolveFinancialTargetFromVoucher(voucher);
  const entries = getEffectiveCashVoucherEntries(voucher);

  if (target) {
    const payeeEntry = entries.find((entry) => {
      const normalized = normalizeEntryAccountModel(entry.accountModel);
      return normalized === target.model && String(entry.account) === String(target.id);
    });

    if (payeeEntry) {
      const { debit, credit } = parseLineDebitCredit(payeeEntry);
      return resolveFinancialPaymentEffectFromEntry(debit, credit, target.model);
    }
  }

  const isReceipt = voucher.voucherType === 'receipt';
  if (target && isDebitNormalAccount(target.model)) {
    if (isReceipt) return 'add';
    return target.model === 'Asset' ? 'add' : 'subtract';
  }
  return isReceipt ? 'subtract' : 'add';
};

const resolveFinancialPaymentAmountFromVoucher = (voucher, targetModel, targetId) => {
  const entries = getEffectiveCashVoucherEntries(voucher);
  const payeeEntry = entries.find((entry) => {
    const normalized = normalizeEntryAccountModel(entry.accountModel);
    return normalized === targetModel && String(entry.account) === String(targetId);
  });

  if (payeeEntry) {
    const { debit, credit } = parseLineDebitCredit(payeeEntry);
    const mag = Math.max(debit, credit);
    if (mag > 0) return mag;
  }

  return parseVoucherAmount(voucher.amount);
};

const applyBalanceDeltaToEntry = async (entry) => {
  const { debit, credit } = parseLineDebitCredit(entry);
  const delta = computeBalanceDeltaFromDebitCredit(debit, credit);
  if (!Number.isFinite(delta) || delta === 0) return;

  const cashBookId = entry.cashBook || (entry.accountModel === 'CashBook' ? entry.account : null);
  if (cashBookId) {
    const cashBook = await CashBook.findByIdAndUpdate(cashBookId, { $inc: { balance: delta } }, { new: true });
    if (!cashBook) console.error('applyBalanceDeltaToEntry: cash book not found', cashBookId);
  }

  const bankId = entry.bankAccount || (entry.accountModel === 'BankAccount' ? entry.account : null);
  if (bankId) {
    const bank = await BankAccount.findByIdAndUpdate(bankId, { $inc: { balance: delta } }, { new: true });
    if (!bank) console.error('applyBalanceDeltaToEntry: bank account not found', bankId);
  }

  const cashAccountId = entry.cashAccount || (entry.accountModel === 'CashAccount' ? entry.account : null);
  if (cashAccountId) {
    const cashAccount = await CashAccount.findByIdAndUpdate(
      cashAccountId,
      { $inc: { balance: delta } },
      { new: true }
    );
    if (!cashAccount) console.error('applyBalanceDeltaToEntry: cash account not found', cashAccountId);
  }
};

const applyEntryBalancesForCashVoucher = async (voucherId) => {
  if (!voucherId || !mongoose.Types.ObjectId.isValid(String(voucherId))) return;

  const voucher = await CashPaymentVoucher.findById(voucherId);
  if (!voucher || voucher.cashBalanceApplied) return;
  if (!CASH_VOUCHER_BALANCE_POSTED_STATUSES.includes(voucher.status)) return;

  const entries = getEffectiveCashVoucherEntries(voucher);
  if (!entries.length) return;

  for (const entry of entries) {
    if (!entry) continue;
    await applyBalanceDeltaToEntry(entry);
  }

  voucher.cashBalanceApplied = true;
  await voucher.save();
};

const createTransactionsFromCashVoucherEntries = async (voucher, userId) => {
  if (!voucher || !voucher._id) {
    return {
      createdPayment: null,
      createdSupplierPayment: null,
      createdFinancialPayment: null,
      createdFinancialPayments: [],
      error: null,
    };
  }

  const freshVoucher = await CashPaymentVoucher.findById(voucher._id);
  if (!freshVoucher) {
    return {
      createdPayment: null,
      createdSupplierPayment: null,
      createdFinancialPayment: null,
      createdFinancialPayments: [],
      error: null,
    };
  }

  const entries = getEffectiveCashVoucherEntries(freshVoucher);
  if (entries.length < 2) {
    return {
      createdPayment: null,
      createdSupplierPayment: null,
      createdFinancialPayment: null,
      createdFinancialPayments: [],
      error: null,
    };
  }

  let createdPayment = null;
  let createdSupplierPayment = null;
  let createdFinancialPayment = null;
  const createdFinancialPayments = [];
  let errorDetails = null;
  const paymentMethodForPayment = 'cash';
  const paymentMethodForSupplier = 'cash';

  const transactionId =
    freshVoucher.transactionId ||
    `TRX-CPV-${Date.now()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
  const paymentDate = freshVoucher.voucherDate || new Date();

  for (const entry of entries) {
    const { debit, credit } = parseLineDebitCredit(entry);
    const normalizedModel = normalizeEntryAccountModel(entry.accountModel);

    if (normalizedModel === 'Customer' && debit > 0 && !freshVoucher.relatedPayment) {
      try {
        const Sales = require('../models/salesModel');
        const customerId = entry.account;
        const amount = debit;

        const salesAgg = await Sales.aggregate([
          { $match: { customer: new mongoose.Types.ObjectId(customerId), isActive: true } },
          { $group: { _id: null, total: { $sum: '$grandTotal' } } },
        ]);
        const totalSalesAmount = salesAgg.length > 0 ? salesAgg[0].total || 0 : 0;
        const paymentsAgg = await Payment.aggregate([
          { $match: { customer: new mongoose.Types.ObjectId(customerId), status: { $nin: ['failed', 'refunded'] } } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]);
        const paidSoFar = paymentsAgg.length > 0 ? paymentsAgg[0].total || 0 : 0;
        const remainingBefore = totalSalesAmount - paidSoFar;
        const newPaidAmount = paidSoFar + amount;
        const newRemainingBalance = remainingBefore - amount;
        const isAdvancedPayment = newRemainingBalance < 0;

        const date = new Date(paymentDate);
        const year = date.getFullYear().toString().slice(-2);
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);
        const paymentsCount = await Payment.countDocuments({ createdAt: { $gte: startOfDay, $lt: endOfDay } });
        const paymentNumber = `PAY-${year}${month}${day}-${(paymentsCount + 1).toString().padStart(3, '0')}`;

        createdPayment = await Payment.create({
          paymentNumber,
          customer: customerId,
          sale: freshVoucher.relatedSale || null,
          amount,
          payments: [{ method: paymentMethodForPayment, amount, bankAccount: null }],
          paymentDate,
          transactionId,
          status: 'completed',
          notes: freshVoucher.notes || `Payment via cash voucher ${freshVoucher.voucherNumber}`,
          attachments: freshVoucher.attachments || [],
          user: userId,
          isPartial: false,
          currency: freshVoucher.currency || null,
          paymentType: freshVoucher.relatedSale ? 'sale_payment' : 'advance_payment',
        });

        await PaymentJourney.create({
          payment: createdPayment._id,
          customer: customerId,
          user: userId,
          action: 'payment_made',
          paymentDetails: {
            amount,
            method: paymentMethodForPayment,
            date: paymentDate,
            status: 'completed',
            transactionId,
          },
          paidAmount: newPaidAmount,
          remainingBalance: newRemainingBalance,
          changes: [],
          notes: `Payment of ${amount} via cash voucher ${freshVoucher.voucherNumber}. ${
            isAdvancedPayment ? `Advanced: ${Math.abs(newRemainingBalance)}` : `Remaining: ${newRemainingBalance}`
          }. ${freshVoucher.notes || ''}`,
        });

        freshVoucher.relatedPayment = createdPayment._id;
        await freshVoucher.save();
      } catch (err) {
        console.error('Error creating Payment from cash voucher entry:', err);
        errorDetails = err;
      }
    }

    if (normalizedModel === 'Supplier' && credit > 0 && !freshVoucher.relatedSupplierPayment) {
      try {
        const amount = credit;
        const supplierId = entry.account;

        const purchasesAgg = await Purchase.aggregate([
          { $match: { supplier: new mongoose.Types.ObjectId(supplierId), isActive: true } },
          { $group: { _id: null, total: { $sum: '$totalAmount' } } },
        ]);
        const totalPurchasesAmount = purchasesAgg.length > 0 ? purchasesAgg[0].total || 0 : 0;
        const paymentsAgg = await SupplierPayment.aggregate([
          { $match: { supplier: new mongoose.Types.ObjectId(supplierId), status: { $nin: ['failed', 'refunded'] } } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]);
        const paidSoFar = paymentsAgg.length > 0 ? paymentsAgg[0].total || 0 : 0;
        const remainingBefore = totalPurchasesAmount - paidSoFar;
        const newPaidAmount = paidSoFar + amount;
        const newRemainingBalance = remainingBefore - amount;
        const isAdvancedPayment = newRemainingBalance < 0;

        const paymentCount = await SupplierPayment.countDocuments();
        const paymentNumber = `SP-${paymentCount + 1}`;

        createdSupplierPayment = await SupplierPayment.create({
          paymentNumber,
          supplier: supplierId,
          amount,
          paymentMethod: paymentMethodForSupplier,
          paymentDate,
          transactionId,
          status: 'completed',
          notes: freshVoucher.notes || `Payment via cash voucher ${freshVoucher.voucherNumber}`,
          attachments: freshVoucher.attachments || [],
          user: userId,
          isPartial: false,
          currency: freshVoucher.currency || null,
          products: [],
        });

        await SupplierJourney.create({
          supplier: supplierId,
          user: userId,
          action: 'payment_made',
          payment: {
            amount,
            method: paymentMethodForSupplier,
            date: paymentDate,
            status: 'completed',
            transactionId,
          },
          paidAmount: newPaidAmount,
          remainingBalance: newRemainingBalance,
          notes: `Payment of ${amount} to supplier via cash voucher ${freshVoucher.voucherNumber}. ${
            isAdvancedPayment ? `Advanced: ${Math.abs(newRemainingBalance)}` : `Remaining: ${newRemainingBalance}`
          }. ${freshVoucher.notes || ''}`,
        });

        freshVoucher.relatedSupplierPayment = createdSupplierPayment._id;
        await freshVoucher.save();
      } catch (err) {
        console.error('Error creating SupplierPayment from cash voucher entry:', err);
        errorDetails = err;
      }
    }

    const amount = Math.max(debit, credit);
    if (amount > 0 && FINANCIAL_ACCOUNT_MODELS.includes(normalizedModel)) {
      const alreadyCreated =
        freshVoucher.relatedFinancialPayment &&
        normalizedModel === (freshVoucher.financialModel || freshVoucher.payeeType) &&
        String(freshVoucher.financialId || freshVoucher.payee) === String(entry.account);

      if (alreadyCreated) continue;

      // Skip source cash book line — source ledger is handled separately
      if (
        normalizedModel === 'CashBook' &&
        freshVoucher.cashBook &&
        String(entry.account) === String(freshVoucher.cashBook)
      ) {
        continue;
      }

      const effect = resolveFinancialPaymentEffectFromEntry(debit, credit, normalizedModel);
      const ledgerLabel = getFinancialPaymentLedgerLabel(effect, normalizedModel);

      try {
        const fp = await FinancialPayment.create({
          name: entry.accountName || `${normalizedModel} cash voucher entry`,
          mobileNo: null,
          code: freshVoucher.referenceNumber || freshVoucher.voucherNumber || null,
          description:
            freshVoucher.description ||
            `Cash voucher ${freshVoucher.voucherNumber}: ${ledgerLabel} ${amount} to ${
              entry.accountName || normalizedModel
            }. ${freshVoucher.notes || ''}`.trim(),
          amount,
          currency: freshVoucher.currency || null,
          paymentDate,
          method: 'cash',
          effect,
          relatedModel: normalizedModel,
          relatedId: entry.account,
          user: userId,
          isActive: true,
        });
        createdFinancialPayments.push(fp);
        createdFinancialPayment = createdFinancialPayment || fp;

        if (!freshVoucher.relatedFinancialPayments || !Array.isArray(freshVoucher.relatedFinancialPayments)) {
          freshVoucher.relatedFinancialPayments = [];
        }
        freshVoucher.relatedFinancialPayments.push(fp._id);

        if (!freshVoucher.relatedFinancialPayment) {
          freshVoucher.relatedFinancialPayment = fp._id;
          freshVoucher.financialModel = normalizedModel;
          freshVoucher.financialId = entry.account;
        }

        await freshVoucher.save();
      } catch (err) {
        console.error('Error creating FinancialPayment from cash voucher entry:', err);
        errorDetails = err;
      }
    }
  }

  return {
    createdPayment,
    createdSupplierPayment,
    createdFinancialPayment,
    createdFinancialPayments,
    error: errorDetails,
  };
};

module.exports = {
  parseCashVoucherEntriesFromBody,
  validateAndNormalizeCashVoucherEntries,
  applyEntryBalancesForCashVoucher,
  createTransactionsFromCashVoucherEntries,
  buildLegacyEntriesFromCashVoucher,
  getEffectiveCashVoucherEntries,
  resolveFinancialPaymentEffectFromVoucher,
  resolveFinancialPaymentEffectFromEntry,
  resolveFinancialPaymentAmountFromVoucher,
  getFinancialPaymentLedgerLabel,
  CASH_VOUCHER_BALANCE_POSTED_STATUSES,
  isCashVoucherDoubleEntry,
};
