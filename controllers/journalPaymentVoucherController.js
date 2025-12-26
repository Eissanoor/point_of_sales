const mongoose = require('mongoose');
const JournalPaymentVoucher = require('../models/journalPaymentVoucherModel');
const BankAccount = require('../models/bankAccountModel');
const APIFeatures = require('../utils/apiFeatures');
const cloudinary = require('cloudinary').v2;

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

    const vouchers = await features.query
      .populate('currency', 'name code symbol')
      .populate('entries.account')
      .populate('user', 'name email')
      .populate('approvalStatus.approvedBy', 'name')
      .populate('postedBy', 'name email')
      .populate('relatedPurchase', 'invoiceNumber')
      .populate('relatedSale', 'invoiceNumber')
      .populate('relatedPayment', 'paymentNumber amount')
      .populate('relatedSupplierPayment', 'paymentNumber amount')
      .populate('relatedBankPaymentVoucher', 'voucherNumber amount')
      .populate('relatedCashPaymentVoucher', 'voucherNumber amount')
      .sort({ voucherDate: -1 })
      .select('-__v');

    // Build filter query for count
    const queryObj = { ...req.query };
    const excludedFields = ['page', 'sort', 'limit', 'fields'];
    excludedFields.forEach(el => delete queryObj[el]);
    let queryStr = JSON.stringify(queryObj);
    queryStr = queryStr.replace(/\b(gte|gt|lte|lt)\b/g, match => `$${match}`);
    const filterQuery = queryStr ? JSON.parse(queryStr) : {};
    
    const totalVouchers = await JournalPaymentVoucher.countDocuments(filterQuery);

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

