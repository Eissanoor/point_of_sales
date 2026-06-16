const mongoose = require('mongoose');
const BankPaymentVoucher = require('../models/bankPaymentVoucherModel');
const BankAccount = require('../models/bankAccountModel');
const CashBook = require('../models/cashBookModel');
const CashAccount = require('../models/cashAccountModel');
const SupplierPayment = require('../models/supplierPaymentModel');
const Payment = require('../models/paymentModel');
const SupplierJourney = require('../models/supplierJourneyModel');
const PaymentJourney = require('../models/paymentJourneyModel');
const Purchase = require('../models/purchaseModel');
const FinancialPayment = require('../models/financialPaymentModel');
const {
  parseLineDebitCredit,
  computeBalanceDeltaForAccountModel,
  getFinancialPaymentEffect,
  validateJournalBalance,
} = require('../utils/doubleEntryAccounting');

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

const BANK_VOUCHER_BALANCE_POSTED_STATUSES = ['pending', 'approved', 'completed'];

const PAYEE_TYPE_TO_ACCOUNT_MODEL = {
  supplier: 'Supplier',
  customer: 'Customer',
  employee: 'Employee',
  Asset: 'Asset',
  Income: 'Income',
  Liability: 'Liability',
  PartnershipAccount: 'PartnershipAccount',
  CashBook: 'CashBook',
  Capital: 'Capital',
  Owner: 'Owner',
  Employee: 'Employee',
  PropertyAccount: 'PropertyAccount',
};

const normalizeBankVoucherEntryAccountModel = (entry) => {
  let accountModel = entry.accountModel;
  if (Array.isArray(accountModel)) accountModel = accountModel[0];
  if (typeof accountModel !== 'string') return '';
  accountModel = accountModel.trim();
  const normalized = ENTRY_ACCOUNT_MODEL_MAP[accountModel.toLowerCase()] || accountModel;
  entry.accountModel = normalized;
  return normalized;
};

