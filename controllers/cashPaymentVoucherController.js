const mongoose = require('mongoose');
const CashPaymentVoucher = require('../models/cashPaymentVoucherModel');
const CashBook = require('../models/cashBookModel');
const BankAccount = require('../models/bankAccountModel');
const SupplierPayment = require('../models/supplierPaymentModel');
const Payment = require('../models/paymentModel');
const SupplierJourney = require('../models/supplierJourneyModel');
const PaymentJourney = require('../models/paymentJourneyModel');
const Purchase = require('../models/purchaseModel');
const FinancialPayment = require('../models/financialPaymentModel');
const APIFeatures = require('../utils/apiFeatures');
const cloudinary = require('cloudinary').v2;
const {
  isExpensePayeeType,
  validateExpensePayee,
  markExpensePaidFromVoucher,
} = require('../utils/expensePayeeTypes');
const {
  resolveFinancialPaymentEffectFromVoucher,
  resolveFinancialPaymentAmountFromVoucher,
  getFinancialPaymentLedgerLabel,
  CASH_VOUCHER_BALANCE_POSTED_STATUSES,
} = require('./cashVoucherDoubleEntryHelpers');

/** Statuses where the cash movement is considered posted (balance should reflect the voucher). */
const CASH_BALANCE_POSTED_STATUSES = CASH_VOUCHER_BALANCE_POSTED_STATUSES;

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

const validatePayeeForVoucher = async (payeeType, payeeId, createdBy) => {
  if (!payeeId || payeeType === 'other') {
    return { ok: true };
  }

  const expenseValidation = await validateExpensePayee(payeeType, payeeId, createdBy);
  if (expenseValidation) {
    return expenseValidation.ok
      ? {
          ok: true,
          expense: expenseValidation.expense,
          expenseId: expenseValidation.expenseId,
        }
      : { ok: false, message: expenseValidation.message };
  }

  let PayeeModel;
  if (payeeType === 'supplier') {
    PayeeModel = require('../models/supplierModel');
  } else if (payeeType === 'customer') {
    PayeeModel = require('../models/customerModel');
  } else if (payeeType === 'employee') {
    PayeeModel = require('../models/userModel');
  } else if (payeeType === 'Asset') {
    PayeeModel = require('../models/assetModel');
  } else if (payeeType === 'Income') {
    PayeeModel = require('../models/incomeModel');
  } else if (payeeType === 'Liability') {
    PayeeModel = require('../models/liabilityModel');
  } else if (payeeType === 'PartnershipAccount') {
    PayeeModel = require('../models/partnershipAccountModel');
  } else if (payeeType === 'CashBook') {
    PayeeModel = require('../models/cashBookModel');
  } else if (payeeType === 'BankAccount') {
    PayeeModel = require('../models/bankAccountModel');
  } else if (payeeType === 'Capital') {
    PayeeModel = require('../models/capitalModel');
  } else if (payeeType === 'Owner') {
    PayeeModel = require('../models/ownerModel');
  } else if (payeeType === 'Employee') {
    PayeeModel = require('../models/employeeModel');
  } else if (payeeType === 'PropertyAccount') {
    PayeeModel = require('../models/propertyAccountModel');
  }

  if (!PayeeModel) {
    return { ok: true };
  }

  const payeeExists = await PayeeModel.findById(payeeId);
  if (!payeeExists) {
    return { ok: false, message: `${payeeType} not found` };
  }

  return { ok: true };
};

/**
 * Payee-side CashBook/BankAccount delta (base / credit-normal accounts only).
 * Asset/Expense effects use resolveFinancialPaymentEffectFromVoucher instead.
 */
const getPayeeEffectForCashVoucher = (voucherType) =>
  voucherType === 'receipt' ? 'subtract' : 'add';

const shouldCreateSupplierPaymentForVoucher = (voucherType) =>
  voucherType !== 'receipt';

const shouldCreateCustomerPaymentForVoucher = (voucherType) =>
  voucherType !== 'payment';

const shouldCreateLedgerTransactionForStatus = (status) =>
  CASH_BALANCE_POSTED_STATUSES.includes(status);

/**
 * Bank-style voucher direction (same as bank payment voucher):
 * - customer + payee => receipt (cash in, creates Payment + PaymentJourney)
 * - supplier + payee => payment (cash out, creates SupplierPayment)
 */
const resolveCashPaymentVoucherType = (body, payeeType, normalizedPayee) => {
  const requested = body.voucherType;
  if (requested === 'transfer') return 'transfer';

  if (payeeType === 'customer' && normalizedPayee) return 'receipt';
  if (payeeType === 'supplier' && normalizedPayee) return 'payment';

  return requested || 'payment';
};

/** Source cash book: receipt adds, payment/transfer subtracts. */
const getSourceCashBookDelta = (voucherType, amount) => {
  const amt = typeof amount === 'number' ? amount : parseFloat(amount);
  if (!Number.isFinite(amt) || amt <= 0) return 0;
  return voucherType === 'receipt' ? amt : -amt;
};

/** Payee side is opposite of source cash book movement. */
const getPayeeSideDelta = (voucherType, amount) => {
  const amt = typeof amount === 'number' ? amount : parseFloat(amount);
  if (!Number.isFinite(amt) || amt <= 0) return 0;
  return voucherType === 'receipt' ? -amt : amt;
};

/** FinancialPayment effect on source cash book (receipt = add, payment/transfer = subtract). */
const getSourceCashBookEffect = (voucherType) =>
  voucherType === 'receipt' ? 'add' : 'subtract';

const ensurePayeeCashBookFinancialPayment = async (voucherId) => {
  const v = await CashPaymentVoucher.findById(voucherId);
  if (!v || v.payeeType !== 'CashBook' || !v.payee || v.relatedFinancialPayment) return;
  if (!v.payeeCashBookBalanceApplied) return;

  const amt = typeof v.amount === 'number' ? v.amount : parseFloat(v.amount);
  if (!Number.isFinite(amt) || amt <= 0) return;

  const voucherTypeLabel = v.voucherType === 'receipt' ? 'Receipt' : 'Payment';
  const fp = await FinancialPayment.create({
    name: v.payeeName || v.description || `Cash book ${voucherTypeLabel}`,
    mobileNo: null,
    code: v.referenceNumber || v.voucherNumber || null,
    description:
      v.description ||
      `${voucherTypeLabel} via cash payment voucher ${v.voucherNumber} (payee cash book)`,
    amount: amt,
    currency: v.currency || null,
    paymentDate: v.voucherDate || new Date(),
    method: 'cash',
    effect: getPayeeEffectForCashVoucher(v.voucherType),
    relatedModel: 'CashBook',
    relatedId: v.payee,
    user: v.user,
    isActive: v.isActive !== false,
  });

  v.relatedFinancialPayment = fp._id;
  await v.save();
};

const ensureSourceCashBookFinancialPayment = async (voucherId) => {
  const v = await CashPaymentVoucher.findById(voucherId);
  if (!v || !v.cashBook || v.relatedCashBookFinancialPayment) return;
  if (!v.cashBalanceApplied) return;

  const amt = typeof v.amount === 'number' ? v.amount : parseFloat(v.amount);
  if (!Number.isFinite(amt) || amt <= 0) return;

  const voucherTypeLabel = v.voucherType === 'receipt' ? 'Receipt' : 'Payment';
  const fp = await FinancialPayment.create({
    name: v.payeeName || v.description || `Cash book ${voucherTypeLabel}`,
    mobileNo: null,
    code: v.referenceNumber || v.voucherNumber || null,
    description:
      v.description ||
      `${voucherTypeLabel} via cash payment voucher ${v.voucherNumber}`,
    amount: amt,
    currency: v.currency || null,
    paymentDate: v.voucherDate || new Date(),
    method: 'cash',
    effect: getSourceCashBookEffect(v.voucherType),
    relatedModel: 'CashBook',
    relatedId: v.cashBook,
    user: v.user,
    isActive: v.isActive !== false,
  });

  v.relatedCashBookFinancialPayment = fp._id;
  await v.save();
};

/**
 * Updates CashBook.balance when a voucher is posted (money out reduces balance; receipt increases).
 * Opening balance is left unchanged; running balance is stored in `balance` (same as account create flow).
 * Idempotent via cashBalanceApplied on the voucher.
 */
const applyCashBalanceForCashPaymentVoucher = async (voucherId) => {
  if (!voucherId || !mongoose.Types.ObjectId.isValid(String(voucherId))) return;

  const v = await CashPaymentVoucher.findById(voucherId);
  if (!v || v.cashBalanceApplied) return;
  if (!CASH_BALANCE_POSTED_STATUSES.includes(v.status)) return;

  const amt = typeof v.amount === 'number' ? v.amount : parseFloat(v.amount);
  if (!Number.isFinite(amt) || amt <= 0) return;
  if (!v.cashBook) return;

  const delta = getSourceCashBookDelta(v.voucherType, amt);
  if (delta === 0) return;

  const cashBook = await CashBook.findByIdAndUpdate(
    v.cashBook,
    { $inc: { balance: delta } },
    { new: true }
  );
  if (!cashBook) {
    console.error('applyCashBalanceForCashPaymentVoucher: cash book not found', v.cashBook);
    return;
  }

  v.cashBalanceApplied = true;
  await v.save();

  await ensureSourceCashBookFinancialPayment(v._id);
};

