/**
 * Standard double-entry balance rules by account type.
 *
 * Asset / Expense (debit-normal):  debit increases balance, credit decreases
 * Liability / Income / Equity (credit-normal): credit increases balance, debit decreases
 */

const MODEL_ACCOUNT_TYPES = {
  BankAccount: 'Asset',
  CashBook: 'Asset',
  CashAccount: 'Asset',
  Asset: 'Asset',
  PropertyAccount: 'Asset',
  Expense: 'Expense',
  Income: 'Income',
  Liability: 'Liability',
  PartnershipAccount: 'Liability',
  Employee: 'Liability',
  Capital: 'Equity',
  Owner: 'Equity',
  Equity: 'Equity',
  Supplier: null,
  Customer: null,
};

const DEBIT_NORMAL_TYPES = new Set(['Asset', 'Expense']);
const CREDIT_NORMAL_TYPES = new Set(['Liability', 'Income', 'Equity']);

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

const getAccountType = (accountModel) => {
  if (!accountModel || typeof accountModel !== 'string') return null;
  return MODEL_ACCOUNT_TYPES[accountModel.trim()] ?? null;
};

/**
 * Signed balance change for an account line using standard accounting rules.
 * Positive delta increases the stored balance; negative decreases it.
 */
const computeBalanceDeltaForAccountType = (accountType, debit, credit) => {
  const d = parseLineAmount(debit);
  const c = parseLineAmount(credit);
  if (!accountType) return 0;

  if (DEBIT_NORMAL_TYPES.has(accountType)) {
    return d - c;
  }
  if (CREDIT_NORMAL_TYPES.has(accountType)) {
    return c - d;
  }
  return 0;
};

const computeBalanceDeltaForAccountModel = (accountModel, debit, credit) =>
  computeBalanceDeltaForAccountType(getAccountType(accountModel), debit, credit);

/**
 * FinancialPayment.effect maps ledger sign for related financial accounts.
 */
const getFinancialPaymentEffect = (accountModel, isDebit) => {
  const accountType = getAccountType(accountModel);
  if (!accountType) {
    return isDebit ? 'subtract' : 'add';
  }
  if (DEBIT_NORMAL_TYPES.has(accountType)) {
    return isDebit ? 'add' : 'subtract';
  }
  return isDebit ? 'subtract' : 'add';
};

/**
 * Validate that total debits equal total credits (tolerance 0.01).
 */
const validateJournalBalance = (entries, tolerance = 0.01) => {
  if (!Array.isArray(entries) || entries.length < 2) {
    return {
      ok: false,
      message: 'Journal must have at least 2 lines.',
      totalDebits: 0,
      totalCredits: 0,
    };
  }

  const totalDebits = entries.reduce((sum, entry) => sum + parseLineDebitCredit(entry).debit, 0);
  const totalCredits = entries.reduce((sum, entry) => sum + parseLineDebitCredit(entry).credit, 0);

  if (Math.abs(totalDebits - totalCredits) > tolerance) {
    return {
      ok: false,
      message: `Total debits (${totalDebits}) must equal total credits (${totalCredits})`,
      totalDebits,
      totalCredits,
    };
  }

  return { ok: true, totalDebits, totalCredits };
};

const isDebitNormalAccountModel = (accountModel) =>
  DEBIT_NORMAL_TYPES.has(getAccountType(accountModel));

const isCreditNormalAccountModel = (accountModel) =>
  CREDIT_NORMAL_TYPES.has(getAccountType(accountModel));

module.exports = {
  MODEL_ACCOUNT_TYPES,
  DEBIT_NORMAL_TYPES,
  CREDIT_NORMAL_TYPES,
  parseLineAmount,
  parseLineDebitCredit,
  getAccountType,
  computeBalanceDeltaForAccountType,
  computeBalanceDeltaForAccountModel,
  getFinancialPaymentEffect,
  validateJournalBalance,
  isDebitNormalAccountModel,
  isCreditNormalAccountModel,
};