// @desc    Get journal payment voucher by ID
// @route   GET /api/journal-payment-vouchers/:id
// @access  Private
const getJournalPaymentVoucherById = async (req, res) => {
  try {
    const voucher = await JournalPaymentVoucher.findById(req.params.id)
      .populate('currency', 'name code symbol')
      .populate('entries.account')
      .populate('user', 'name email')
      .populate('approvalStatus.approvedBy', 'name email')
      .populate('postedBy', 'name email')
      .populate('relatedPurchase', 'invoiceNumber totalAmount')
      .populate('relatedSale', 'invoiceNumber grandTotal')
      .populate('relatedPayment', 'paymentNumber amount')
      .populate('relatedSupplierPayment', 'paymentNumber amount')
      .populate('relatedBankPaymentVoucher', 'voucherNumber amount')
      .populate('relatedCashPaymentVoucher', 'voucherNumber amount')
      .select('-__v');

    if (!voucher) {
      return res.status(404).json({
        status: 'fail',
        message: 'Journal payment voucher not found',
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
    
    console.log('req.file:', req.file);
    console.log('attachments from req.body:', attachments);
    console.log('attachments type:', typeof attachments);
    console.log('entries from req.body:', entries);
    console.log('entries type:', typeof entries);
    
    // Parse entries if it comes as a string (from form-data)
    let parsedEntries = entries;
    
    if (typeof entries === 'string') {
      try {
        // Try to parse as JSON string
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
      } catch (parseError) {
        console.error('Error parsing entries string:', parseError);
        return res.status(400).json({
          status: 'fail',
          message: 'Invalid entries format. Entries must be a valid JSON array.',
        });
      }
    }
    
    // Handle form-data array notation (entries[0], entries[1], etc.)
    if (!Array.isArray(parsedEntries) && typeof parsedEntries === 'object' && parsedEntries !== null) {
      // Check if it's an object with numeric keys (form-data array notation)
      const keys = Object.keys(parsedEntries);
      const numericKeys = keys.filter(key => /^\d+$/.test(key));
      if (numericKeys.length > 0) {
        // Convert object with numeric keys to array
        parsedEntries = numericKeys
          .sort((a, b) => parseInt(a) - parseInt(b))
          .map(key => {
            const entryValue = parsedEntries[key];
            // If entryValue is a string, try to parse it as JSON
            if (typeof entryValue === 'string') {
              try {
                return JSON.parse(entryValue);
              } catch (e) {
                // If it's not JSON, it might be just a string - return as is
                return entryValue;
              }
            }
            return entryValue;
          });
      }
    }
    
    // Validate entries
    if (!parsedEntries || !Array.isArray(parsedEntries) || parsedEntries.length < 2) {
      return res.status(400).json({
        status: 'fail',
        message: 'Journal voucher must have at least 2 entries. Please provide entries as a JSON array.',
        receivedEntries: entries,
        parsedEntries: parsedEntries,
      });
    }

    // Validate that debits equal credits
    const totalDebits = parsedEntries.reduce((sum, entry) => {
      const debit = typeof entry.debit === 'string' ? parseFloat(entry.debit) : (entry.debit || 0);
      return sum + debit;
    }, 0);
    
    const totalCredits = parsedEntries.reduce((sum, entry) => {
      const credit = typeof entry.credit === 'string' ? parseFloat(entry.credit) : (entry.credit || 0);
      return sum + credit;
    }, 0);

    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      return res.status(400).json({
        status: 'fail',
        message: `Total debits (${totalDebits}) must equal total credits (${totalCredits})`,
        totalDebits,
        totalCredits,
      });
    }

    // Validate each entry
    for (let i = 0; i < parsedEntries.length; i++) {
      const entry = parsedEntries[i];
      
      // Check if entry is an object
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return res.status(400).json({
          status: 'fail',
          message: `Entry ${i} is invalid. Each entry must be an object with account, accountModel, debit, and credit fields.`,
          receivedEntry: entry,
          example: {
            account: "507f1f77bcf86cd799439011",
            accountModel: "BankAccount",
            accountName: "Main Bank Account",
            debit: 5000,
            credit: 0,
            description: "Entry description"
          }
        });
      }
      
      if (!entry.account) {
        return res.status(400).json({
          status: 'fail',
          message: `Entry ${i} is missing the 'account' field. Each entry must have an account (ObjectId).`,
          receivedEntry: entry,
          example: {
            account: "507f1f77bcf86cd799439011",
            accountModel: "BankAccount",
            debit: 5000,
            credit: 0
          }
        });
      }
      // Handle accountModel - it might come as an array from form-data
      let accountModel = entry.accountModel;
      if (Array.isArray(accountModel)) {
        // If it's an array, take the first element
        accountModel = accountModel[0];
      }
      
      if (!accountModel || (typeof accountModel !== 'string' && !Array.isArray(entry.accountModel))) {
        return res.status(400).json({
          status: 'fail',
          message: `Entry ${i} is missing the 'accountModel' field. Each entry must have an accountModel (string).`,
          receivedEntry: entry,
          example: {
            account: "507f1f77bcf86cd799439011",
            accountModel: "BankAccount",
            debit: 5000,
            credit: 0
          },
          validAccountModels: ["BankAccount", "CashAccount", "Supplier", "Customer", "Expense", "Income", "Asset", "Liability", "Equity"]
        });
      }
      
      // Normalize accountModel - convert to proper case
      if (typeof accountModel === 'string') {
        // Convert common variations to proper format
        accountModel = accountModel.trim();
        const accountModelMap = {
          'bankaccount': 'BankAccount',
          'cashaccount': 'CashAccount',
          'supplier': 'Supplier',
          'customer': 'Customer',
          'expense': 'Expense',
          'income': 'Income',
          'asset': 'Asset',
          'liability': 'Liability',
          'equity': 'Equity'
        };
        accountModel = accountModelMap[accountModel.toLowerCase()] || accountModel;
      }
      
      // Store normalized accountModel back to entry for later use
      entry.accountModel = accountModel;
      const debit = typeof entry.debit === 'string' ? parseFloat(entry.debit) : (entry.debit || 0);
      const credit = typeof entry.credit === 'string' ? parseFloat(entry.credit) : (entry.credit || 0);
      
      if (debit < 0 || credit < 0) {
        return res.status(400).json({
          status: 'fail',
          message: 'Debit and credit amounts cannot be negative',
        });
      }
      
      if (debit > 0 && credit > 0) {
        return res.status(400).json({
          status: 'fail',
          message: 'An entry cannot have both debit and credit amounts',
        });
      }
      
      if (debit === 0 && credit === 0) {
        return res.status(400).json({
          status: 'fail',
          message: 'An entry must have either a debit or credit amount',
        });
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
          return parsed;
        } else if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return [parsed];
        }
        
        return [];
      } catch (parseError) {
        console.error('Error parsing attachments string:', parseError.message);
        console.error('Raw attachments string:', attachmentsStr);
        
        try {
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
            { folder: 'journal-payment-vouchers' },
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
      }
    }
    
    // Handle attachments from req.body
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
        .filter(att => {
          if (!att || Array.isArray(att)) return false;
          if (typeof att !== 'object') return false;
          return att.url || att.name;
        })
        .map(att => ({
          url: String(att.url || ''),
          name: String(att.name || ''),
          type: String(att.type || att.mimetype || '')
        }));
      
      if (req.file && uploadedAttachments.length > 0) {
        uploadedAttachments = [...uploadedAttachments, ...normalizedAttachments];
      } else {
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

    // Normalize entries (accountModel should already be normalized from validation above)
    const normalizedEntries = parsedEntries.map(entry => {
      // Handle accountModel normalization again here to be safe
      let accountModel = entry.accountModel;
      if (Array.isArray(accountModel)) {
        accountModel = accountModel[0];
      }
      if (typeof accountModel === 'string') {
        accountModel = accountModel.trim();
        const accountModelMap = {
          'bankaccount': 'BankAccount',
          'cashaccount': 'CashAccount',
          'supplier': 'Supplier',
          'customer': 'Customer',
          'expense': 'Expense',
          'income': 'Income',
          'asset': 'Asset',
          'liability': 'Liability',
          'equity': 'Equity'
        };
        accountModel = accountModelMap[accountModel.toLowerCase()] || accountModel;
      }
      
      return {
        account: entry.account,
        accountModel: accountModel,
        accountName: entry.accountName || '',
        debit: typeof entry.debit === 'string' ? parseFloat(entry.debit) : (entry.debit || 0),
        credit: typeof entry.credit === 'string' ? parseFloat(entry.credit) : (entry.credit || 0),
        description: entry.description || '',
      };
    });

    // Create voucher
    const voucherData = {
      voucherType: voucherType || 'journal_entry',
      entries: normalizedEntries,
      currency,
      currencyExchangeRate: currencyExchangeRate ? (typeof currencyExchangeRate === 'string' ? parseFloat(currencyExchangeRate) : currencyExchangeRate) : 1,
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
      status: status || 'draft',
      attachments: uploadedAttachments,
      user: req.user._id,
    };

    // Only set voucherDate if explicitly provided
    if (voucherDate) {
      const parsedDate = new Date(voucherDate);
      if (!isNaN(parsedDate.getTime())) {
        voucherData.voucherDate = parsedDate;
      } else {
        console.warn('Invalid voucherDate format, using default:', voucherDate);
      }
    }

    // Only set voucherNumber if explicitly provided
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

    const voucher = await JournalPaymentVoucher.create(voucherData);

    // Populate before sending response
    const populatedVoucher = await JournalPaymentVoucher.findById(voucher._id)
      .populate('currency', 'name code symbol')
      .populate('entries.account')
      .populate('user', 'name email')
      .select('-__v');

    res.status(201).json({
      status: 'success',
      message: 'Journal payment voucher created successfully',
      data: {
        voucher: populatedVoucher,
      },
    });
  } catch (error) {
    console.error('Error creating journal payment voucher:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    
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

    // Prevent updates if status is posted or cancelled
    if (voucher.status === 'posted' || voucher.status === 'cancelled') {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot update posted or cancelled voucher',
      });
    }

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

    console.log('Update - req.file:', req.file);
    console.log('Update - attachments from req.body:', attachments);

    // Validate entries if provided
    if (entries !== undefined) {
      // Parse entries if it comes as a string (from form-data)
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
        } catch (parseError) {
          console.error('Error parsing entries string:', parseError);
          return res.status(400).json({
            status: 'fail',
            message: 'Invalid entries format. Entries must be a valid JSON array.',
          });
        }
      }
      
      // Handle form-data array notation
      if (!Array.isArray(parsedEntries) && typeof parsedEntries === 'object' && parsedEntries !== null) {
        const keys = Object.keys(parsedEntries);
        const numericKeys = keys.filter(key => /^\d+$/.test(key));
        if (numericKeys.length > 0) {
          parsedEntries = numericKeys
            .sort((a, b) => parseInt(a) - parseInt(b))
            .map(key => {
              const entryValue = parsedEntries[key];
              if (typeof entryValue === 'string') {
                try {
                  return JSON.parse(entryValue);
                } catch (e) {
                  return entryValue;
                }
              }
              return entryValue;
            });
        }
      }
      
      if (!Array.isArray(parsedEntries) || parsedEntries.length < 2) {
        return res.status(400).json({
          status: 'fail',
          message: 'Journal voucher must have at least 2 entries',
        });
      }

      const totalDebits = parsedEntries.reduce((sum, entry) => {
        const debit = typeof entry.debit === 'string' ? parseFloat(entry.debit) : (entry.debit || 0);
        return sum + debit;
      }, 0);
      
      const totalCredits = parsedEntries.reduce((sum, entry) => {
        const credit = typeof entry.credit === 'string' ? parseFloat(entry.credit) : (entry.credit || 0);
        return sum + credit;
      }, 0);

      if (Math.abs(totalDebits - totalCredits) > 0.01) {
        return res.status(400).json({
          status: 'fail',
          message: `Total debits (${totalDebits}) must equal total credits (${totalCredits})`,
          totalDebits,
          totalCredits,
        });
      }

      // Normalize entries
      const normalizedEntries = parsedEntries.map(entry => ({
        account: entry.account,
        accountModel: entry.accountModel,
        accountName: entry.accountName || '',
        debit: typeof entry.debit === 'string' ? parseFloat(entry.debit) : (entry.debit || 0),
        credit: typeof entry.credit === 'string' ? parseFloat(entry.credit) : (entry.credit || 0),
        description: entry.description || '',
      }));

      voucher.entries = normalizedEntries;
    }

    // Handle attachments (similar to create)
    const parseAttachmentsString = (attachmentsStr) => {
      if (!attachmentsStr || typeof attachmentsStr !== 'string') {
        return [];
      }
      
      try {
        let cleanString = attachmentsStr.trim();
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
          return parsed;
        } else if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return [parsed];
        }
        return [];
      } catch (parseError) {
        console.error('Error parsing attachments string:', parseError.message);
        return [];
      }
    };

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

      uploadedAttachments = [];
      try {
        const uploadResult = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder: 'journal-payment-vouchers' },
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
      } catch (uploadError) {
        console.error('Error uploading file:', uploadError);
        uploadedAttachments = voucher.attachments || [];
      }
    }
    
    if (attachments !== undefined) {
      if (attachments === null) {
        uploadedAttachments = [];
      } else {
        let parsedAttachments = [];
        
        if (Array.isArray(attachments)) {
          parsedAttachments = attachments;
        } else if (typeof attachments === 'string') {
          parsedAttachments = parseAttachmentsString(attachments);
        } else if (typeof attachments === 'object' && !Array.isArray(attachments)) {
          parsedAttachments = [attachments];
        }
        
        const normalizedAttachments = parsedAttachments
          .filter(att => {
            if (!att || Array.isArray(att)) return false;
            if (typeof att !== 'object') return false;
            return att.url || att.name;
          })
          .map(att => ({
            url: String(att.url || ''),
            name: String(att.name || ''),
            type: String(att.type || att.mimetype || '')
          }));
        
        if (req.file && uploadedAttachments.length > 0) {
          uploadedAttachments = [...uploadedAttachments, ...normalizedAttachments];
        } else {
          uploadedAttachments = normalizedAttachments;
        }
      }
    }

    // Update fields
    if (voucherDate !== undefined) {
      const parsedDate = new Date(voucherDate);
      if (!isNaN(parsedDate.getTime())) {
        voucher.voucherDate = parsedDate;
      }
    }
    if (voucherType !== undefined) voucher.voucherType = voucherType;
    if (currency !== undefined) voucher.currency = currency;
    if (currencyExchangeRate !== undefined) voucher.currencyExchangeRate = typeof currencyExchangeRate === 'string' ? parseFloat(currencyExchangeRate) : currencyExchangeRate;
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
    if (attachments !== undefined || req.file) {
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
    }

    const updatedVoucher = await voucher.save();

    // Populate before sending response
    const populatedVoucher = await JournalPaymentVoucher.findById(updatedVoucher._id)
      .populate('currency', 'name code symbol')
      .populate('entries.account')
      .populate('user', 'name email')
      .select('-__v');

    res.status(200).json({
      status: 'success',
      message: 'Journal payment voucher updated successfully',
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

    if (voucher.status === 'posted' || voucher.status === 'cancelled') {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot approve posted or cancelled voucher',
      });
    }

    voucher.status = 'approved';
    voucher.approvalStatus = {
      approvedBy: req.user._id,
      approvedAt: new Date(),
    };

    const updatedVoucher = await voucher.save();

    const populatedVoucher = await JournalPaymentVoucher.findById(updatedVoucher._id)
      .populate('currency', 'name code symbol')
      .populate('entries.account')
      .populate('user', 'name email')
      .populate('approvalStatus.approvedBy', 'name email')
      .select('-__v');

    res.status(200).json({
      status: 'success',
      message: 'Journal payment voucher approved successfully',
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

    if (voucher.status === 'posted' || voucher.status === 'cancelled') {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot reject posted or cancelled voucher',
      });
    }

    voucher.status = 'rejected';
    voucher.approvalStatus = {
      approvedBy: req.user._id,
      approvedAt: new Date(),
      rejectionReason: rejectionReason || 'No reason provided',
    };

    const updatedVoucher = await voucher.save();

    const populatedVoucher = await JournalPaymentVoucher.findById(updatedVoucher._id)
      .populate('currency', 'name code symbol')
      .populate('entries.account')
      .populate('user', 'name email')
      .populate('approvalStatus.approvedBy', 'name email')
      .select('-__v');

    res.status(200).json({
      status: 'success',
      message: 'Journal payment voucher rejected',
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

// @desc    Post journal payment voucher (mark as posted to ledger)
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

    if (voucher.status === 'posted') {
      return res.status(400).json({
        status: 'fail',
        message: 'Voucher is already posted',
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

    const populatedVoucher = await JournalPaymentVoucher.findById(updatedVoucher._id)
      .populate('currency', 'name code symbol')
      .populate('entries.account')
      .populate('user', 'name email')
      .populate('postedBy', 'name email')
      .select('-__v');

    res.status(200).json({
      status: 'success',
      message: 'Journal payment voucher posted successfully',
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

    if (voucher.status === 'posted') {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot cancel posted voucher',
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

    const populatedVoucher = await JournalPaymentVoucher.findById(updatedVoucher._id)
      .populate('currency', 'name code symbol')
      .populate('entries.account')
      .populate('user', 'name email')
      .select('-__v');

    res.status(200).json({
      status: 'success',
      message: 'Journal payment voucher cancelled successfully',
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

    // Prevent deletion if status is posted
    if (voucher.status === 'posted') {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot delete posted voucher',
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

module.exports = {
  getJournalPaymentVouchers,
  getJournalPaymentVoucherById,
  createJournalPaymentVoucher,
  updateJournalPaymentVoucher,
  approveJournalPaymentVoucher,
  rejectJournalPaymentVoucher,
  postJournalPaymentVoucher,
  cancelJournalPaymentVoucher,
  deleteJournalPaymentVoucher,
};

