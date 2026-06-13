const mongoose = require('mongoose');
const JournalPaymentVoucher = require('../models/journalPaymentVoucherModel');
const Currency = require('../models/currencyModel');
const APIFeatures = require('../utils/apiFeatures');
const cloudinary = require('cloudinary').v2;
const {
  parseSarafEntriesInput,
  validateSarafJournalEntries,
  mapNormalizedSarafEntries,
  createTransactionsFromJournalPaymentEntries,
  applyBankBalanceForJournalPaymentVoucher,
  JOURNAL_PAYMENT_BANK_BALANCE_POSTED_STATUSES,
} = require('../services/sarafVoucherEntryTransactions');

const populateJournalVoucher = (query) =>
  query
    .populate('currency', 'name code symbol')
    .populate('entries.account')
    .populate('entries.bankAccount', 'accountName accountNumber bankName')
    .populate('entries.currency', 'name code symbol')
    .populate('user', 'name email')
    .populate('approvalStatus.approvedBy', 'name email')
    .populate('postedBy', 'name email')
    .populate('completedBy', 'name email')
    .populate('relatedPurchase', 'invoiceNumber totalAmount')
    .populate('relatedSale', 'invoiceNumber grandTotal')
    .populate('relatedPayment', 'paymentNumber amount')
    .populate('relatedSupplierPayment', 'paymentNumber amount')
    .populate('relatedBankPaymentVoucher', 'voucherNumber amount')
    .populate('relatedCashPaymentVoucher', 'voucherNumber amount')
    .populate('relatedFinancialPayments', 'referCode amount currency paymentDate relatedModel relatedId')
    .select('-__v');

const parseAttachmentsString = (attachmentsStr) => {
  if (!attachmentsStr || typeof attachmentsStr !== 'string') return [];

  try {
    let cleanString = attachmentsStr.trim();
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
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return [parsed];
    return [];
  } catch {
    return [];
  }
};

const normalizeAttachmentsInput = (attachments, reqFile, existingAttachments = []) => {
  let uploadedAttachments = existingAttachments.length ? [...existingAttachments] : [];

  if (reqFile) {
    uploadedAttachments = [];
  }

  if (attachments !== undefined && attachments !== null) {
    let parsedAttachments = [];
    if (Array.isArray(attachments)) {
      parsedAttachments = attachments;
    } else if (typeof attachments === 'string') {
      parsedAttachments = parseAttachmentsString(attachments);
    } else if (typeof attachments === 'object' && !Array.isArray(attachments)) {
      parsedAttachments = [attachments];
    }

    const normalizedAttachments = parsedAttachments
      .filter((att) => att && typeof att === 'object' && !Array.isArray(att) && (att.url || att.name))
      .map((att) => ({
        url: String(att.url || ''),
        name: String(att.name || ''),
        type: String(att.type || att.mimetype || ''),
      }));

    if (reqFile && uploadedAttachments.length > 0) {
      uploadedAttachments = [...uploadedAttachments, ...normalizedAttachments];
    } else if (!reqFile) {
      uploadedAttachments = normalizedAttachments;
    }
  }

  return uploadedAttachments
    .filter((att) => att && typeof att === 'object' && !Array.isArray(att))
    .map((att) => ({
      url: String(att.url || ''),
      name: String(att.name || ''),
      type: String(att.type || ''),
    }));
};

const uploadAttachmentFile = async (reqFile, folder) => {
  const uploadResult = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ folder }, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
    stream.end(reqFile.buffer);
  });

  return {
    url: String(uploadResult.secure_url || ''),
    name: String(reqFile.originalname || ''),
    type: String(reqFile.mimetype || ''),
  };
};

const applyJournalPostingSideEffects = async (voucher, userId) => {
  if (!voucher.entries || voucher.entries.length < 2) return null;
  await applyBankBalanceForJournalPaymentVoucher(voucher._id);
  return createTransactionsFromJournalPaymentEntries(voucher, userId);
};

