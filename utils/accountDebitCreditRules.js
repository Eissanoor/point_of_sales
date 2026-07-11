/**
 * Debit/credit balance rules by account type.
 *
 * Base (credit-normal): credit = add, debit = subtract — Bank, Income, Liability, etc.
 * Reversed (debit-normal): debit = add, credit = subtract — Asset, Expense.
 */

const DEBIT_NORMAL_MODELS = ['Asset', 'Expense'];

const EXPENSE_CATEGORY_ACCOUNT_MODELS = {
  procurement: 'Expense',
  logistics: 'Expense',
  warehouse: 'Expense',
  sales_distribution: 'Expense',
  financial: 'Expense',
  operational: 'Expense',
  miscellaneous: 'Expense',
};

const parseAmount = (value) => {
  const n = typeof value === 'number' ? value : parseFloat(value || 0);
  return Number.isFinite(n) ? n : 0;
};

const normalizeFinancialAccountModel = (accountModel) => {
  const raw = (accountModel || '').trim();
  if (!raw) return '';

  const lower = raw.toLowerCase();
  if (lower === 'asset') return 'Asset';
  if (lower === 'expense') return 'Expense';
  if (EXPENSE_CATEGORY_ACCOUNT_MODELS[lower]) return 'Expense';
  if (EXPENSE_CATEGORY_ACCOUNT_MODELS[raw]) return 'Expense';

  return raw;
};

const isDebitNormalAccount = (accountModel) =>
  DEBIT_NORMAL_MODELS.includes(normalizeFinancialAccountModel(accountModel));

const isAssetAccount = (accountModel) =>
  normalizeFinancialAccountModel(accountModel) === 'Asset';

const isExpenseAccount = (accountModel) =>
  normalizeFinancialAccountModel(accountModel) === 'Expense';

/**
 * Signed balance change from a journal line for the given account type.
 * Positive = balance increases, negative = balance decreases.
 */
const computeLedgerBalanceDelta = (debit, credit, accountModel) => {
  const d = parseAmount(debit);
  const c = parseAmount(credit);

  if (isDebitNormalAccount(accountModel)) {
    return d - c;
  }

  return c - d;
};

/**
 * FinancialPayment.effect from journal line side and account type.
 * 'add' = balance increases, 'subtract' = balance decreases.
 */
const resolveFinancialPaymentEffectFromEntry = (debit, credit, accountModel) => {
  const delta = computeLedgerBalanceDelta(debit, credit, accountModel);
  if (delta > 0) return 'add';
  if (delta < 0) return 'subtract';
  return 'add';
};

const getFinancialPaymentLedgerLabel = (effect, accountModel) => {
  const isAdd = effect !== 'subtract';
  if (isDebitNormalAccount(accountModel)) {
    return isAdd ? 'Debit' : 'Credit';
  }
  return isAdd ? 'Credit' : 'Debit';
};

/**
 * Map stored FinancialPayment effect to display debit/credit columns.
 */
const paymentEffectToDebitCredit = (amount, effect, accountModel) => {
  const amt = Math.round((parseAmount(amount) + Number.EPSILON) * 100) / 100;
  const isAdd = effect !== 'subtract';

  if (isDebitNormalAccount(accountModel)) {
    return {
      debit: isAdd ? amt : 0,
      credit: isAdd ? 0 : amt,
      ledgerLabel: isAdd ? 'Debit' : 'Credit',
    };
  }

  return {
    debit: isAdd ? 0 : amt,
    credit: isAdd ? amt : 0,
    ledgerLabel: isAdd ? 'Credit' : 'Debit',
  };
};

const attachRunningBalanceForAccount = (transactions, openingBalance, accountModel) => {
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const asc = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));
  let running = round2(openingBalance || 0);

  for (const row of asc) {
    if (row.balanceApplied !== false) {
      running = round2(running + computeLedgerBalanceDelta(row.debit, row.credit, accountModel));
    }
    row.runningBalance = running;
  }

  return asc.sort((a, b) => new Date(b.date) - new Date(a.date));
};

module.exports = {
  DEBIT_NORMAL_MODELS,
  EXPENSE_CATEGORY_ACCOUNT_MODELS,
  normalizeFinancialAccountModel,
  isDebitNormalAccount,
  isAssetAccount,
  isExpenseAccount,
  computeLedgerBalanceDelta,
  resolveFinancialPaymentEffectFromEntry,
  getFinancialPaymentLedgerLabel,
  paymentEffectToDebitCredit,
  attachRunningBalanceForAccount,
};