/** Undo applyCashBalanceForCashPaymentVoucher when a posted voucher is cancelled/rejected/deleted. */
const reverseCashBalanceForCashPaymentVoucher = async (voucherId) => {
  if (!voucherId || !mongoose.Types.ObjectId.isValid(String(voucherId))) return;

  const v = await CashPaymentVoucher.findById(voucherId);
  if (!v || !v.cashBalanceApplied) return;

  const amt = typeof v.amount === 'number' ? v.amount : parseFloat(v.amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    v.cashBalanceApplied = false;
    await v.save();
    return;
  }
  if (!v.cashBook) return;

  const delta = -getSourceCashBookDelta(v.voucherType, amt);

  await CashBook.findByIdAndUpdate(v.cashBook, { $inc: { balance: delta } });
  v.cashBalanceApplied = false;
  await v.save();
};

/** Adjust payee CashBook balance (transfer between cash books). */
const applyPayeeCashBookBalanceForCashPaymentVoucher = async (voucherId) => {
  if (!voucherId || !mongoose.Types.ObjectId.isValid(String(voucherId))) return;

  const v = await CashPaymentVoucher.findById(voucherId);
  if (!v || v.payeeCashBookBalanceApplied || v.payeeType !== 'CashBook' || !v.payee) return;
  if (!CASH_BALANCE_POSTED_STATUSES.includes(v.status)) return;

  const payeeId = String(v.payee);
  const sourceId = v.cashBook ? String(v.cashBook) : null;
  if (sourceId && payeeId === sourceId) return;

  const amt = typeof v.amount === 'number' ? v.amount : parseFloat(v.amount);
  const delta = getPayeeSideDelta(v.voucherType, amt);
  if (delta === 0) return;

  const payeeCashBook = await CashBook.findByIdAndUpdate(v.payee, { $inc: { balance: delta } }, { new: true });
  if (!payeeCashBook) {
    console.error('applyPayeeCashBookBalanceForCashPaymentVoucher: payee cash book not found', v.payee);
    return;
  }

  v.payeeCashBookBalanceApplied = true;
  await v.save();

  await ensurePayeeCashBookFinancialPayment(v._id);
};

const reversePayeeCashBookBalanceForCashPaymentVoucher = async (voucherId) => {
  if (!voucherId || !mongoose.Types.ObjectId.isValid(String(voucherId))) return;

  const v = await CashPaymentVoucher.findById(voucherId);
  if (!v || !v.payeeCashBookBalanceApplied || v.payeeType !== 'CashBook' || !v.payee) return;

  const amt = typeof v.amount === 'number' ? v.amount : parseFloat(v.amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    v.payeeCashBookBalanceApplied = false;
    await v.save();
    return;
  }

  const delta = -getPayeeSideDelta(v.voucherType, amt);
  await CashBook.findByIdAndUpdate(v.payee, { $inc: { balance: delta } });
  v.payeeCashBookBalanceApplied = false;
  await v.save();
};

/** Credit/debit payee BankAccount when payeeType is BankAccount (cash deposit/withdrawal). */
const applyPayeeBankBalanceForCashPaymentVoucher = async (voucherId) => {
  if (!voucherId || !mongoose.Types.ObjectId.isValid(String(voucherId))) return;

  const v = await CashPaymentVoucher.findById(voucherId);
  if (!v || v.payeeBankBalanceApplied || v.payeeType !== 'BankAccount' || !v.payee) return;
  if (!CASH_BALANCE_POSTED_STATUSES.includes(v.status)) return;

  const amt = typeof v.amount === 'number' ? v.amount : parseFloat(v.amount);
  if (!Number.isFinite(amt) || amt <= 0) return;

  const delta = getPayeeSideDelta(v.voucherType, amt);
  if (delta === 0) return;

  const bank = await BankAccount.findByIdAndUpdate(v.payee, { $inc: { balance: delta } }, { new: true });
  if (!bank) {
    console.error('applyPayeeBankBalanceForCashPaymentVoucher: bank account not found', v.payee);
    return;
  }

  v.payeeBankBalanceApplied = true;
  await v.save();
};

const reversePayeeBankBalanceForCashPaymentVoucher = async (voucherId) => {
  if (!voucherId || !mongoose.Types.ObjectId.isValid(String(voucherId))) return;

  const v = await CashPaymentVoucher.findById(voucherId);
  if (!v || !v.payeeBankBalanceApplied || v.payeeType !== 'BankAccount' || !v.payee) return;

  const amt = typeof v.amount === 'number' ? v.amount : parseFloat(v.amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    v.payeeBankBalanceApplied = false;
    await v.save();
    return;
  }

  const delta = -getPayeeSideDelta(v.voucherType, amt);
  await BankAccount.findByIdAndUpdate(v.payee, { $inc: { balance: delta } });
  v.payeeBankBalanceApplied = false;
  await v.save();
};

/** Deactivate FinancialPayment ledger lines when a posted voucher is cancelled/rejected/deleted. */
const reversePayeeTransactionForCashPaymentVoucher = async (voucherId) => {
  if (!voucherId || !mongoose.Types.ObjectId.isValid(String(voucherId))) return;

  const v = await CashPaymentVoucher.findById(voucherId);
  if (!v) return;

  const fpIds = [v.relatedFinancialPayment, v.relatedCashBookFinancialPayment].filter(Boolean);
  for (const fpId of fpIds) {
    await FinancialPayment.findByIdAndUpdate(fpId, { isActive: false });
  }
};

const applyPostedBalancesForCashPaymentVoucher = async (voucherId) => {
  await applyCashBalanceForCashPaymentVoucher(voucherId);
  await applyPayeeCashBookBalanceForCashPaymentVoucher(voucherId);
  await applyPayeeBankBalanceForCashPaymentVoucher(voucherId);
};

const reversePostedBalancesForCashPaymentVoucher = async (voucherId) => {
  await reverseCashBalanceForCashPaymentVoucher(voucherId);
  await reversePayeeCashBookBalanceForCashPaymentVoucher(voucherId);
  await reversePayeeBankBalanceForCashPaymentVoucher(voucherId);
  await reversePayeeTransactionForCashPaymentVoucher(voucherId);
};

