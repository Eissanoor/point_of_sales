const mongoose = require('mongoose');
const SarafEntryVoucher = require('../models/sarafEntryVoucherModel');
const BankAccount = require('../models/bankAccountModel');
const SupplierPayment = require('../models/supplierPaymentModel');
const Payment = require('../models/paymentModel');
const SupplierJourney = require('../models/supplierJourneyModel');
const PaymentJourney = require('../models/paymentJourneyModel');
const Purchase = require('../models/purchaseModel');
const FinancialPayment = require('../models/financialPaymentModel');
const Currency = require('../models/currencyModel');

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

const JOURNAL_ACCOUNT_MODEL_MAP = {
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

const normalizeJournalEntryAccountModel = (entry) => {
  let accountModel = entry.accountModel;
  if (Array.isArray(accountModel)) accountModel = accountModel[0];
  if (typeof accountModel !== 'string') return '';
  accountModel = accountModel.trim();
  const normalized = JOURNAL_ACCOUNT_MODEL_MAP[accountModel.toLowerCase()] || accountModel;
  entry.accountModel = normalized;
  return normalized;
};

const resolveJournalEntryBankAccountRefs = (entry) => {
  const model = entry.accountModel;
  if (model !== 'BankAccount') return;

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

/**
 * Parse entries from JSON body / form-data (same patterns as journal payment voucher).
 */
function parseSarafEntriesInput(entries) {
  if (entries === undefined || entries === null) {
    return { error: null, parsedEntries: null };
  }

  let parsedEntries = entries;

  if (typeof entries === 'string') {
    try {
      let cleanString = entries.trim();
      if ((cleanString.startsWith('"') && cleanString.endsWith('"')) ||
        (cleanString.startsWith("'") && cleanString.endsWith("'"))) {
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
      if (Array.isArray(parsed)) {
        parsedEntries = parsed;
      }
    } catch (e) {
      return { error: 'Invalid entries format. Entries must be a valid JSON array.', parsedEntries: null };
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

  if (!parsedEntries || !Array.isArray(parsedEntries)) {
    return { error: 'Entries must be an array.', parsedEntries: null };
  }

  return { error: null, parsedEntries };
}

/** Saraf journal postings run when the voucher reaches a finalized ledger state (same idea as journal “posted/completed”). */
const SARAF_BANK_BALANCE_POSTED_STATUSES = ['completed'];

async function applyBankBalanceForSarafVoucher(voucherId) {
  if (!voucherId || !mongoose.Types.ObjectId.isValid(String(voucherId))) return;

  const voucher = await SarafEntryVoucher.findById(voucherId);
  if (!voucher || voucher.bankBalanceApplied) return;
  if (!SARAF_BANK_BALANCE_POSTED_STATUSES.includes(voucher.status)) return;
  if (!Array.isArray(voucher.entries) || voucher.entries.length === 0) return;

  for (const entry of voucher.entries) {
    if (!entry || !entry.bankAccount) continue;

    const debit = typeof entry.debit === 'number' ? entry.debit : parseFloat(entry.debit || 0);
    const credit = typeof entry.credit === 'number' ? entry.credit : parseFloat(entry.credit || 0);

    let delta = 0;
    if (Number.isFinite(debit) && debit > 0) delta -= debit;
    if (Number.isFinite(credit) && credit > 0) delta += credit;
    if (!Number.isFinite(delta) || delta === 0) continue;

    const bank = await BankAccount.findByIdAndUpdate(
      entry.bankAccount,
      { $inc: { balance: delta } },
      { new: true }
    );

    if (!bank) {
      console.error('applyBankBalanceForSarafVoucher: bank account not found', entry.bankAccount);
    }
  }

  voucher.bankBalanceApplied = true;
  await voucher.save();
}

/**
 * Create Payment, SupplierPayment, FinancialPayment from saraf journal-style entries (per-line currency).
 */
async function createTransactionsFromSarafEntries(voucher, userId) {
  if (!voucher || !voucher._id || !voucher.entries || !Array.isArray(voucher.entries)) {
    return { createdPayment: null, createdSupplierPayment: null, createdFinancialPayments: [], error: null };
  }

  const freshVoucher = await SarafEntryVoucher.findById(voucher._id);
  if (!freshVoucher) return { createdPayment: null, createdSupplierPayment: null, createdFinancialPayments: [], error: null };

  let createdPayment = null;
  let createdSupplierPayment = null;
  const createdFinancialPayments = [];
  let errorDetails = null;
  const paymentMethodForPayment = 'other';
  const paymentMethodForSupplier = 'bank_transfer';

  const lineCurrency = (entry) => entry.currency || null;

  const transactionId =
    freshVoucher.transactionId || `TRX-SEV-${Date.now()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
  const paymentDate = freshVoucher.voucherDate || new Date();

  const normalizeAccountModel = (m) => {
    const s = (m || '').trim().toLowerCase();
    const map = {
      customer: 'Customer',
      supplier: 'Supplier',
      bankaccount: 'BankAccount',
      cashaccount: 'CashAccount',
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
    return map[s] || (m && m.trim() ? m.trim() : '');
  };

  for (const entry of freshVoucher.entries) {
    const debit = typeof entry.debit === 'number' ? entry.debit : parseFloat(entry.debit || 0);
    const credit = typeof entry.credit === 'number' ? entry.credit : parseFloat(entry.credit || 0);
    const normalizedModel = normalizeAccountModel(entry.accountModel);
    const payCurrency = lineCurrency(entry);

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
          notes: freshVoucher.notes || `Payment via saraf voucher ${freshVoucher.voucherNumber}`,
          attachments: freshVoucher.attachments || [],
          user: userId,
          isPartial: false,
          currency: payCurrency,
          paymentType: freshVoucher.relatedSale ? 'sale_payment' : 'advance_payment',
        });

        await PaymentJourney.create({
          payment: createdPayment._id,
          customer: customerId,
          user: userId,
          action: 'payment_made',
          paymentDetails: { amount, method: paymentMethodForPayment, date: paymentDate, status: 'completed', transactionId },
          paidAmount: newPaidAmount,
          remainingBalance: newRemainingBalance,
          changes: [],
          notes: `Payment of ${amount} received via saraf voucher ${freshVoucher.voucherNumber}. ${isAdvancedPayment ? `Advanced: ${Math.abs(newRemainingBalance)}` : `Remaining: ${newRemainingBalance}`}. ${freshVoucher.notes || ''}`,
        });

        freshVoucher.relatedPayment = createdPayment._id;
        await freshVoucher.save();
      } catch (err) {
        console.error('Error creating Payment from saraf entry:', err);
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
          notes: freshVoucher.notes || `Payment via saraf voucher ${freshVoucher.voucherNumber}`,
          attachments: freshVoucher.attachments || [],
          user: userId,
          isPartial: false,
          currency: payCurrency,
          products: [],
        });

        await SupplierJourney.create({
          supplier: supplierId,
          user: userId,
          action: 'payment_made',
          payment: { amount, method: paymentMethodForSupplier, date: paymentDate, status: 'completed', transactionId },
          paidAmount: newPaidAmount,
          remainingBalance: newRemainingBalance,
          notes: `Payment of ${amount} to supplier via saraf voucher ${freshVoucher.voucherNumber}. ${isAdvancedPayment ? `Advanced: ${Math.abs(newRemainingBalance)}` : `Remaining: ${newRemainingBalance}`}. ${freshVoucher.notes || ''}`,
        });

        freshVoucher.relatedSupplierPayment = createdSupplierPayment._id;
        await freshVoucher.save();
      } catch (err) {
        console.error('Error creating SupplierPayment from saraf entry:', err);
        errorDetails = err;
      }
    }

    const amount = debit > 0 ? debit : credit;
    const isDebit = debit > 0;
    if (amount > 0 && FINANCIAL_ACCOUNT_MODELS.includes(normalizedModel)) {
      try {
        const fp = await FinancialPayment.create({
          name: entry.accountName || `${normalizedModel} saraf entry`,
          mobileNo: null,
          code: freshVoucher.referenceNumber || freshVoucher.voucherNumber || null,
          description:
            freshVoucher.description ||
            `Saraf voucher ${freshVoucher.voucherNumber}: ${isDebit ? 'Debit' : 'Credit'} ${amount} to ${entry.accountName || normalizedModel}. ${freshVoucher.notes || ''}`.trim(),
          amount,
          paymentDate,
          method: 'other',
          effect: isDebit ? 'subtract' : 'add',
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
        await freshVoucher.save();
      } catch (err) {
        console.error('Error creating FinancialPayment from saraf entry:', err);
        errorDetails = err;
      }
    }
  }

  return { createdPayment, createdSupplierPayment, createdFinancialPayments, error: errorDetails };
}

/**
 * Validate journal-style saraf entries (multi-currency double entry in base units).
 */
async function validateSarafJournalEntries(parsedEntries) {
  if (!parsedEntries || !Array.isArray(parsedEntries) || parsedEntries.length < 2) {
    return {
      ok: false,
      status: 400,
      message: 'Saraf journal voucher must have at least 2 entries.',
    };
  }

  let totalBaseDebits = 0;
  let totalBaseCredits = 0;

  for (let i = 0; i < parsedEntries.length; i++) {
    const entry = parsedEntries[i];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return { ok: false, status: 400, message: `Entry ${i} is invalid.` };
    }

    normalizeJournalEntryAccountModel(entry);
    resolveJournalEntryBankAccountRefs(entry);

    if (!entry.accountModel) {
      return { ok: false, status: 400, message: `Entry ${i} is missing accountModel.` };
    }

    if (!entry.account) {
      return {
        ok: false,
        status: 400,
        message: `Entry ${i} is missing account. For BankAccount you may send bankAccount only.`,
      };
    }

    if (!entry.currency) {
      return { ok: false, status: 400, message: `Entry ${i} is missing currency (per-line currency is required).` };
    }

    const currencyExists = await Currency.findById(entry.currency);
    if (!currencyExists) {
      return { ok: false, status: 404, message: `Entry ${i}: currency not found.` };
    }

    if (entry.bankAccount) {
      const bankAccountExists = await BankAccount.findById(entry.bankAccount);
      if (!bankAccountExists) {
        return { ok: false, status: 404, message: `Entry ${i}: bank account not found.` };
      }
    }

    const debit = typeof entry.debit === 'string' ? parseFloat(entry.debit) : entry.debit || 0;
    const credit = typeof entry.credit === 'string' ? parseFloat(entry.credit) : entry.credit || 0;

    if (debit < 0 || credit < 0) {
      return { ok: false, status: 400, message: 'Debit and credit amounts cannot be negative.' };
    }
    if (debit > 0 && credit > 0) {
      return { ok: false, status: 400, message: 'An entry cannot have both debit and credit amounts.' };
    }
    if (debit === 0 && credit === 0) {
      return { ok: false, status: 400, message: 'Each entry must have either a debit or a credit amount.' };
    }

    const exchangeRate =
      entry.exchangeRate !== undefined && entry.exchangeRate !== null && entry.exchangeRate !== ''
        ? typeof entry.exchangeRate === 'string'
          ? parseFloat(entry.exchangeRate)
          : entry.exchangeRate
        : 1;

    if (!Number.isFinite(exchangeRate) || exchangeRate < 0) {
      return { ok: false, status: 400, message: `Entry ${i}: exchangeRate must be a non-negative number.` };
    }

    if (debit > 0) totalBaseDebits += debit * exchangeRate;
    if (credit > 0) totalBaseCredits += credit * exchangeRate;
  }

  if (Math.abs(totalBaseDebits - totalBaseCredits) > 0.01) {
    return {
      ok: false,
      status: 400,
      message: `Total debits and credits must balance in base terms (debit×rate vs credit×rate). Totals: ${totalBaseDebits} vs ${totalBaseCredits}`,
      totalBaseDebits,
      totalBaseCredits,
    };
  }

  return { ok: true };
}

function mapNormalizedSarafEntries(parsedEntries) {
  return parsedEntries.map((entry) => {
    normalizeJournalEntryAccountModel(entry);
    resolveJournalEntryBankAccountRefs(entry);
    const exchangeRate =
      entry.exchangeRate !== undefined && entry.exchangeRate !== null && entry.exchangeRate !== ''
        ? typeof entry.exchangeRate === 'string'
          ? parseFloat(entry.exchangeRate)
          : entry.exchangeRate
        : 1;
    return {
      account: entry.account,
      bankAccount: entry.bankAccount || undefined,
      accountModel: entry.accountModel,
      accountName: entry.accountName || '',
      debit: typeof entry.debit === 'string' ? parseFloat(entry.debit) : entry.debit || 0,
      credit: typeof entry.credit === 'string' ? parseFloat(entry.credit) : entry.credit || 0,
      description: entry.description || '',
      currency: entry.currency,
      exchangeRate: Number.isFinite(exchangeRate) ? exchangeRate : 1,
    };
  });
}

module.exports = {
  parseSarafEntriesInput,
  validateSarafJournalEntries,
  mapNormalizedSarafEntries,
  normalizeJournalEntryAccountModel,
  resolveJournalEntryBankAccountRefs,
  createTransactionsFromSarafEntries,
  applyBankBalanceForSarafVoucher,
  SARAF_BANK_BALANCE_POSTED_STATUSES,
};