const resolveBankVoucherEntryBankAccountRefs = (entry) => {
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

const resolveBankVoucherEntryCashBookRefs = (entry) => {
  if (entry.accountModel !== 'CashBook') return;
  const accEmpty =
    entry.account === undefined ||
    entry.account === null ||
    (typeof entry.account === 'string' && entry.account.trim() === '');
  const cashEmpty =
    entry.cashBook === undefined ||
    entry.cashBook === null ||
    (typeof entry.cashBook === 'string' && entry.cashBook.trim() === '');
  if (accEmpty && !cashEmpty) {
    entry.account = typeof entry.cashBook === 'string' ? entry.cashBook.trim() : entry.cashBook;
  } else if (cashEmpty && !accEmpty) {
    entry.cashBook = typeof entry.account === 'string' ? entry.account.trim() : entry.account;
  }
};

const resolveBankVoucherEntryCashAccountRefs = (entry) => {
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

const parseBankVoucherEntriesFromBody = (entries) => {
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
    } catch {
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

const validateAndNormalizeBankVoucherEntries = async (parsedEntries) => {
  const balanceCheck = validateJournalBalance(parsedEntries);
  if (!balanceCheck.ok) {
    return {
      ok: false,
      response: {
        status: 400,
        body: {
          status: 'fail',
          message: balanceCheck.message,
          totalDebits: balanceCheck.totalDebits,
          totalCredits: balanceCheck.totalCredits,
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
          body: { status: 'fail', message: `Entry ${i} is invalid.`, receivedEntry: entry },
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
          body: { status: 'fail', message: `Entry ${i} is missing accountModel.`, receivedEntry: entry },
        },
      };
    }

    normalizeBankVoucherEntryAccountModel(entry);
    resolveBankVoucherEntryBankAccountRefs(entry);
    resolveBankVoucherEntryCashBookRefs(entry);
    resolveBankVoucherEntryCashAccountRefs(entry);

    if (!entry.account) {
      return {
        ok: false,
        response: {
          status: 400,
          body: {
            status: 'fail',
            message: `Entry ${i} is missing account.`,
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
          response: { status: 404, body: { status: 'fail', message: `Entry ${i}: bank account not found.` } },
        };
      }
    }
    if (entry.cashBook) {
      const exists = await CashBook.findById(entry.cashBook);
      if (!exists) {
        return {
          ok: false,
          response: { status: 404, body: { status: 'fail', message: `Entry ${i}: cash book not found.` } },
        };
      }
    }
    if (entry.cashAccount) {
      const exists = await CashAccount.findById(entry.cashAccount);
      if (!exists) {
        return {
          ok: false,
          response: { status: 404, body: { status: 'fail', message: `Entry ${i}: cash account not found.` } },
        };
      }
    }

    const { debit, credit } = parseLineDebitCredit(entry);
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
    normalizeBankVoucherEntryAccountModel(entry);
    resolveBankVoucherEntryBankAccountRefs(entry);
    resolveBankVoucherEntryCashBookRefs(entry);
    resolveBankVoucherEntryCashAccountRefs(entry);
    const { debit, credit } = parseLineDebitCredit(entry);
    return {
      account: entry.account,
      cashAccount: entry.cashAccount || undefined,
      bankAccount: entry.bankAccount || undefined,
      cashBook: entry.cashBook || undefined,
      accountModel: entry.accountModel,
      accountName: entry.accountName || '',
      debit,
      credit,
      description: entry.description || '',
    };
  });

  return { ok: true, normalizedEntries, totalDebits: balanceCheck.totalDebits };
};

const isBankVoucherDoubleEntry = (v) => Array.isArray(v.entries) && v.entries.length >= 2;

const parseVoucherAmount = (amount) => {
  const amt = typeof amount === 'number' ? amount : parseFloat(amount);
  return Number.isFinite(amt) && amt > 0 ? amt : 0;
};

/**
 * Build balanced journal lines from legacy bankAccount + payee + voucherType fields.
 * Keeps existing vouchers compatible without stored entries.
 */
const buildLegacyEntriesFromBankVoucher = (voucher) => {
  const amt = parseVoucherAmount(voucher.amount);
  if (!amt || !voucher.bankAccount) return [];

  const bankId = voucher.bankAccount.toString();
  const bankLine = {
    account: bankId,
    bankAccount: bankId,
    accountModel: 'BankAccount',
    accountName: '',
    description: voucher.description || '',
  };

  const payeeModel =
    voucher.payeeModel ||
    PAYEE_TYPE_TO_ACCOUNT_MODEL[voucher.payeeType] ||
    (FINANCIAL_ACCOUNT_MODELS.includes(voucher.payeeType) ? voucher.payeeType : null);

  if (!voucher.payee || !payeeModel || voucher.payeeType === 'other') {
    if (voucher.voucherType === 'receipt') {
      return [{ ...bankLine, debit: amt, credit: 0 }];
    }
    if (voucher.voucherType === 'payment') {
      return [{ ...bankLine, debit: 0, credit: amt }];
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
  }

  if (voucher.voucherType === 'receipt') {
    return [
      { ...bankLine, debit: amt, credit: 0 },
      { ...payeeLine, debit: 0, credit: amt },
    ];
  }

  return [
    { ...payeeLine, debit: amt, credit: 0 },
    { ...bankLine, debit: 0, credit: amt },
  ];
};

const getEffectiveBankVoucherEntries = (voucher) => {
  if (isBankVoucherDoubleEntry(voucher)) return voucher.entries;
  return buildLegacyEntriesFromBankVoucher(voucher);
};

const applyBalanceDeltaToEntry = async (entry) => {
  const { debit, credit } = parseLineDebitCredit(entry);
  const delta = computeBalanceDeltaForAccountModel(entry.accountModel, debit, credit);
  if (!Number.isFinite(delta) || delta === 0) return;

  const bankId = entry.bankAccount || (entry.accountModel === 'BankAccount' ? entry.account : null);
  if (bankId) {
    const bank = await BankAccount.findByIdAndUpdate(bankId, { $inc: { balance: delta } }, { new: true });
    if (!bank) console.error('applyBalanceDeltaToEntry: bank account not found', bankId);
  }

  const cashBookId = entry.cashBook || (entry.accountModel === 'CashBook' ? entry.account : null);
  if (cashBookId) {
    const cashBook = await CashBook.findByIdAndUpdate(cashBookId, { $inc: { balance: delta } }, { new: true });
    if (!cashBook) console.error('applyBalanceDeltaToEntry: cash book not found', cashBookId);
  }
};

const applyEntryBalancesForBankVoucher = async (voucherId) => {
  if (!voucherId || !mongoose.Types.ObjectId.isValid(String(voucherId))) return;

  const voucher = await BankPaymentVoucher.findById(voucherId);
  if (!voucher || voucher.bankBalanceApplied) return;
  if (!BANK_VOUCHER_BALANCE_POSTED_STATUSES.includes(voucher.status)) return;

  const entries = getEffectiveBankVoucherEntries(voucher);
  if (!entries.length) return;

  for (const entry of entries) {
    if (!entry) continue;
    await applyBalanceDeltaToEntry(entry);
  }

  voucher.bankBalanceApplied = true;
  await voucher.save();
};

const reverseEntryBalancesForBankVoucher = async (voucherId) => {
  if (!voucherId || !mongoose.Types.ObjectId.isValid(String(voucherId))) return;

  const voucher = await BankPaymentVoucher.findById(voucherId);
  if (!voucher || !voucher.bankBalanceApplied) return;

  const entries = getEffectiveBankVoucherEntries(voucher);
  for (const entry of entries) {
    if (!entry) continue;
    const { debit, credit } = parseLineDebitCredit(entry);
    const delta = computeBalanceDeltaForAccountModel(entry.accountModel, debit, credit);
    if (!Number.isFinite(delta) || delta === 0) continue;

    const reverseDelta = -delta;
    const bankId = entry.bankAccount || (entry.accountModel === 'BankAccount' ? entry.account : null);
    if (bankId) {
      await BankAccount.findByIdAndUpdate(bankId, { $inc: { balance: reverseDelta } });
    }
    const cashBookId = entry.cashBook || (entry.accountModel === 'CashBook' ? entry.account : null);
    if (cashBookId) {
      await CashBook.findByIdAndUpdate(cashBookId, { $inc: { balance: reverseDelta } });
    }
  }

  voucher.bankBalanceApplied = false;
  await voucher.save();
};

const createTransactionsFromBankVoucherEntries = async (voucher, userId) => {
  if (!voucher || !voucher._id) {
    return {
      createdPayment: null,
      createdSupplierPayment: null,
      createdFinancialPayments: [],
      error: null,
    };
  }

  const freshVoucher = await BankPaymentVoucher.findById(voucher._id);
  if (!freshVoucher) {
    return {
      createdPayment: null,
      createdSupplierPayment: null,
      createdFinancialPayments: [],
      error: null,
    };
  }

  const entries = getEffectiveBankVoucherEntries(freshVoucher);
  if (entries.length < 2) {
    return {
      createdPayment: null,
      createdSupplierPayment: null,
      createdFinancialPayments: [],
      error: null,
    };
  }

  let createdPayment = null;
  let createdSupplierPayment = null;
  const createdFinancialPayments = [];
  let errorDetails = null;

  const mapPaymentMethod = (voucherMethod) => {
    const methodMap = {
      bank_transfer: 'bank_transfer',
      check: 'check',
      online_payment: 'online_payment',
      wire_transfer: 'bank_transfer',
      dd: 'bank_transfer',
      other: 'other',
    };
    return methodMap[voucherMethod] || 'bank_transfer';
  };

  const methodMapForFinancial = {
    bank_transfer: 'bank_transfer',
    check: 'check',
    online_payment: 'online',
    wire_transfer: 'bank_transfer',
    dd: 'bank_transfer',
    other: 'other',
  };

  const transactionId =
    freshVoucher.transactionId ||
    `TRX-BPV-${Date.now()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
  const paymentDate = freshVoucher.voucherDate || new Date();
  const mappedMethod = mapPaymentMethod(freshVoucher.paymentMethod || 'bank_transfer');
  const mappedFinancialMethod =
    methodMapForFinancial[freshVoucher.paymentMethod] || 'bank_transfer';

  const normalizeAccountModel = (m) => {
    const s = (m || '').trim().toLowerCase();
    return ENTRY_ACCOUNT_MODEL_MAP[s] || (m && m.trim() ? m.trim() : '');
  };

  for (const entry of entries) {
    const { debit, credit } = parseLineDebitCredit(entry);
    const normalizedModel = normalizeAccountModel(entry.accountModel);

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
          payments: [
            {
              method: mappedMethod,
              amount,
              bankAccount: freshVoucher.bankAccount || entry.bankAccount || null,
            },
          ],
          paymentDate,
          transactionId,
          status: 'completed',
          notes: freshVoucher.notes || `Payment via bank payment voucher ${freshVoucher.voucherNumber}`,
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
            method: mappedMethod,
            date: paymentDate,
            status: 'completed',
            transactionId,
          },
          paidAmount: newPaidAmount,
          remainingBalance: newRemainingBalance,
          changes: [],
          notes: `Payment of ${amount} via bank payment voucher ${freshVoucher.voucherNumber}. ${
            isAdvancedPayment ? `Advanced: ${Math.abs(newRemainingBalance)}` : `Remaining: ${newRemainingBalance}`
          }. ${freshVoucher.notes || ''}`,
        });

        freshVoucher.relatedPayment = createdPayment._id;
        await freshVoucher.save();
      } catch (err) {
        console.error('Error creating Payment from bank voucher entry:', err);
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
          paymentMethod: mappedMethod,
          paymentDate,
          transactionId,
          status: 'completed',
          notes: freshVoucher.notes || `Payment via bank payment voucher ${freshVoucher.voucherNumber}`,
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
            method: mappedMethod,
            date: paymentDate,
            status: 'completed',
            transactionId,
          },
          paidAmount: newPaidAmount,
          remainingBalance: newRemainingBalance,
          notes: `Payment of ${amount} to supplier via bank payment voucher ${freshVoucher.voucherNumber}. ${
            isAdvancedPayment ? `Advanced: ${Math.abs(newRemainingBalance)}` : `Remaining: ${newRemainingBalance}`
          }. ${freshVoucher.notes || ''}`,
        });

        freshVoucher.relatedSupplierPayment = createdSupplierPayment._id;
        await freshVoucher.save();
      } catch (err) {
        console.error('Error creating SupplierPayment from bank voucher entry:', err);
        errorDetails = err;
      }
    }

    const amount = debit > 0 ? debit : credit;
    const isDebit = debit > 0;
    if (amount > 0 && FINANCIAL_ACCOUNT_MODELS.includes(normalizedModel)) {
      const alreadyCreated =
        freshVoucher.relatedFinancialPayment &&
        normalizedModel === (freshVoucher.financialModel || freshVoucher.payeeType) &&
        String(freshVoucher.financialId || freshVoucher.payee) === String(entry.account);

      if (alreadyCreated) continue;

      try {
        const fp = await FinancialPayment.create({
          name: entry.accountName || `${normalizedModel} bank voucher entry`,
          mobileNo: null,
          code: freshVoucher.referenceNumber || freshVoucher.voucherNumber || null,
          description:
            freshVoucher.description ||
            `Bank payment voucher ${freshVoucher.voucherNumber}: ${isDebit ? 'Debit' : 'Credit'} ${amount} to ${
              entry.accountName || normalizedModel
            }. ${freshVoucher.notes || ''}`.trim(),
          amount,
          currency: freshVoucher.currency || null,
          paymentDate,
          method: mappedFinancialMethod,
          effect: getFinancialPaymentEffect(normalizedModel, isDebit),
          relatedModel: normalizedModel,
          relatedId: entry.account,
          user: userId,
          isActive: true,
        });
        createdFinancialPayments.push(fp);

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
        console.error('Error creating FinancialPayment from bank voucher entry:', err);
        errorDetails = err;
      }
    }
  }

  return { createdPayment, createdSupplierPayment, createdFinancialPayments, error: errorDetails };
};

module.exports = {
  parseBankVoucherEntriesFromBody,
  validateAndNormalizeBankVoucherEntries,
  applyEntryBalancesForBankVoucher,
  reverseEntryBalancesForBankVoucher,
  createTransactionsFromBankVoucherEntries,
  buildLegacyEntriesFromBankVoucher,
  getEffectiveBankVoucherEntries,
  BANK_VOUCHER_BALANCE_POSTED_STATUSES,
  isBankVoucherDoubleEntry,
};
