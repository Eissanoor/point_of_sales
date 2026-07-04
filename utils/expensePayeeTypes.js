const Expense = require('../models/expenseModel');
const ProcurementExpense = require('../models/procurementExpenseModel');
const LogisticsExpense = require('../models/logisticsExpenseModel');
const WarehouseExpense = require('../models/warehouseExpenseModel');
const SalesDistributionExpense = require('../models/salesDistributionExpenseModel');
const FinancialExpense = require('../models/financialExpenseModel');
const OperationalExpense = require('../models/operationalExpenseModel');
const MiscellaneousExpense = require('../models/miscellaneousExpenseModel');

const EXPENSE_CATEGORY_PAYEE_TYPES = [
  'procurement',
  'logistics',
  'warehouse',
  'sales_distribution',
  'financial',
  'operational',
  'miscellaneous',
];

const EXPENSE_CATEGORY_MODELS = {
  procurement: ProcurementExpense,
  logistics: LogisticsExpense,
  warehouse: WarehouseExpense,
  sales_distribution: SalesDistributionExpense,
  financial: FinancialExpense,
  operational: OperationalExpense,
  miscellaneous: MiscellaneousExpense,
};

const isExpenseCategoryPayeeType = (payeeType) =>
  EXPENSE_CATEGORY_PAYEE_TYPES.includes(payeeType);

const isExpensePayeeType = (payeeType) =>
  payeeType === 'Expense' || isExpenseCategoryPayeeType(payeeType);

const buildExpenseDescription = (detail, payeeType) => {
  switch (payeeType) {
    case 'procurement':
      return detail.invoiceNo || detail.purchaseOrderNo || detail.notes || '';
    case 'logistics':
      return detail.route || detail.vehicleContainerNo || detail.notes || '';
    case 'warehouse':
      return detail.expenseSubType || detail.notes || '';
    case 'sales_distribution':
      return detail.description || detail.expenseSubType || detail.notes || '';
    case 'financial':
      return detail.expenseSubType || detail.notes || '';
    case 'operational':
      return detail.department || detail.notes || '';
    case 'miscellaneous':
      return detail.description || detail.expenseSubType || detail.notes || '';
    default:
      return detail.description || detail.notes || '';
  }
};

const resolveExpensePayee = async (payeeType, payeeId, createdBy) => {
  if (!payeeId) {
    return { ok: false, message: 'Expense payee is required' };
  }

  if (payeeType === 'Expense') {
    const expense = await Expense.findOne({ _id: payeeId, isActive: true });
    if (!expense) {
      return { ok: false, message: 'Expense not found' };
    }
    return { ok: true, expense, expenseId: expense._id };
  }

  if (!isExpenseCategoryPayeeType(payeeType)) {
    return { ok: false, message: 'Invalid expense payee type' };
  }

  let expense = await Expense.findOne({
    _id: payeeId,
    expenseType: payeeType,
    isActive: true,
  });
  if (expense) {
    return { ok: true, expense, expenseId: expense._id };
  }

  expense = await Expense.findOne({
    referenceId: payeeId,
    expenseType: payeeType,
    isActive: true,
  });
  if (expense) {
    return { ok: true, expense, expenseId: expense._id };
  }

  const CategoryModel = EXPENSE_CATEGORY_MODELS[payeeType];
  if (!CategoryModel) {
    return { ok: false, message: `${payeeType} expense not found` };
  }

  const detail = await CategoryModel.findById(payeeId);
  if (!detail || detail.isActive === false) {
    return { ok: false, message: `${payeeType} expense not found` };
  }

  if (!createdBy) {
    return {
      ok: false,
      message: 'Authenticated user is required to link expense for voucher',
    };
  }

  expense = await Expense.create({
    expenseType: payeeType,
    referenceId: detail._id,
    totalAmount: detail.totalCost,
    currency: detail.currency,
    exchangeRate: detail.exchangeRate,
    amountInPKR: detail.amountInPKR,
    paymentMethod: detail.paymentMethod,
    expenseDate: detail.createdAt || new Date(),
    description: buildExpenseDescription(detail, payeeType),
    createdBy,
  });

  return { ok: true, expense, expenseId: expense._id };
};

const validateExpensePayee = async (payeeType, payeeId, createdBy) => {
  if (!payeeId || !isExpensePayeeType(payeeType)) {
    return null;
  }

  const resolved = await resolveExpensePayee(payeeType, payeeId, createdBy);
  if (!resolved.ok) {
    return { ok: false, message: resolved.message };
  }

  return {
    ok: true,
    expense: resolved.expense,
    expenseId: resolved.expenseId,
  };
};

const markExpensePaidFromVoucher = async (voucher) => {
  if (!voucher?.payee || !isExpensePayeeType(voucher.payeeType)) {
    return null;
  }

  const resolved = await resolveExpensePayee(
    voucher.payeeType,
    voucher.payee,
    voucher.user
  );
  if (!resolved.ok || !resolved.expense) {
    return null;
  }

  const { syncExpensePaymentAmounts } = require('../services/expenseDetailsService');
  const result = await syncExpensePaymentAmounts(resolved.expense._id);
  return result?.expense || resolved.expense;
};

module.exports = {
  EXPENSE_CATEGORY_PAYEE_TYPES,
  EXPENSE_CATEGORY_MODELS,
  isExpenseCategoryPayeeType,
  isExpensePayeeType,
  validateExpensePayee,
  resolveExpensePayee,
  markExpensePaidFromVoucher,
};