// @desc    Get all cash payment vouchers with filtering and pagination
// @route   GET /api/cash-payment-vouchers
// @access  Private
const getCashPaymentVouchers = async (req, res) => {
  try {
    const features = new APIFeatures(CashPaymentVoucher.find(), req.query)
      .filter()
      .sort()
      .limitFields()
      .paginate();

    const vouchers = await features.query
      .populate('cashBook', 'name code balance referCode')
      .populate('currency', 'name code symbol')
      .populate('payee', 'name accountName accountNumber bankName code')
      .populate('user', 'name email')
      .populate('approvalStatus.approvedBy', 'name')
      .populate('relatedPurchase', 'invoiceNumber')
      .populate('relatedSale', 'invoiceNumber')
      .sort({ voucherDate: -1 })
      .select('-__v');

    // Build filter query for count
    const queryObj = { ...req.query };
    const excludedFields = ['page', 'sort', 'limit', 'fields'];
    excludedFields.forEach(el => delete queryObj[el]);
    let queryStr = JSON.stringify(queryObj);
    queryStr = queryStr.replace(/\b(gte|gt|lte|lt)\b/g, match => `$${match}`);
    const filterQuery = queryStr ? JSON.parse(queryStr) : {};
    
    const totalVouchers = await CashPaymentVoucher.countDocuments(filterQuery);

    res.status(200).json({
      status: 'success',
      results: vouchers.length,
      totalVouchers,
      data: {
        vouchers,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get cash payment voucher by ID
// @route   GET /api/cash-payment-vouchers/:id
// @access  Private
const getCashPaymentVoucherById = async (req, res) => {
  try {
    const voucher = await CashPaymentVoucher.findById(req.params.id)
      .populate('cashBook', 'name code balance referCode')
      .populate('currency', 'name code symbol')
      .populate('payee', 'name email phoneNumber address accountName accountNumber bankName code')
      .populate('user', 'name email')
      .populate('approvalStatus.approvedBy', 'name email')
      .populate('relatedPurchase', 'invoiceNumber totalAmount')
      .populate('relatedSale', 'invoiceNumber grandTotal')
      .populate('relatedPayment', 'paymentNumber amount')
      .populate('relatedSupplierPayment', 'paymentNumber amount')
      .populate('relatedFinancialPayment', 'referCode amount paymentDate method relatedModel relatedId')
      .select('-__v');

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Cash payment voucher not found',
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        voucher,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// Helper function to create Payment or SupplierPayment transaction from voucher
const createTransactionFromVoucher = async (voucher, userId) => {
  console.log('=== createTransactionFromVoucher called ===');
  console.log('Voucher ID:', voucher?._id);
  console.log('User ID:', userId);
  
  // Ensure voucher is a Mongoose document with all fields loaded
  if (!voucher || !voucher._id) {
    console.error('Invalid voucher passed to createTransactionFromVoucher');
    return { createdSupplierPayment: null, createdPayment: null };
  }

  // Refresh voucher from database to ensure we have all fields
  const freshVoucher = await CashPaymentVoucher.findById(voucher._id);
  if (!freshVoucher) {
    console.error('Voucher not found in database');
    return { createdSupplierPayment: null, createdPayment: null };
  }
  
  console.log('Fresh voucher loaded:', {
    payeeType: freshVoucher.payeeType,
    payee: freshVoucher.payee,
    relatedSupplierPayment: freshVoucher.relatedSupplierPayment,
    relatedPayment: freshVoucher.relatedPayment,
    amount: freshVoucher.amount,
    status: freshVoucher.status
  });

  // Map voucher paymentMethod to supplier/customer payment method
  const mapPaymentMethod = (voucherMethod) => {
    const methodMap = {
      'cash': 'cash',
      'petty_cash': 'cash',
      'cash_register': 'cash',
      'other': 'other'
    };
    return methodMap[voucherMethod] || 'cash';
  };

  let createdSupplierPayment = null;
  let createdPayment = null;
  let createdFinancialPayment = null;
  let errorDetails = null;

  // Only create transactions if they don't already exist
  if (
    freshVoucher.payeeType === 'supplier' &&
    freshVoucher.payee &&
    !freshVoucher.relatedSupplierPayment &&
    shouldCreateSupplierPaymentForVoucher(freshVoucher.voucherType)
  ) {
    console.log('Creating SupplierPayment for supplier:', freshVoucher.payee);
    try {
      // Generate payment number
      const paymentCount = await SupplierPayment.countDocuments();
      const paymentNumber = `SP-${paymentCount + 1}`;
      
      // Use voucher's transactionId or generate a new one
      const paymentTransactionId = voucher.transactionId || `TRX-${Date.now()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
      
      // Calculate supplier balances
      const purchasesAgg = await Purchase.aggregate([
        { $match: { supplier: new mongoose.Types.ObjectId(freshVoucher.payee), isActive: true } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
      ]);
      const totalPurchasesAmount = purchasesAgg.length > 0 ? (purchasesAgg[0].total || 0) : 0;
      
      const paymentsAgg = await SupplierPayment.aggregate([
        { $match: { supplier: new mongoose.Types.ObjectId(freshVoucher.payee), status: { $nin: ['failed', 'refunded'] } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);
      const paidSoFar = paymentsAgg.length > 0 ? (paymentsAgg[0].total || 0) : 0;
      const remainingBefore = totalPurchasesAmount - paidSoFar;
      
      // Create SupplierPayment
      createdSupplierPayment = await SupplierPayment.create({
        paymentNumber,
        supplier: freshVoucher.payee,
        amount: freshVoucher.amount,
        paymentMethod: mapPaymentMethod(freshVoucher.paymentMethod || 'cash'),
        paymentDate: freshVoucher.voucherDate || new Date(),
        transactionId: paymentTransactionId,
        status: 'completed',
        notes: freshVoucher.notes || `Payment via cash payment voucher ${freshVoucher.voucherNumber}`,
        attachments: freshVoucher.attachments || [],
        user: userId,
        isPartial: false,
        currency: freshVoucher.currency || null,
        products: []
      });

      // Calculate new balances
      const newPaidAmount = paidSoFar + freshVoucher.amount;
      const newRemainingBalance = remainingBefore - freshVoucher.amount;
      const isAdvancedPayment = newRemainingBalance < 0;
      
      // Use voucherDate or paymentDate for consistency
      const paymentDate = freshVoucher.voucherDate || createdSupplierPayment.paymentDate || new Date();
      
      // Create supplier journey entry - this is what the payments API queries
      const journeyEntry = await SupplierJourney.create({
        supplier: freshVoucher.payee,
        user: userId,
        action: 'payment_made',
        payment: {
          amount: freshVoucher.amount,
          method: mapPaymentMethod(freshVoucher.paymentMethod || 'cash'),
          date: paymentDate, // Use consistent date
          status: 'completed',
          transactionId: paymentTransactionId
        },
        paidAmount: newPaidAmount,
        remainingBalance: newRemainingBalance,
        notes: `Payment of ${freshVoucher.amount} made to supplier via cash payment voucher ${freshVoucher.voucherNumber}. Transaction ID: ${paymentTransactionId}. ${isAdvancedPayment ? `Advanced payment: ${Math.abs(newRemainingBalance)}` : `Remaining balance: ${newRemainingBalance}`}. ${freshVoucher.notes || ''}`
      });

      console.log('SupplierJourney entry created:', journeyEntry._id, 'for supplier:', freshVoucher.payee);

      // Update voucher with created SupplierPayment reference
      freshVoucher.relatedSupplierPayment = createdSupplierPayment._id;
      await freshVoucher.save();

      console.log('SupplierPayment created automatically:', createdSupplierPayment._id);
    } catch (error) {
      console.error('Error creating SupplierPayment automatically:', error);
      // Continue without failing - voucher is already created
    }
  }

  // Create Payment if customer is selected and no relatedPayment provided
  console.log('Checking customer payment creation:', {
    payeeType: freshVoucher.payeeType,
    hasPayee: !!freshVoucher.payee,
    payee: freshVoucher.payee,
    hasRelatedPayment: !!freshVoucher.relatedPayment,
    relatedPayment: freshVoucher.relatedPayment
  });

  if (
    freshVoucher.payeeType === 'customer' &&
    freshVoucher.payee &&
    !freshVoucher.relatedPayment &&
    shouldCreateCustomerPaymentForVoucher(freshVoucher.voucherType)
  ) {
    console.log('✓ Condition met - Creating Payment for customer:', freshVoucher.payee);
    try {
      // Use voucher's transactionId or generate a new one
      const paymentTransactionId = freshVoucher.transactionId || `TRX-${Date.now()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
      
      // Calculate customer balances (like supplier payments)
      const Sales = require('../models/salesModel');
      const salesAgg = await Sales.aggregate([
        { $match: { customer: new mongoose.Types.ObjectId(freshVoucher.payee), isActive: true } },
        { $group: { _id: null, total: { $sum: '$grandTotal' } } }
      ]);
      const totalSalesAmount = salesAgg.length > 0 ? (salesAgg[0].total || 0) : 0;
      
      const paymentsAgg = await Payment.aggregate([
        { $match: { customer: new mongoose.Types.ObjectId(freshVoucher.payee), status: { $nin: ['failed', 'refunded'] } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);
      const paidSoFar = paymentsAgg.length > 0 ? (paymentsAgg[0].total || 0) : 0;
      const remainingBefore = totalSalesAmount - paidSoFar;
      
      // Prepare payments array for Payment model
      const paymentMethodMapped = mapPaymentMethod(freshVoucher.paymentMethod || 'cash');
      const paymentsArray = [{
        method: paymentMethodMapped,
        amount: freshVoucher.amount,
        bankAccount: null
      }];

      // Use voucherDate or paymentDate for consistency
      const paymentDate = freshVoucher.voucherDate || new Date();

      // Ensure customer is an ObjectId for Payment creation
      const customerIdForPayment = typeof freshVoucher.payee === 'string' 
        ? new mongoose.Types.ObjectId(freshVoucher.payee) 
        : freshVoucher.payee;

      console.log('Creating Payment with customer ID:', customerIdForPayment.toString());

      // Generate payment number (required field - must be set before creation)
      const date = new Date(paymentDate);
      const year = date.getFullYear().toString().slice(-2);
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      
      // Get count of payments for today to generate sequential number
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      
      const paymentsCount = await Payment.countDocuments({
        createdAt: {
          $gte: startOfDay,
          $lt: endOfDay,
        },
      });
      
      const paymentNumber = `PAY-${year}${month}${day}-${(paymentsCount + 1).toString().padStart(3, '0')}`;
      console.log('Generated payment number:', paymentNumber);

      // Create Payment
      createdPayment = await Payment.create({
        paymentNumber: paymentNumber,
        customer: customerIdForPayment,
        sale: freshVoucher.relatedSale || null,
        amount: freshVoucher.amount,
        payments: paymentsArray,
        paymentDate: paymentDate,
        transactionId: paymentTransactionId,
        status: 'completed',
        notes: freshVoucher.notes || `Payment via cash payment voucher ${freshVoucher.voucherNumber}`,
        attachments: freshVoucher.attachments || [],
        user: userId,
        isPartial: false,
        currency: freshVoucher.currency || null,
        paymentType: freshVoucher.relatedSale ? 'sale_payment' : 'advance_payment'
      });

      console.log('Payment created successfully:', createdPayment._id, 'Payment Number:', createdPayment.paymentNumber);

      // Calculate new balances (like supplier payments)
      const newPaidAmount = paidSoFar + freshVoucher.amount;
      const newRemainingBalance = remainingBefore - freshVoucher.amount;
      const isAdvancedPayment = newRemainingBalance < 0;

      // Get the actual payment status from the created payment
      const actualPaymentStatus = createdPayment.status || 'completed';

      // Ensure customer is an ObjectId
      const customerId = typeof freshVoucher.payee === 'string' 
        ? new mongoose.Types.ObjectId(freshVoucher.payee) 
        : freshVoucher.payee;

      console.log('Creating PaymentJourney with customer ID:', customerId.toString(), 'Type:', typeof customerId);

      // Create payment journey record with balance info (like supplier payments)
      const paymentJourneyData = {
        payment: createdPayment._id,
        customer: customerId, // Ensure customer field is set as ObjectId
        user: userId,
        action: 'payment_made',
        paymentDetails: {
          amount: freshVoucher.amount,
          method: paymentMethodMapped,
          date: paymentDate,
          status: actualPaymentStatus, // Use actual payment status
          transactionId: paymentTransactionId
        },
        paidAmount: newPaidAmount,
        remainingBalance: newRemainingBalance,
        changes: [],
        notes: `Payment of ${freshVoucher.amount} received from customer via cash payment voucher ${freshVoucher.voucherNumber}. Transaction ID: ${paymentTransactionId}. ${isAdvancedPayment ? `Advanced payment: ${Math.abs(newRemainingBalance)}` : `Remaining balance: ${newRemainingBalance}`}. ${freshVoucher.notes || ''}`
      };
      
      console.log('PaymentJourney data before creation:', {
        customer: paymentJourneyData.customer?.toString(),
        customerType: typeof paymentJourneyData.customer,
        action: paymentJourneyData.action,
        payment: paymentJourneyData.payment?.toString()
      });
      
      const paymentJourneyEntry = await PaymentJourney.create(paymentJourneyData);

      console.log('PaymentJourney entry created successfully:', {
        journeyId: paymentJourneyEntry._id,
        customerId: paymentJourneyEntry.customer?.toString(),
        paymentId: paymentJourneyEntry.payment?.toString(),
        action: paymentJourneyEntry.action,
        paymentDetails: paymentJourneyEntry.paymentDetails
      });
      
      // Ensure customer field is set (in case it wasn't saved properly)
      if (!paymentJourneyEntry.customer || paymentJourneyEntry.customer.toString() !== customerId.toString()) {
        console.log('⚠️ Customer field missing or incorrect, updating PaymentJourney...');
        paymentJourneyEntry.customer = customerId;
        await paymentJourneyEntry.save();
        console.log('✓ PaymentJourney customer field updated to:', customerId.toString());
      }

      // Verify PaymentJourney was created correctly by querying it back
      const verifyJourney = await PaymentJourney.findById(paymentJourneyEntry._id);
      if (verifyJourney) {
        console.log('Verified PaymentJourney exists with customer:', verifyJourney.customer?.toString());
        
        // Also verify by querying PaymentJourney with customer filter (like the API does)
        const apiQueryTest = await PaymentJourney.find({
          customer: customerId,
          action: 'payment_made'
        }).limit(1);
        console.log('API query test - found PaymentJourney entries:', apiQueryTest.length);
        if (apiQueryTest.length > 0) {
          console.log('✓ PaymentJourney will be found by customer transactions API');
        } else {
          console.error('✗ WARNING: PaymentJourney NOT found by customer transactions API query!');
          console.error('Query used:', { customer: customerId.toString(), action: 'payment_made' });
        }
      } else {
        console.error('ERROR: PaymentJourney not found after creation!');
      }

      // Update sale payment status if sale exists
      if (freshVoucher.relatedSale) {
        const saleRecord = await Sales.findById(freshVoucher.relatedSale);
        if (saleRecord) {
          const salePayments = await Payment.find({ sale: freshVoucher.relatedSale });
          const totalPaidForSale = salePayments.reduce((sum, p) => sum + p.amount, 0);
          const remainingBalance = (saleRecord.grandTotal || 0) - totalPaidForSale;
          if (remainingBalance <= 0) {
            await Sales.findByIdAndUpdate(freshVoucher.relatedSale, { paymentStatus: 'paid' });
          } else {
            await Sales.findByIdAndUpdate(freshVoucher.relatedSale, { paymentStatus: 'partial' });
          }
        }
      }

      // Update voucher with created Payment reference
      freshVoucher.relatedPayment = createdPayment._id;
      const savedVoucher = await freshVoucher.save();
      
      console.log('✓ Voucher updated with relatedPayment:', {
        voucherId: savedVoucher._id,
        relatedPayment: savedVoucher.relatedPayment?.toString(),
        paymentId: createdPayment._id.toString()
      });

      // Verify the update persisted
      const verifyVoucher = await CashPaymentVoucher.findById(freshVoucher._id);
      console.log('✓ Verified voucher has relatedPayment:', verifyVoucher.relatedPayment?.toString());

      console.log('Payment created automatically:', createdPayment._id);
    } catch (error) {
      console.error('❌ ERROR creating Payment automatically:', error);
      console.error('Error stack:', error.stack);
      errorDetails = {
        message: error.message,
        name: error.name,
        code: error.code,
        errors: error.errors
      };
      console.error('Error details:', errorDetails);
      
      // Log the voucher details for debugging
      console.error('Voucher details at error:', {
        voucherId: freshVoucher._id,
        payeeType: freshVoucher.payeeType,
        payee: freshVoucher.payee,
        amount: freshVoucher.amount,
        status: freshVoucher.status
      });
      
      // Don't fail the voucher creation, but log the error
      // Continue without failing - voucher is already created
    }
  } else {
    console.log('✗ Condition NOT met for customer payment creation:', {
      payeeType: freshVoucher.payeeType,
      hasPayee: !!freshVoucher.payee,
      hasRelatedPayment: !!freshVoucher.relatedPayment
    });
  }

  // Create FinancialPayment when voucher is linked to a financial entity (Asset, Income, Employee, Expense, etc.)
  // Check both financialModel/financialId fields AND payeeType for financial models
  const isFinancialModel =
    (freshVoucher.financialModel &&
      freshVoucher.financialId &&
      !freshVoucher.relatedFinancialPayment) ||
    (FINANCIAL_ACCOUNT_MODELS.includes(freshVoucher.payeeType) &&
      freshVoucher.payeeType !== 'CashBook' &&
      freshVoucher.payee &&
      !freshVoucher.relatedFinancialPayment) ||
    (isExpensePayeeType(freshVoucher.payeeType) &&
      freshVoucher.payee &&
      !freshVoucher.relatedFinancialPayment);

  if (isFinancialModel) {
    // Use financialModel/financialId if set, otherwise derive from payeeType/payee
    const targetFinancialModel =
      freshVoucher.financialModel ||
      (isExpensePayeeType(freshVoucher.payeeType) ? 'Expense' : freshVoucher.payeeType);
    const targetFinancialId = freshVoucher.financialId || freshVoucher.payee;
    try {
      const methodMapForFinancial = {
        cash: 'cash', petty_cash: 'cash', cash_register: 'cash', other: 'other',
      };

      const mappedMethod =
        methodMapForFinancial[freshVoucher.paymentMethod] || 'cash';

      const paymentDate = freshVoucher.voucherDate || new Date();
      const payeeEffect = resolveFinancialPaymentEffectFromVoucher(freshVoucher);
      const financialAmount = resolveFinancialPaymentAmountFromVoucher(
        freshVoucher,
        targetFinancialModel,
        targetFinancialId
      );
      const ledgerLabel = getFinancialPaymentLedgerLabel(payeeEffect, targetFinancialModel);
      const voucherTypeLabel =
        freshVoucher.voucherType === 'receipt' ? 'Receipt' : 'Payment';

      createdFinancialPayment = await FinancialPayment.create({
        name:
          freshVoucher.payeeName ||
          freshVoucher.description ||
          `Financial payment for ${targetFinancialModel}`,
        mobileNo: null,
        code: freshVoucher.referenceNumber || null,
        description:
          freshVoucher.description ||
          `${voucherTypeLabel} via cash payment voucher ${freshVoucher.voucherNumber}: ${ledgerLabel} ${financialAmount} to ${
            freshVoucher.payeeName || targetFinancialModel
          }`,
        amount: financialAmount,
        currency: freshVoucher.currency || null,
        paymentDate,
        method: mappedMethod,
        effect: payeeEffect,
        relatedModel: targetFinancialModel,
        relatedId: targetFinancialId,
        user: userId,
        isActive: freshVoucher.isActive !== false,
      });

      freshVoucher.relatedFinancialPayment = createdFinancialPayment._id;
      await freshVoucher.save();
    } catch (error) {
      console.error('Error creating FinancialPayment automatically:', error);
      errorDetails = error;
    }
  }

  if (isExpensePayeeType(freshVoucher.payeeType) && freshVoucher.payee) {
    try {
      const paidExpense = await markExpensePaidFromVoucher(freshVoucher);
      if (paidExpense && !freshVoucher.relatedExpense) {
        freshVoucher.relatedExpense = paidExpense._id;
        await freshVoucher.save();
      }
    } catch (error) {
      console.error('Error marking expense as paid from cash voucher:', error);
      errorDetails = errorDetails || error;
    }
  }

  return {
    createdSupplierPayment, 
    createdPayment,
    createdFinancialPayment,
    error: errorDetails || null
  };
};

// @desc    Create new cash payment voucher
// @route   POST /api/cash-payment-vouchers
// @access  Private
const createCashPaymentVoucher = async (req, res) => {
  try {
    const {
      voucherDate,
      voucherType,
      cashBook: cashBookBody,
      cashAccount: cashAccountAlias,
      payeeType,
      payee,
      payeeName,
      amount,
      currency,
      currencyExchangeRate,
      paymentMethod,
      transactionId,
      referenceNumber,
      relatedPurchase,
      relatedSale,
      relatedPayment,
      relatedSupplierPayment,
      description,
      notes,
      status,
      attachments,
    } = req.body;

    const cashBook = cashBookBody || cashAccountAlias;

    if (req.body.bankAccount !== undefined && req.body.bankAccount !== null && req.body.bankAccount !== '') {
      return res.status(400).json({
        status: 'fail',
        message:
          'Bank account is not available as the source on cash payment vouchers. Use cashBook (cash book) instead.',
      });
    }
    
    console.log('req.file:', req.file);
    console.log('attachments from req.body:', attachments);
    console.log('attachments type:', typeof attachments);
    
    // Validate cash book exists
    const cashBookExists = await CashBook.findById(cashBook);
    if (!cashBookExists) {
      return res.status(404).json({
        status: 'fail',
        message: 'Cash book not found',
      });
    }

    // Normalize payee: treat empty string as undefined
    let normalizedPayee =
      payee && typeof payee === 'string' && payee.trim() === ''
        ? undefined
        : payee;

    const resolvedVoucherType = resolveCashPaymentVoucherType(
      req.body,
      payeeType,
      normalizedPayee
    );

    if ((payeeType === 'supplier' || payeeType === 'customer') && !normalizedPayee) {
      return res.status(400).json({
        status: 'fail',
        message: `payee is required when payeeType is ${payeeType}`,
      });
    }

    // Validate payee if provided and not "other"
    if (normalizedPayee && payeeType !== 'other') {
      const payeeValidation = await validatePayeeForVoucher(
        payeeType,
        normalizedPayee,
        req.user?._id
      );
      if (!payeeValidation.ok) {
        return res.status(404).json({
          status: 'fail',
          message: payeeValidation.message,
        });
      }
      if (payeeValidation.expenseId) {
        normalizedPayee = String(payeeValidation.expenseId);
      }
    }

    // Handle file uploads for attachments
    let uploadedAttachments = [];
    
    // Helper function to parse attachments string
    const parseAttachmentsString = (attachmentsStr) => {
      if (!attachmentsStr || typeof attachmentsStr !== 'string') {
        return [];
      }
      
      try {
        let cleanString = attachmentsStr.trim();
        
        // Remove outer quotes if present
        if ((cleanString.startsWith('"') && cleanString.endsWith('"')) || 
            (cleanString.startsWith("'") && cleanString.endsWith("'"))) {
          cleanString = cleanString.slice(1, -1);
        }
        
        // Handle escaped characters - unescape the string
        cleanString = cleanString
          .replace(/\\n/g, '')
          .replace(/\\r/g, '')
          .replace(/\\t/g, '')
          .replace(/\\'/g, "'")
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\');
        
        // Try to parse as JSON
        const parsed = JSON.parse(cleanString);
        
        if (Array.isArray(parsed)) {
          return parsed;
        } else if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          // Single object, wrap in array
          return [parsed];
        }
        
        return [];
      } catch (parseError) {
        console.error('Error parsing attachments string:', parseError.message);
        console.error('Raw attachments string:', attachmentsStr);
        
        // Try alternative parsing - look for JSON-like structure
        try {
          // Try to extract JSON from the string using regex
          const jsonMatch = attachmentsStr.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return Array.isArray(parsed) ? parsed : [parsed];
          }
        } catch (e) {
          console.error('Alternative parsing also failed:', e.message);
        }
        
        return [];
      }
    };
    
    // If a file is uploaded via req.file (single file)
    if (req.file) {
      try {
        const uploadResult = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder: 'cash-payment-vouchers' },
            (error, result) => {
              if (error) return reject(error);
              resolve(result);
            }
          );
          stream.end(req.file.buffer);
        });
        
        uploadedAttachments.push({
          url: String(uploadResult.secure_url || ''),
          name: String(req.file.originalname || ''),
          type: String(req.file.mimetype || '')
        });
        
        console.log('File uploaded to Cloudinary, attachment added:', uploadedAttachments[0]);
      } catch (uploadError) {
        console.error('Error uploading file:', uploadError);
        // Continue even if upload fails
      }
    }
    
    // Handle attachments from req.body (already uploaded to Cloudinary or provided as data)
    if (attachments !== undefined && attachments !== null) {
      let parsedAttachments = [];
      
      if (Array.isArray(attachments)) {
        // Already an array
        parsedAttachments = attachments;
      } else if (typeof attachments === 'string') {
        // String that needs parsing
        parsedAttachments = parseAttachmentsString(attachments);
      } else if (typeof attachments === 'object' && !Array.isArray(attachments)) {
        // Single object
        parsedAttachments = [attachments];
      }
      
      // Normalize and validate each attachment
      const normalizedAttachments = parsedAttachments
        .filter(att => {
          // Filter out invalid entries
          if (!att || Array.isArray(att)) return false;
          if (typeof att !== 'object') return false;
          // Must have at least url or name
          return att.url || att.name;
        })
        .map(att => {
          // Ensure proper structure
          return {
            url: String(att.url || ''),
            name: String(att.name || ''),
            type: String(att.type || att.mimetype || '')
          };
        });
      
      // Merge with any file uploads
      if (req.file && uploadedAttachments.length > 0) {
        // If file was uploaded, combine with existing attachments
        uploadedAttachments = [...uploadedAttachments, ...normalizedAttachments];
      } else {
        // Use parsed attachments
        uploadedAttachments = normalizedAttachments;
      }
      
      console.log('Final attachments to save:', uploadedAttachments);
    }

    // Validate user is authenticated
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        status: 'fail',
        message: 'User not authenticated',
      });
    }

    // Create voucher (voucherNumber and voucherDate will be auto-generated if not provided)
    // Auto-set status to 'completed' in cases where we want automatic transaction creation
    const financialModels = [
      'Asset',
      'Expense',
      'Income',
      'Liability',
      'PartnershipAccount',
      'CashBook',
      'BankAccount',
      'Capital',
      'Owner',
      'Employee',
      'PropertyAccount',
    ];
    if (
      payeeType === 'CashBook' &&
      normalizedPayee &&
      cashBook &&
      String(normalizedPayee) === String(cashBook)
    ) {
      return res.status(400).json({
        status: 'fail',
        message: 'Source cash book and payee cash book cannot be the same',
      });
    }

    let finalStatus = status || 'draft';
    if (!status) {
      if ((payeeType === 'supplier' || payeeType === 'customer') && normalizedPayee) {
        finalStatus = 'completed';
        console.log('Auto-setting status to "completed" because supplier/customer is selected');
      } else if (financialModels.includes(payeeType) && normalizedPayee) {
        finalStatus = 'completed';
        console.log(
          `Auto-setting status to "completed" because payeeType "${payeeType}" is a financial model`
        );
      } else if (isExpensePayeeType(payeeType) && normalizedPayee) {
        finalStatus = 'completed';
        console.log(
          `Auto-setting status to "completed" because payeeType "${payeeType}" is an expense`
        );
      } else if (
        (resolvedVoucherType === 'payment' ||
          resolvedVoucherType === 'receipt' ||
          resolvedVoucherType === 'transfer' ||
          resolvedVoucherType === undefined) &&
        cashBook
      ) {
        const amountNum =
          typeof amount === 'string' ? parseFloat(amount) : Number(amount);
        if (Number.isFinite(amountNum) && amountNum > 0) {
          finalStatus = 'pending';
          console.log(
            'Auto-setting status to "pending" so cash balance updates for this cash payment voucher'
          );
        }
      }
    }

    const voucherData = {
      voucherType: resolvedVoucherType,
      cashBook,
      payeeType,
      // Only set payee when we actually have one and type is not "other"
      payee:
        normalizedPayee && payeeType !== 'other' ? normalizedPayee : undefined,
      payeeName,
      amount: typeof amount === 'string' ? parseFloat(amount) : amount,
      currency,
      currencyExchangeRate: currencyExchangeRate
        ? typeof currencyExchangeRate === 'string'
          ? parseFloat(currencyExchangeRate)
          : currencyExchangeRate
        : 1,
      paymentMethod,
      transactionId,
      referenceNumber,
      relatedPurchase,
      relatedSale,
      relatedPayment,
      relatedSupplierPayment,
      description,
      notes,
      status: finalStatus,
      attachments: uploadedAttachments,
      user: req.user._id,
      // Note: financialModel and financialId will be auto-set in pre-save hook
      // when payeeType is a financial model or expense category
    };

    if (isExpensePayeeType(payeeType) && normalizedPayee) {
      voucherData.relatedExpense = normalizedPayee;
    }

    // Only set voucherDate if explicitly provided, otherwise model default will handle it
    if (voucherDate) {
      // Handle different date formats (ISO string, DD/MM/YYYY, etc.)
      const parsedDate = new Date(voucherDate);
      if (!isNaN(parsedDate.getTime())) {
        voucherData.voucherDate = parsedDate;
      } else {
        console.warn('Invalid voucherDate format, using default:', voucherDate);
      }
    }

    // Only set voucherNumber if explicitly provided, otherwise model will auto-generate it
    if (req.body.voucherNumber) {
      voucherData.voucherNumber = req.body.voucherNumber;
    }

    // Final safety check: ensure attachments is always an array of proper objects
    if (!Array.isArray(voucherData.attachments)) {
      voucherData.attachments = [];
    } else {
      voucherData.attachments = voucherData.attachments
        .filter(att => att && typeof att === 'object' && !Array.isArray(att))
        .map(att => ({
          url: String(att.url || ''),
          name: String(att.name || ''),
          type: String(att.type || '')
        }));
    }

    console.log('Final voucherData.attachments before save:', voucherData.attachments);
    console.log('Full voucherData before save:', JSON.stringify(voucherData, null, 2));

    let voucher = await CashPaymentVoucher.create(voucherData);

    // Automatically create Payment or SupplierPayment transaction if supplier/customer is selected
    // Only create if status is 'completed' or 'approved' and relatedPayment/relatedSupplierPayment is not already provided
    // Check voucher.status (after creation) to ensure we have the actual saved status
    let createdTransaction = null;
    let transactionResult = null;
    const voucherStatus = voucher.status || voucherData.status || status;
    console.log('Voucher created with status:', voucherStatus, 'Voucher ID:', voucher._id);

    const shouldCreateLedgerTransaction =
      shouldCreateLedgerTransactionForStatus(voucherStatus);
    const shouldApplyCashBalance = CASH_BALANCE_POSTED_STATUSES.includes(voucherStatus);

    if (shouldCreateLedgerTransaction) {
      console.log('Creating transaction from voucher - status is completed/approved');
      transactionResult = await createTransactionFromVoucher(voucher, req.user._id);
      console.log('Transaction result:', {
        hasSupplierPayment: !!transactionResult.createdSupplierPayment,
        hasPayment: !!transactionResult.createdPayment,
        hasFinancialPayment: !!transactionResult.createdFinancialPayment,
        hasError: !!transactionResult.error,
        error: transactionResult.error
      });
      if (transactionResult.createdSupplierPayment) {
        createdTransaction = {
          type: 'SupplierPayment',
          id: transactionResult.createdSupplierPayment._id,
          paymentNumber: transactionResult.createdSupplierPayment.paymentNumber
        };
        console.log('Transaction created - SupplierPayment:', createdTransaction.id);
      } else if (transactionResult.createdPayment) {
        createdTransaction = {
          type: 'Payment',
          id: transactionResult.createdPayment._id,
          paymentNumber: transactionResult.createdPayment.paymentNumber
        };
        console.log('Transaction created - Payment:', createdTransaction.id);
      } else if (transactionResult.createdFinancialPayment) {
        createdTransaction = {
          type: 'FinancialPayment',
          id: transactionResult.createdFinancialPayment._id,
          referCode: transactionResult.createdFinancialPayment.referCode
        };
        console.log('Transaction created - FinancialPayment:', createdTransaction.id);
      } else {
        console.log('No transaction created - check if supplier/customer was selected and relatedPayment/relatedSupplierPayment was already set');
        if (transactionResult.error) {
          console.error('Transaction creation error:', transactionResult.error);
        }
      }
      
      // Reload voucher after transaction creation to ensure we have the latest data
      voucher = await CashPaymentVoucher.findById(voucher._id);
      console.log('Voucher reloaded after transaction creation:', {
        voucherId: voucher._id,
        relatedPayment: voucher.relatedPayment?.toString(),
        relatedSupplierPayment: voucher.relatedSupplierPayment?.toString()
      });
    } else {
      console.log('Transaction NOT created - voucher status is:', voucherStatus, '(expected: completed or approved)');
    }

    if (shouldApplyCashBalance) {
      await applyPostedBalancesForCashPaymentVoucher(voucher._id);
    }

    // Populate before sending response - use the reloaded voucher
    const populatedVoucher = await CashPaymentVoucher.findById(voucher._id)
      .populate('cashBook', 'name code balance referCode')
      .populate('currency', 'name code symbol')
      .populate('payee', 'name accountName accountNumber bankName code')
      .populate('user', 'name email')
      .populate('relatedPayment', 'paymentNumber amount')
      .populate('relatedSupplierPayment', 'paymentNumber amount')
      .select('-__v');

    // Build response data and only include transactionError when there is an actual error
    const responseData = {
      voucher: populatedVoucher,
      createdTransaction: createdTransaction,
    };

    if (transactionResult && transactionResult.error) {
      responseData.transactionError = transactionResult.error;
    }

    res.status(201).json({
      status: 'success',
      message: 'Cash payment voucher created successfully',
      data: responseData,
    });
  } catch (error) {
    console.error('Error creating cash payment voucher:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    
    // If it's a validation error, log the details
    if (error.name === 'ValidationError') {
      console.error('Validation errors:', error.errors);
      const validationErrors = Object.keys(error.errors).map(key => ({
        field: key,
        message: error.errors[key].message,
        value: error.errors[key].value
      }));
      console.error('Validation error details:', validationErrors);
      
      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: validationErrors,
      });
    }
    
    // If it's a duplicate key error
    if (error.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern)[0];
      return res.status(400).json({
        status: 'error',
        message: `${duplicateField} already exists`,
        field: duplicateField,
      });
    }
    
    res.status(500).json({
      status: 'error',
      message: error.message,
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
};

// @desc    Update cash payment voucher
// @route   PUT /api/cash-payment-vouchers/:id
// @access  Private
const updateCashPaymentVoucher = async (req, res) => {
  try {
    const voucher = await CashPaymentVoucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Cash payment voucher not found',
      });
    }

    const previousStatus = voucher.status;

    if (req.body.bankAccount !== undefined && req.body.bankAccount !== null && req.body.bankAccount !== '') {
      return res.status(400).json({
        status: 'fail',
        message:
          'Bank account is not available as the source on cash payment vouchers. Use cashBook (cash book) instead.',
      });
    }

    // Prevent updates if status is completed or cancelled
    if (voucher.status === 'completed' || voucher.status === 'cancelled') {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot update completed or cancelled voucher',
      });
    }

    const {
      voucherDate,
      voucherType,
      cashBook: cashBookBody,
      cashAccount: cashAccountAlias,
      payeeType,
      payee,
      payeeName,
      amount,
      currency,
      currencyExchangeRate,
      paymentMethod,
      transactionId,
      referenceNumber,
      relatedPurchase,
      relatedSale,
      relatedPayment,
      relatedSupplierPayment,
      description,
      notes,
      status,
      attachments,
    } = req.body;

    console.log('Update - req.file:', req.file);
    console.log('Update - attachments from req.body:', attachments);
    console.log('Update - attachments type:', typeof attachments);

    // Helper function to parse attachments string (same as create function)
    const parseAttachmentsString = (attachmentsStr) => {
      if (!attachmentsStr || typeof attachmentsStr !== 'string') {
        return [];
      }
      
      try {
        let cleanString = attachmentsStr.trim();
        
        // Remove outer quotes if present
        if ((cleanString.startsWith('"') && cleanString.endsWith('"')) || 
            (cleanString.startsWith("'") && cleanString.endsWith("'"))) {
          cleanString = cleanString.slice(1, -1);
        }
        
        // Handle escaped characters - unescape the string
        cleanString = cleanString
          .replace(/\\n/g, '')
          .replace(/\\r/g, '')
          .replace(/\\t/g, '')
          .replace(/\\'/g, "'")
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\');
        
        // Try to parse as JSON
        const parsed = JSON.parse(cleanString);
        
        if (Array.isArray(parsed)) {
          return parsed;
        } else if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          // Single object, wrap in array
          return [parsed];
        }
        
        return [];
      } catch (parseError) {
        console.error('Error parsing attachments string:', parseError.message);
        console.error('Raw attachments string:', attachmentsStr);
        
        // Try alternative parsing - look for JSON-like structure
        try {
          // Try to extract JSON from the string using regex
          const jsonMatch = attachmentsStr.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return Array.isArray(parsed) ? parsed : [parsed];
          }
        } catch (e) {
          console.error('Alternative parsing also failed:', e.message);
        }
        
        return [];
      }
    };

    // Handle file uploads for attachments
    let uploadedAttachments = voucher.attachments || [];
    
    // If a new file is uploaded via req.file (single file)
    if (req.file) {
      // Delete old attachments from Cloudinary if replacing
      if (voucher.attachments && voucher.attachments.length > 0) {
        for (const attachment of voucher.attachments) {
          if (attachment.url) {
            try {
              const publicId = attachment.url.split('/').slice(-2).join('/').split('.')[0];
              await cloudinary.uploader.destroy(`cash-payment-vouchers/${publicId}`);
            } catch (error) {
              console.error('Error deleting old attachment:', error);
            }
          }
        }
      }

      // Upload new file
      uploadedAttachments = [];
      try {
        const uploadResult = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder: 'cash-payment-vouchers' },
            (error, result) => {
              if (error) return reject(error);
              resolve(result);
            }
          );
          stream.end(req.file.buffer);
        });
        
        uploadedAttachments.push({
          url: String(uploadResult.secure_url || ''),
          name: String(req.file.originalname || ''),
          type: String(req.file.mimetype || '')
        });
        
        console.log('Update - File uploaded to Cloudinary, attachment added:', uploadedAttachments[0]);
      } catch (uploadError) {
        console.error('Error uploading file:', uploadError);
        // Keep existing attachments if upload fails
        uploadedAttachments = voucher.attachments || [];
      }
    }
    
    // Handle attachments from req.body (already uploaded to Cloudinary or provided as data)
    if (attachments !== undefined) {
      if (attachments === null) {
        // Explicitly set to empty array if null
        uploadedAttachments = [];
      } else {
        let parsedAttachments = [];
        
        if (Array.isArray(attachments)) {
          // Already an array
          parsedAttachments = attachments;
        } else if (typeof attachments === 'string') {
          // String that needs parsing
          parsedAttachments = parseAttachmentsString(attachments);
        } else if (typeof attachments === 'object' && !Array.isArray(attachments)) {
          // Single object
          parsedAttachments = [attachments];
        }
        
        // Normalize and validate each attachment
        const normalizedAttachments = parsedAttachments
          .filter(att => {
            // Filter out invalid entries
            if (!att || Array.isArray(att)) return false;
            if (typeof att !== 'object') return false;
            // Must have at least url or name
            return att.url || att.name;
          })
          .map(att => {
            // Ensure proper structure
            return {
              url: String(att.url || ''),
              name: String(att.name || ''),
              type: String(att.type || att.mimetype || '')
            };
          });
        
        // Merge with any file uploads
        if (req.file && uploadedAttachments.length > 0) {
          // If file was uploaded, combine with existing attachments
          uploadedAttachments = [...uploadedAttachments, ...normalizedAttachments];
        } else {
          // Use parsed attachments
          uploadedAttachments = normalizedAttachments;
        }
        
        console.log('Update - Final attachments to save:', uploadedAttachments);
      }
    }

    // Update fields
    if (voucherDate !== undefined) voucher.voucherDate = voucherDate;
    if (voucherType !== undefined) voucher.voucherType = voucherType;
    const cashBookUpdate = cashBookBody !== undefined ? cashBookBody : cashAccountAlias;
    if (cashBookUpdate !== undefined) {
      const cashBookExists = await CashBook.findById(cashBookUpdate);
      if (!cashBookExists) {
        return res.status(404).json({
          status: 'fail',
          message: 'Cash book not found',
        });
      }
      voucher.cashBook = cashBookUpdate;
    }
    if (payeeType !== undefined) voucher.payeeType = payeeType;
    // Normalize payee on update: treat empty string as undefined
    if (payee !== undefined) {
      if (typeof payee === 'string' && payee.trim() === '') {
        voucher.payee = undefined;
      } else {
        // Validate payee if provided and payeeType is not "other"
        const finalPayeeType = payeeType !== undefined ? payeeType : voucher.payeeType;
        const finalPayee = typeof payee === 'string' && payee.trim() === '' ? undefined : payee;
        
        if (finalPayee && finalPayeeType !== 'other') {
          const payeeValidation = await validatePayeeForVoucher(
            finalPayeeType,
            finalPayee,
            req.user?._id
          );
          if (!payeeValidation.ok) {
            return res.status(404).json({
              status: 'fail',
              message: payeeValidation.message,
            });
          }
          voucher.payee = payeeValidation.expenseId
            ? String(payeeValidation.expenseId)
            : finalPayee;
        } else {
          voucher.payee = finalPayee;
        }
      }
    }
    if (payeeName !== undefined) voucher.payeeName = payeeName;
    if (payee !== undefined || payeeType !== undefined) {
      const finalPayeeType = payeeType !== undefined ? payeeType : voucher.payeeType;
      const finalPayee = voucher.payee;
      if (isExpensePayeeType(finalPayeeType) && finalPayee) {
        voucher.relatedExpense = finalPayee;
      }
    }
    if (amount !== undefined) voucher.amount = amount;
    if (currency !== undefined) voucher.currency = currency;
    if (currencyExchangeRate !== undefined) voucher.currencyExchangeRate = currencyExchangeRate;
    if (paymentMethod !== undefined) voucher.paymentMethod = paymentMethod;
    if (transactionId !== undefined) voucher.transactionId = transactionId;
    if (referenceNumber !== undefined) voucher.referenceNumber = referenceNumber;
    if (relatedPurchase !== undefined) voucher.relatedPurchase = relatedPurchase;
    if (relatedSale !== undefined) voucher.relatedSale = relatedSale;
    if (relatedPayment !== undefined) voucher.relatedPayment = relatedPayment;
    if (relatedSupplierPayment !== undefined) voucher.relatedSupplierPayment = relatedSupplierPayment;
    if (description !== undefined) voucher.description = description;
    if (notes !== undefined) voucher.notes = notes;
    if (status !== undefined) voucher.status = status;
    if (attachments !== undefined || req.file) {
      // Final safety check: ensure attachments is always an array of proper objects
      if (!Array.isArray(uploadedAttachments)) {
        voucher.attachments = [];
      } else {
        voucher.attachments = uploadedAttachments
          .filter(att => att && typeof att === 'object' && !Array.isArray(att))
          .map(att => ({
            url: String(att.url || ''),
            name: String(att.name || ''),
            type: String(att.type || '')
          }));
      }
      console.log('Update - Final voucher.attachments before save:', voucher.attachments);
    }

    const updatedVoucher = await voucher.save();

    const wasPosted = CASH_BALANCE_POSTED_STATUSES.includes(previousStatus);
    const isPosted = CASH_BALANCE_POSTED_STATUSES.includes(updatedVoucher.status);
    const becamePosted = isPosted && !wasPosted;

    if (becamePosted) {
      if (shouldCreateLedgerTransactionForStatus(updatedVoucher.status)) {
        await createTransactionFromVoucher(updatedVoucher, req.user._id);
      }
      await applyPostedBalancesForCashPaymentVoucher(updatedVoucher._id);
    }

    // Populate before sending response
    const populatedVoucher = await CashPaymentVoucher.findById(updatedVoucher._id)
      .populate('cashBook', 'name code balance referCode')
      .populate('currency', 'name code symbol')
      .populate('payee', 'name accountName accountNumber bankName code')
      .populate('user', 'name email')
      .select('-__v');

    res.status(200).json({
      status: 'success',
      message: 'Cash payment voucher updated successfully',
      data: {
        voucher: populatedVoucher,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Approve cash payment voucher
// @route   PUT /api/cash-payment-vouchers/:id/approve
// @access  Private
const approveCashPaymentVoucher = async (req, res) => {
  try {
    const voucher = await CashPaymentVoucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Cash payment voucher not found',
      });
    }

    if (voucher.status === 'completed' || voucher.status === 'cancelled') {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot approve completed or cancelled voucher',
      });
    }

    voucher.status = 'approved';
    voucher.approvalStatus = {
      approvedBy: req.user._id,
      approvedAt: new Date(),
    };

    const updatedVoucher = await voucher.save();

    // Create transactions if supplier/customer is selected and not already created
    await createTransactionFromVoucher(updatedVoucher, req.user._id);
    await applyPostedBalancesForCashPaymentVoucher(updatedVoucher._id);

    const populatedVoucher = await CashPaymentVoucher.findById(updatedVoucher._id)
      .populate('cashBook', 'name code balance referCode')
      .populate('currency', 'name code symbol')
      .populate('payee', 'name accountName accountNumber bankName code')
      .populate('user', 'name email')
      .populate('approvalStatus.approvedBy', 'name email')
      .select('-__v');

    res.status(200).json({
      status: 'success',
      message: 'Cash payment voucher approved successfully',
      data: {
        voucher: populatedVoucher,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Reject cash payment voucher
// @route   PUT /api/cash-payment-vouchers/:id/reject
// @access  Private
const rejectCashPaymentVoucher = async (req, res) => {
  try {
    const { rejectionReason } = req.body;

    const voucher = await CashPaymentVoucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Cash payment voucher not found',
      });
    }

    if (voucher.status === 'completed' || voucher.status === 'cancelled') {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot reject completed or cancelled voucher',
      });
    }

    await reversePostedBalancesForCashPaymentVoucher(voucher._id);

    const voucherAfterReverse = await CashPaymentVoucher.findById(req.params.id);
    if (!voucherAfterReverse) {
      return res.status(404).json({
        status: 'fail',
        message: 'Cash payment voucher not found',
      });
    }

    voucherAfterReverse.status = 'rejected';
    voucherAfterReverse.approvalStatus = {
      approvedBy: req.user._id,
      approvedAt: new Date(),
      rejectionReason: rejectionReason || 'No reason provided',
    };

    const updatedVoucher = await voucherAfterReverse.save();

    const populatedVoucher = await CashPaymentVoucher.findById(updatedVoucher._id)
      .populate('cashBook', 'name code balance referCode')
      .populate('currency', 'name code symbol')
      .populate('payee', 'name accountName accountNumber bankName code')
      .populate('user', 'name email')
      .populate('approvalStatus.approvedBy', 'name email')
      .select('-__v');

    res.status(200).json({
      status: 'success',
      message: 'Cash payment voucher rejected',
      data: {
        voucher: populatedVoucher,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Complete cash payment voucher
// @route   PUT /api/cash-payment-vouchers/:id/complete
// @access  Private
const completeCashPaymentVoucher = async (req, res) => {
  try {
    const voucher = await CashPaymentVoucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Cash payment voucher not found',
      });
    }

    if (voucher.status === 'completed') {
      return res.status(400).json({
        status: 'fail',
        message: 'Voucher is already completed',
      });
    }

    if (voucher.status === 'cancelled' || voucher.status === 'rejected') {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot complete cancelled or rejected voucher',
      });
    }

    voucher.status = 'completed';

    const updatedVoucher = await voucher.save();

    // Create transactions if supplier/customer is selected and not already created
    await createTransactionFromVoucher(updatedVoucher, req.user._id);
    await applyPostedBalancesForCashPaymentVoucher(updatedVoucher._id);

    const populatedVoucher = await CashPaymentVoucher.findById(updatedVoucher._id)
      .populate('cashBook', 'name code balance referCode')
      .populate('currency', 'name code symbol')
      .populate('payee', 'name accountName accountNumber bankName code')
      .populate('user', 'name email')
      .populate('approvalStatus.approvedBy', 'name email')
      .select('-__v');

    res.status(200).json({
      status: 'success',
      message: 'Cash payment voucher completed successfully',
      data: {
        voucher: populatedVoucher,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Cancel cash payment voucher
// @route   PUT /api/cash-payment-vouchers/:id/cancel
// @access  Private
const cancelCashPaymentVoucher = async (req, res) => {
  try {
    const voucher = await CashPaymentVoucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Cash payment voucher not found',
      });
    }

    if (voucher.status === 'completed') {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot cancel completed voucher',
      });
    }

    if (voucher.status === 'cancelled') {
      return res.status(400).json({
        status: 'fail',
        message: 'Voucher is already cancelled',
      });
    }

    await reversePostedBalancesForCashPaymentVoucher(voucher._id);

    const voucherAfterReverse = await CashPaymentVoucher.findById(req.params.id);
    if (!voucherAfterReverse) {
      return res.status(404).json({
        status: 'fail',
        message: 'Cash payment voucher not found',
      });
    }

    voucherAfterReverse.status = 'cancelled';

    const updatedVoucher = await voucherAfterReverse.save();

    const populatedVoucher = await CashPaymentVoucher.findById(updatedVoucher._id)
      .populate('cashBook', 'name code balance referCode')
      .populate('currency', 'name code symbol')
      .populate('payee', 'name accountName accountNumber bankName code')
      .populate('user', 'name email')
      .select('-__v');

    res.status(200).json({
      status: 'success',
      message: 'Cash payment voucher cancelled successfully',
      data: {
        voucher: populatedVoucher,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Delete cash payment voucher
// @route   DELETE /api/cash-payment-vouchers/:id
// @access  Private
const deleteCashPaymentVoucher = async (req, res) => {
  try {
    const voucher = await CashPaymentVoucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Cash payment voucher not found',
      });
    }

    // Prevent deletion if status is completed
    if (voucher.status === 'completed') {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot delete completed voucher',
      });
    }

    await reversePostedBalancesForCashPaymentVoucher(voucher._id);

    await CashPaymentVoucher.findByIdAndDelete(req.params.id);

    res.status(200).json({
      status: 'success',
      message: 'Cash payment voucher deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get cash payment vouchers by cash book
// @route   GET /api/cash-payment-vouchers/cash-book/:cashBookId
// @access  Private
const getVouchersByCashBook = async (req, res) => {
  try {
    const { cashBookId } = req.params;
    const { page = 1, limit = 10, startDate, endDate, status, voucherType } = req.query;

    if (!mongoose.Types.ObjectId.isValid(cashBookId)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid cash book ID format',
      });
    }

    const cashBookDoc = await CashBook.findById(cashBookId);
    if (!cashBookDoc) {
      return res.status(404).json({
        status: 'fail',
        message: 'Cash book not found',
      });
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    let query = { cashBook: cashBookId };

    if (status) {
      query.status = status;
    }

    if (voucherType) {
      query.voucherType = voucherType;
    }

    if (startDate && endDate) {
      query.voucherDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const totalVouchers = await CashPaymentVoucher.countDocuments(query);

    const vouchers = await CashPaymentVoucher.find(query)
      .populate('currency', 'name code symbol')
      .populate('payee', 'name accountName accountNumber bankName code')
      .populate('user', 'name email')
      .sort({ voucherDate: -1 })
      .skip(skip)
      .limit(limitNum)
      .select('-__v');

    res.status(200).json({
      status: 'success',
      results: vouchers.length,
      totalPages: Math.ceil(totalVouchers / limitNum),
      currentPage: pageNum,
      totalVouchers,
      cashBook: { _id: cashBookDoc._id, name: cashBookDoc.name, code: cashBookDoc.code, balance: cashBookDoc.balance, referCode: cashBookDoc.referCode },
      data: {
        vouchers,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Create missing Payment transactions for existing vouchers
// @route   POST /api/cash-payment-vouchers/:id/create-transaction
// @access  Private
const createMissingTransaction = async (req, res) => {
  try {
    const voucher = await CashPaymentVoucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Cash payment voucher not found',
      });
    }

    // Check if transaction already exists
    if (voucher.payeeType === 'supplier' && voucher.relatedSupplierPayment) {
      return res.status(400).json({
        status: 'fail',
        message: 'Supplier payment already exists for this voucher',
      });
    }

    if (voucher.payeeType === 'customer' && voucher.relatedPayment) {
      return res.status(400).json({
        status: 'fail',
        message: 'Payment already exists for this voucher',
      });
    }

    if (voucher.relatedFinancialPayment) {
      return res.status(400).json({
        status: 'fail',
        message: 'Financial payment already exists for this voucher',
      });
    }

    if (!shouldCreateLedgerTransactionForStatus(voucher.status)) {
      return res.status(400).json({
        status: 'fail',
        message: `Can only create transactions for posted vouchers (${CASH_BALANCE_POSTED_STATUSES.join(', ')})`,
      });
    }

    // Create the transaction
    const transactionResult = await createTransactionFromVoucher(voucher, req.user._id);

    // Reload voucher to get updated data
    const updatedVoucher = await CashPaymentVoucher.findById(voucher._id)
      .populate('cashBook', 'name code balance referCode')
      .populate('currency', 'name code symbol')
      .populate('payee', 'name accountName accountNumber bankName code')
      .populate('user', 'name email')
      .populate('relatedPayment', 'paymentNumber amount')
      .populate('relatedSupplierPayment', 'paymentNumber amount')
      .select('-__v');

    if (
      transactionResult.createdSupplierPayment ||
      transactionResult.createdPayment ||
      transactionResult.createdFinancialPayment
    ) {
      res.status(200).json({
        status: 'success',
        message: 'Transaction created successfully',
        data: {
          voucher: updatedVoucher,
          createdTransaction: transactionResult.createdSupplierPayment
            ? { type: 'SupplierPayment', id: transactionResult.createdSupplierPayment._id }
            : transactionResult.createdPayment
              ? { type: 'Payment', id: transactionResult.createdPayment._id }
              : {
                  type: 'FinancialPayment',
                  id: transactionResult.createdFinancialPayment._id,
                  referCode: transactionResult.createdFinancialPayment.referCode,
                },
        },
      });
    } else {
      res.status(400).json({
        status: 'fail',
        message: 'Failed to create transaction. Check server logs for details.',
        data: {
          voucher: updatedVoucher
        }
      });
    }
  } catch (error) {
    console.error('Error creating missing transaction:', error);
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Create missing Payment transactions for all vouchers without transactions
// @route   POST /api/cash-payment-vouchers/create-missing-transactions
// @access  Private/Admin
const createMissingTransactionsForAll = async (req, res) => {
  try {
    // Find all completed/approved vouchers without transactions
    const vouchersWithoutTransactions = await CashPaymentVoucher.find({
      status: { $in: ['completed', 'approved'] },
      $or: [
        { payeeType: 'customer', relatedPayment: { $exists: false } },
        { payeeType: 'customer', relatedPayment: null },
        { payeeType: 'supplier', relatedSupplierPayment: { $exists: false } },
        { payeeType: 'supplier', relatedSupplierPayment: null }
      ]
    }).limit(100); // Limit to 100 at a time to avoid timeout

    const results = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: []
    };

    for (const voucher of vouchersWithoutTransactions) {
      try {
        results.processed++;
        const transactionResult = await createTransactionFromVoucher(voucher, req.user._id);
        
        if (transactionResult.createdSupplierPayment || transactionResult.createdPayment) {
          results.succeeded++;
        } else {
          results.failed++;
          results.errors.push({
            voucherId: voucher._id,
            voucherNumber: voucher.voucherNumber,
            error: 'Transaction creation returned null'
          });
        }
      } catch (error) {
        results.failed++;
        results.errors.push({
          voucherId: voucher._id,
          voucherNumber: voucher.voucherNumber,
          error: error.message
        });
      }
    }

    res.status(200).json({
      status: 'success',
      message: `Processed ${results.processed} vouchers`,
      data: results
    });
  } catch (error) {
    console.error('Error creating missing transactions:', error);
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

module.exports = {
  getCashPaymentVouchers,
  getCashPaymentVoucherById,
  createCashPaymentVoucher,
  updateCashPaymentVoucher,
  approveCashPaymentVoucher,
  rejectCashPaymentVoucher,
  completeCashPaymentVoucher,
  cancelCashPaymentVoucher,
  deleteCashPaymentVoucher,
  getVouchersByCashBook,
  createMissingTransaction,
  createMissingTransactionsForAll,
};