// @desc    Get all journal payment vouchers with filtering and pagination
// @route   GET /api/journal-payment-vouchers
// @access  Private
const getJournalPaymentVouchers = async (req, res) => {
  try {
    const features = new APIFeatures(JournalPaymentVoucher.find(), req.query)
      .filter()
      .sort()
      .limitFields()
      .paginate();

    const vouchers = await populateJournalVoucher(features.query).sort({ voucherDate: -1 });

    const queryObj = { ...req.query };
    const excludedFields = ['page', 'sort', 'limit', 'fields'];
    excludedFields.forEach((el) => delete queryObj[el]);
    let queryStr = JSON.stringify(queryObj);
    queryStr = queryStr.replace(/\b(gte|gt|lte|lt)\b/g, (match) => `$${match}`);
    const filterQuery = queryStr ? JSON.parse(queryStr) : {};

    const totalVouchers = await JournalPaymentVoucher.countDocuments(filterQuery);

    res.status(200).json({
      status: 'success',
      results: vouchers.length,
      totalVouchers,
      data: { vouchers },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get journal payment voucher by ID
// @route   GET /api/journal-payment-vouchers/:id
// @access  Private
const getJournalPaymentVoucherById = async (req, res) => {
  try {
    const voucher = await populateJournalVoucher(JournalPaymentVoucher.findById(req.params.id));

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Journal payment voucher not found',
      });
    }

    res.status(200).json({
      status: 'success',
      data: { voucher },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Create new journal payment voucher
// @route   POST /api/journal-payment-vouchers
// @access  Private
const createJournalPaymentVoucher = async (req, res) => {
  try {
    const {
      voucherDate,
      voucherType,
      entries,
      currency,
      currencyExchangeRate,
      referenceNumber,
      transactionId,
      relatedPurchase,
      relatedSale,
      relatedPayment,
      relatedSupplierPayment,
      relatedBankPaymentVoucher,
      relatedCashPaymentVoucher,
      description,
      notes,
      status,
      attachments,
    } = req.body;

    const { error: entriesParseError, parsedEntries } = parseSarafEntriesInput(entries);
    if (entriesParseError) {
      return res.status(400).json({
        status: 'fail',
        message: entriesParseError,
      });
    }

    if (!parsedEntries || !Array.isArray(parsedEntries) || parsedEntries.length < 2) {
      return res.status(400).json({
        status: 'fail',
        message: 'Journal voucher must have at least 2 entries with per-line currency and debit/credit (exchangeRate is optional for 2-line cross-currency pairs — auto-calculated).',
      });
    }

    const journalCheck = await validateSarafJournalEntries(parsedEntries);
    if (!journalCheck.ok) {
      return res.status(journalCheck.status).json({
        status: 'fail',
        message: journalCheck.message,
        totalBaseDebits: journalCheck.totalBaseDebits,
        totalBaseCredits: journalCheck.totalBaseCredits,
      });
    }

    let uploadedAttachments = [];
    if (req.file) {
      try {
        uploadedAttachments.push(await uploadAttachmentFile(req.file, 'journal-payment-vouchers'));
      } catch (uploadError) {
        console.error('Error uploading file:', uploadError);
      }
    }
    uploadedAttachments = normalizeAttachmentsInput(attachments, req.file, uploadedAttachments);

    if (!req.user || !req.user._id) {
      return res.status(401).json({
        status: 'fail',
        message: 'User not authenticated',
      });
    }

    const voucherStatus = status || 'completed';

    const voucherData = {
      voucherType: voucherType || 'journal_entry',
      entries: mapNormalizedSarafEntries(parsedEntries),
      currency,
      currencyExchangeRate: currencyExchangeRate
        ? typeof currencyExchangeRate === 'string'
          ? parseFloat(currencyExchangeRate)
          : currencyExchangeRate
        : 1,
      referenceNumber,
      transactionId,
      relatedPurchase,
      relatedSale,
      relatedPayment,
      relatedSupplierPayment,
      relatedBankPaymentVoucher,
      relatedCashPaymentVoucher,
      description,
      notes,
      status: voucherStatus,
      attachments: uploadedAttachments,
      user: req.user._id,
    };

    if (voucherDate) {
      const parsedDate = new Date(voucherDate);
      if (!isNaN(parsedDate.getTime())) {
        voucherData.voucherDate = parsedDate;
      }
    }

    if (req.body.voucherNumber) {
      voucherData.voucherNumber = req.body.voucherNumber;
    }

    const voucher = await JournalPaymentVoucher.create(voucherData);

    let transactionResult = null;
    if (JOURNAL_PAYMENT_BANK_BALANCE_POSTED_STATUSES.includes(voucherStatus)) {
      transactionResult = await applyJournalPostingSideEffects(voucher, req.user._id);
    }

    const populatedVoucher = await populateJournalVoucher(JournalPaymentVoucher.findById(voucher._id));

    const responseData = { voucher: populatedVoucher };
    if (transactionResult) {
      if (
        transactionResult.createdPayment ||
        transactionResult.createdSupplierPayment ||
        (transactionResult.createdFinancialPayments && transactionResult.createdFinancialPayments.length > 0)
      ) {
        responseData.createdTransactions = {
          ...(transactionResult.createdPayment && {
            payment: {
              type: 'Payment',
              id: transactionResult.createdPayment._id,
              paymentNumber: transactionResult.createdPayment.paymentNumber,
            },
          }),
          ...(transactionResult.createdSupplierPayment && {
            supplierPayment: {
              type: 'SupplierPayment',
              id: transactionResult.createdSupplierPayment._id,
              paymentNumber: transactionResult.createdSupplierPayment.paymentNumber,
            },
          }),
          ...(transactionResult.createdFinancialPayments &&
            transactionResult.createdFinancialPayments.length > 0 && {
              financialPayments: transactionResult.createdFinancialPayments.map((fp) => ({
                type: 'FinancialPayment',
                id: fp._id,
                referCode: fp.referCode,
                amount: fp.amount,
                relatedModel: fp.relatedModel,
              })),
            }),
        };
      }
      if (transactionResult.error) {
        responseData.transactionError = transactionResult.error;
      }
    }

    res.status(201).json({
      status: 'success',
      message: 'Journal payment voucher created successfully',
      data: responseData,
    });
  } catch (error) {
    console.error('Error creating journal payment voucher:', error);

    if (error.name === 'ValidationError') {
      const validationErrors = Object.keys(error.errors).map((key) => ({
        field: key,
        message: error.errors[key].message,
        value: error.errors[key].value,
      }));

      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: validationErrors,
      });
    }

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

// @desc    Update journal payment voucher
// @route   PUT /api/journal-payment-vouchers/:id
// @access  Private
const updateJournalPaymentVoucher = async (req, res) => {
  try {
    const voucher = await JournalPaymentVoucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Journal payment voucher not found',
      });
    }

    if (['completed', 'posted', 'cancelled'].includes(voucher.status)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot update completed, posted or cancelled voucher',
      });
    }

    const previousStatus = voucher.status;

    const {
      voucherDate,
      voucherType,
      entries,
      currency,
      currencyExchangeRate,
      referenceNumber,
      transactionId,
      relatedPurchase,
      relatedSale,
      relatedPayment,
      relatedSupplierPayment,
      relatedBankPaymentVoucher,
      relatedCashPaymentVoucher,
      description,
      notes,
      status,
      attachments,
    } = req.body;

    const { error: entriesParseError, parsedEntries } = parseSarafEntriesInput(entries);
    if (entriesParseError) {
      return res.status(400).json({
        status: 'fail',
        message: entriesParseError,
      });
    }

    if (entries !== undefined) {
      if (!parsedEntries || !Array.isArray(parsedEntries) || parsedEntries.length < 2) {
        return res.status(400).json({
          status: 'fail',
          message: 'Journal voucher must have at least 2 entries with per-line currency and debit/credit (exchangeRate is optional for 2-line cross-currency pairs — auto-calculated).',
        });
      }

      const journalCheck = await validateSarafJournalEntries(parsedEntries);
      if (!journalCheck.ok) {
        return res.status(journalCheck.status).json({
          status: 'fail',
          message: journalCheck.message,
          totalBaseDebits: journalCheck.totalBaseDebits,
          totalBaseCredits: journalCheck.totalBaseCredits,
        });
      }

      voucher.entries = mapNormalizedSarafEntries(parsedEntries);
    }

    if (attachments !== undefined || req.file) {
      let uploadedAttachments = voucher.attachments || [];

      if (req.file) {
        if (voucher.attachments && voucher.attachments.length > 0) {
          for (const attachment of voucher.attachments) {
            if (attachment.url) {
              try {
                const publicId = attachment.url.split('/').slice(-2).join('/').split('.')[0];
                await cloudinary.uploader.destroy(`journal-payment-vouchers/${publicId}`);
              } catch (error) {
                console.error('Error deleting old attachment:', error);
              }
            }
          }
        }

        try {
          uploadedAttachments = [await uploadAttachmentFile(req.file, 'journal-payment-vouchers')];
        } catch {
          uploadedAttachments = voucher.attachments || [];
        }
      }

      voucher.attachments = normalizeAttachmentsInput(attachments, req.file, uploadedAttachments);
    }

    if (voucherDate !== undefined) {
      const parsedDate = new Date(voucherDate);
      if (!isNaN(parsedDate.getTime())) {
        voucher.voucherDate = parsedDate;
      }
    }
    if (voucherType !== undefined) voucher.voucherType = voucherType;
    if (currency !== undefined) voucher.currency = currency;
    if (currencyExchangeRate !== undefined) {
      voucher.currencyExchangeRate =
        typeof currencyExchangeRate === 'string' ? parseFloat(currencyExchangeRate) : currencyExchangeRate;
    }
    if (referenceNumber !== undefined) voucher.referenceNumber = referenceNumber;
    if (transactionId !== undefined) voucher.transactionId = transactionId;
    if (relatedPurchase !== undefined) voucher.relatedPurchase = relatedPurchase;
    if (relatedSale !== undefined) voucher.relatedSale = relatedSale;
    if (relatedPayment !== undefined) voucher.relatedPayment = relatedPayment;
    if (relatedSupplierPayment !== undefined) voucher.relatedSupplierPayment = relatedSupplierPayment;
    if (relatedBankPaymentVoucher !== undefined) voucher.relatedBankPaymentVoucher = relatedBankPaymentVoucher;
    if (relatedCashPaymentVoucher !== undefined) voucher.relatedCashPaymentVoucher = relatedCashPaymentVoucher;
    if (description !== undefined) voucher.description = description;
    if (notes !== undefined) voucher.notes = notes;
    if (status !== undefined) voucher.status = status;

    const updatedVoucher = await voucher.save();

    const wasPosted = JOURNAL_PAYMENT_BANK_BALANCE_POSTED_STATUSES.includes(previousStatus);
    const isPosted = JOURNAL_PAYMENT_BANK_BALANCE_POSTED_STATUSES.includes(updatedVoucher.status);
    if (!wasPosted && isPosted) {
      await applyJournalPostingSideEffects(updatedVoucher, req.user._id);
    }

    const populatedVoucher = await populateJournalVoucher(JournalPaymentVoucher.findById(updatedVoucher._id));

    res.status(200).json({
      status: 'success',
      message: 'Journal payment voucher updated successfully',
      data: { voucher: populatedVoucher },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Approve journal payment voucher
// @route   PUT /api/journal-payment-vouchers/:id/approve
// @access  Private
const approveJournalPaymentVoucher = async (req, res) => {
  try {
    const voucher = await JournalPaymentVoucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Journal payment voucher not found',
      });
    }

    if (['completed', 'posted', 'cancelled'].includes(voucher.status)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot approve completed, posted or cancelled voucher',
      });
    }

    voucher.status = 'approved';
    voucher.approvalStatus = {
      approvedBy: req.user._id,
      approvedAt: new Date(),
    };

    const updatedVoucher = await voucher.save();
    const populatedVoucher = await populateJournalVoucher(JournalPaymentVoucher.findById(updatedVoucher._id));

    res.status(200).json({
      status: 'success',
      message: 'Journal payment voucher approved successfully',
      data: { voucher: populatedVoucher },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Reject journal payment voucher
// @route   PUT /api/journal-payment-vouchers/:id/reject
// @access  Private
const rejectJournalPaymentVoucher = async (req, res) => {
  try {
    const { rejectionReason } = req.body;
    const voucher = await JournalPaymentVoucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Journal payment voucher not found',
      });
    }

    if (['completed', 'posted', 'cancelled'].includes(voucher.status)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot reject completed, posted or cancelled voucher',
      });
    }

    voucher.status = 'rejected';
    voucher.approvalStatus = {
      approvedBy: req.user._id,
      approvedAt: new Date(),
      rejectionReason: rejectionReason || 'No reason provided',
    };

    const updatedVoucher = await voucher.save();
    const populatedVoucher = await populateJournalVoucher(JournalPaymentVoucher.findById(updatedVoucher._id));

    res.status(200).json({
      status: 'success',
      message: 'Journal payment voucher rejected',
      data: { voucher: populatedVoucher },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Complete journal payment voucher (same posting logic as saraf entry voucher)
// @route   PUT /api/journal-payment-vouchers/:id/complete
// @access  Private
const completeJournalPaymentVoucher = async (req, res) => {
  try {
    const voucher = await JournalPaymentVoucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Journal payment voucher not found',
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
    voucher.completedAt = new Date();
    voucher.completedBy = req.user._id;

    const updatedVoucher = await voucher.save();

    if (updatedVoucher.entries && updatedVoucher.entries.length >= 2) {
      await applyJournalPostingSideEffects(updatedVoucher, req.user._id);
    }

    const populatedVoucher = await populateJournalVoucher(JournalPaymentVoucher.findById(updatedVoucher._id));

    res.status(200).json({
      status: 'success',
      message: 'Journal payment voucher completed successfully',
      data: { voucher: populatedVoucher },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Post journal payment voucher to ledger (alias of complete with posted status)
// @route   PUT /api/journal-payment-vouchers/:id/post
// @access  Private
const postJournalPaymentVoucher = async (req, res) => {
  try {
    const voucher = await JournalPaymentVoucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Journal payment voucher not found',
      });
    }

    if (voucher.status === 'posted' || voucher.status === 'completed') {
      return res.status(400).json({
        status: 'fail',
        message: 'Voucher is already posted or completed',
      });
    }

    if (voucher.status === 'cancelled' || voucher.status === 'rejected') {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot post cancelled or rejected voucher',
      });
    }

    voucher.status = 'posted';
    voucher.postedAt = new Date();
    voucher.postedBy = req.user._id;

    const updatedVoucher = await voucher.save();

    if (updatedVoucher.entries && updatedVoucher.entries.length >= 2) {
      await applyJournalPostingSideEffects(updatedVoucher, req.user._id);
    }

    const populatedVoucher = await populateJournalVoucher(JournalPaymentVoucher.findById(updatedVoucher._id));

    res.status(200).json({
      status: 'success',
      message: 'Journal payment voucher posted successfully',
      data: { voucher: populatedVoucher },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Cancel journal payment voucher
// @route   PUT /api/journal-payment-vouchers/:id/cancel
// @access  Private
const cancelJournalPaymentVoucher = async (req, res) => {
  try {
    const voucher = await JournalPaymentVoucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Journal payment voucher not found',
      });
    }

    if (voucher.status === 'posted' || voucher.status === 'completed') {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot cancel completed or posted voucher',
      });
    }

    if (voucher.status === 'cancelled') {
      return res.status(400).json({
        status: 'fail',
        message: 'Voucher is already cancelled',
      });
    }

    voucher.status = 'cancelled';

    const updatedVoucher = await voucher.save();
    const populatedVoucher = await populateJournalVoucher(JournalPaymentVoucher.findById(updatedVoucher._id));

    res.status(200).json({
      status: 'success',
      message: 'Journal payment voucher cancelled successfully',
      data: { voucher: populatedVoucher },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Delete journal payment voucher
// @route   DELETE /api/journal-payment-vouchers/:id
// @access  Private
const deleteJournalPaymentVoucher = async (req, res) => {
  try {
    const voucher = await JournalPaymentVoucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Journal payment voucher not found',
      });
    }

    if (voucher.status === 'posted' || voucher.status === 'completed') {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot delete completed or posted voucher',
      });
    }

    await JournalPaymentVoucher.findByIdAndDelete(req.params.id);

    res.status(200).json({
      status: 'success',
      message: 'Journal payment voucher deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get journal payment vouchers by currency
// @route   GET /api/journal-payment-vouchers/currency/:currencyId
// @access  Private
const getVouchersByCurrency = async (req, res) => {
  try {
    const { currencyId } = req.params;
    const { page = 1, limit = 10, startDate, endDate, status } = req.query;

    if (!mongoose.Types.ObjectId.isValid(currencyId)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid currency ID format',
      });
    }

    const currency = await Currency.findById(currencyId);
    if (!currency) {
      return res.status(404).json({
        status: 'fail',
        message: 'Currency not found',
      });
    }

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const query = {
      $or: [{ currency: currencyId }, { 'entries.currency': currencyId }],
    };

    if (status) {
      query.status = status;
    }

    if (startDate && endDate) {
      query.voucherDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const totalVouchers = await JournalPaymentVoucher.countDocuments(query);

    const vouchers = await populateJournalVoucher(
      JournalPaymentVoucher.find(query).sort({ voucherDate: -1 }).skip(skip).limit(limitNum)
    );

    res.status(200).json({
      status: 'success',
      results: vouchers.length,
      totalPages: Math.ceil(totalVouchers / limitNum),
      currentPage: pageNum,
      totalVouchers,
      currency: {
        _id: currency._id,
        name: currency.name,
        code: currency.code,
        symbol: currency.symbol,
      },
      data: { vouchers },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

module.exports = {
  getJournalPaymentVouchers,
  getJournalPaymentVoucherById,
  createJournalPaymentVoucher,
  updateJournalPaymentVoucher,
  approveJournalPaymentVoucher,
  rejectJournalPaymentVoucher,
  completeJournalPaymentVoucher,
  postJournalPaymentVoucher,
  cancelJournalPaymentVoucher,
  deleteJournalPaymentVoucher,
  getVouchersByCurrency,
};
