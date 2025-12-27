# Reconcile Bank Accounts Voucher API - Postman Examples

## Base URL
```
POST http://localhost:2507/api/reconcile-bank-accounts-vouchers
```

**Note:** Make sure to include your authentication token in the headers.

---

## Important Notes

Bank Reconciliation vouchers are used to match bank statement transactions with your accounting records. Key features:
- Match statement transactions with accounting records
- Track outstanding items (deposits, withdrawals, checks)
- Record bank charges, interest, and errors
- Calculate adjusted balance and differences
- Mark as reconciled when balances match

---

## Scenario 1: Basic Bank Reconciliation (JSON)

**Method:** `POST`  
**Content-Type:** `application/json`

### Example: Bank Reconciliation Entry

```json
{
  "voucherDate": "2024-01-31T00:00:00.000Z",
  "bankAccount": "507f1f77bcf86cd799439011",
  "statementDate": "2024-01-31T00:00:00.000Z",
  "statementNumber": "STMT-2024-01",
  "openingBalance": 100000,
  "closingBalance": 150000,
  "bookBalance": 148000,
  "statementBalance": 150000,
  "outstandingDeposits": 5000,
  "outstandingWithdrawals": 2000,
  "outstandingChecks": 1000,
  "bankCharges": 500,
  "interestEarned": 1500,
  "errors": 0,
  "entries": [
    {
      "statementDate": "2024-01-15T00:00:00.000Z",
      "statementDescription": "Payment received",
      "statementAmount": 10000,
      "statementType": "credit",
      "statementReference": "REF001",
      "matchedTransaction": "507f1f77bcf86cd799439020",
      "matchedTransactionModel": "BankPaymentVoucher",
      "matchedTransactionNumber": "BPV-240115-0001",
      "status": "matched",
      "notes": "Matched with payment voucher"
    },
    {
      "statementDate": "2024-01-20T00:00:00.000Z",
      "statementDescription": "Bank charges",
      "statementAmount": 500,
      "statementType": "debit",
      "statementReference": "CHG001",
      "status": "adjusted",
      "adjustment": {
        "type": "bank_charge",
        "amount": 500,
        "description": "Monthly service charge"
      },
      "notes": "Bank service charge"
    }
  ],
  "currency": "507f1f77bcf86cd799439014",
  "currencyExchangeRate": 1,
  "description": "January 2024 bank reconciliation",
  "status": "draft"
}
```

---

## Scenario 2: Minimal Required Fields

**Method:** `POST`  
**Content-Type:** `application/json`

```json
{
  "bankAccount": "507f1f77bcf86cd799439011",
  "statementDate": "2024-01-31T00:00:00.000Z",
  "openingBalance": 100000,
  "closingBalance": 150000,
  "bookBalance": 148000,
  "statementBalance": 150000
}
```

---

## Scenario 3: With File Upload (Bank Statement)

**Method:** `POST`  
**Content-Type:** `multipart/form-data`

### Postman Setup:
1. Select **Body** tab
2. Choose **form-data**
3. Add the following fields:

| Key | Type | Value |
|-----|------|-------|
| `bankAccount` | Text | `507f1f77bcf86cd799439011` |
| `statementDate` | Text | `2024-01-31T00:00:00.000Z` |
| `statementNumber` | Text | `STMT-2024-01` |
| `openingBalance` | Text | `100000` |
| `closingBalance` | Text | `150000` |
| `bookBalance` | Text | `148000` |
| `statementBalance` | Text | `150000` |
| `description` | Text | `January 2024 bank reconciliation` |
| `attachment` | File | [Select Bank Statement PDF/Image] |

---

## Scenario 4: With Reconciliation Entries

**Method:** `POST`  
**Content-Type:** `application/json`

```json
{
  "bankAccount": "507f1f77bcf86cd799439011",
  "statementDate": "2024-01-31T00:00:00.000Z",
  "statementNumber": "STMT-2024-01",
  "openingBalance": 100000,
  "closingBalance": 150000,
  "bookBalance": 148000,
  "statementBalance": 150000,
  "outstandingDeposits": 5000,
  "outstandingWithdrawals": 2000,
  "outstandingChecks": 1000,
  "bankCharges": 500,
  "interestEarned": 1500,
  "entries": [
    {
      "statementDate": "2024-01-10T00:00:00.000Z",
      "statementDescription": "Deposit - Customer Payment",
      "statementAmount": 50000,
      "statementType": "credit",
      "statementReference": "DEP001",
      "matchedTransaction": "507f1f77bcf86cd799439021",
      "matchedTransactionModel": "Payment",
      "matchedTransactionNumber": "PAY-001",
      "status": "matched"
    },
    {
      "statementDate": "2024-01-15T00:00:00.000Z",
      "statementDescription": "Withdrawal - Supplier Payment",
      "statementAmount": 30000,
      "statementType": "debit",
      "statementReference": "WD001",
      "matchedTransaction": "507f1f77bcf86cd799439022",
      "matchedTransactionModel": "BankPaymentVoucher",
      "matchedTransactionNumber": "BPV-001",
      "status": "matched"
    },
    {
      "statementDate": "2024-01-20T00:00:00.000Z",
      "statementDescription": "Interest Earned",
      "statementAmount": 1500,
      "statementType": "credit",
      "statementReference": "INT001",
      "status": "adjusted",
      "adjustment": {
        "type": "interest",
        "amount": 1500,
        "description": "Monthly interest"
      }
    },
    {
      "statementDate": "2024-01-25T00:00:00.000Z",
      "statementDescription": "Service Charge",
      "statementAmount": 500,
      "statementType": "debit",
      "statementReference": "CHG001",
      "status": "adjusted",
      "adjustment": {
        "type": "bank_charge",
        "amount": 500,
        "description": "Monthly service charge"
      }
    }
  ],
  "description": "January 2024 bank reconciliation",
  "status": "draft"
}
```

---

## Field Descriptions

### Required Fields:
- `bankAccount`: MongoDB ObjectId - Bank account to reconcile (required)
- `statementDate`: ISO date string - Date of bank statement (required)
- `openingBalance`: Number - Opening balance from statement (required)
- `closingBalance`: Number - Closing balance from statement (required)
- `bookBalance`: Number - Balance in your books (required)
- `statementBalance`: Number - Balance from bank statement (required)

### Optional Fields:
- `voucherDate`: ISO date string
- `voucherNumber`: String (auto-generated if not provided)
- `statementNumber`: String - Bank statement number
- `entries`: Array of reconciliation entry objects
  - `statementDate`: Date - Transaction date from statement
  - `statementDescription`: String - Transaction description
  - `statementAmount`: Number - Transaction amount
  - `statementType`: "debit" | "credit"
  - `statementReference`: String - Reference number from statement
  - `matchedTransaction`: MongoDB ObjectId - Matched accounting transaction
  - `matchedTransactionModel`: "BankPaymentVoucher" | "CashPaymentVoucher" | "JournalPaymentVoucher" | "Payment" | "SupplierPayment"
  - `matchedTransactionNumber`: String - Transaction number
  - `status`: "matched" | "unmatched" | "adjusted"
  - `adjustment`: Object with type, amount, description
  - `notes`: String
- `outstandingDeposits`: Number - Outstanding deposits not yet cleared
- `outstandingWithdrawals`: Number - Outstanding withdrawals not yet cleared
- `outstandingChecks`: Number - Outstanding checks not yet cleared
- `bankCharges`: Number - Bank charges
- `interestEarned`: Number - Interest earned
- `errors`: Number - Accounting errors
- `currency`: MongoDB ObjectId
- `currencyExchangeRate`: Number (default: 1)
- `referenceNumber`: String
- `description`: String
- `notes`: String
- `status`: "draft" | "pending" | "approved" | "completed" | "cancelled" | "rejected" (default: "draft")
- `reconciliationStatus`: "pending" | "in_progress" | "reconciled" | "discrepancy" | "cancelled" (default: "pending")
- `attachments`: Array of objects with `url`, `name`, `type` OR file upload via `attachment` field

---

## Update Voucher

**Method:** `PUT`  
**URL:** `http://localhost:2507/api/reconcile-bank-accounts-vouchers/:id`

Same body format as create, but all fields are optional.

---

## Other Endpoints

### Reconcile Voucher (Mark as Reconciled)
**Method:** `PUT`  
**URL:** `http://localhost:2507/api/reconcile-bank-accounts-vouchers/:id/reconcile`  
**Body:** None required

**Note:** This endpoint calculates if balances match and marks as reconciled if difference is < 0.01.

### Approve Voucher
**Method:** `PUT`  
**URL:** `http://localhost:2507/api/reconcile-bank-accounts-vouchers/:id/approve`  
**Body:** None required

### Reject Voucher
**Method:** `PUT`  
**URL:** `http://localhost:2507/api/reconcile-bank-accounts-vouchers/:id/reject`  
**Body:**
```json
{
  "rejectionReason": "Discrepancies found"
}
```

### Complete Voucher
**Method:** `PUT`  
**URL:** `http://localhost:2507/api/reconcile-bank-accounts-vouchers/:id/complete`  
**Body:** None required

### Cancel Voucher
**Method:** `PUT`  
**URL:** `http://localhost:2507/api/reconcile-bank-accounts-vouchers/:id/cancel`  
**Body:** None required

### Get Vouchers by Bank Account
**Method:** `GET`  
**URL:** `http://localhost:2507/api/reconcile-bank-accounts-vouchers/bank-account/:bankAccountId`  
**Query Parameters:**
- `page` - Page number
- `limit` - Items per page
- `startDate` - Start date filter
- `endDate` - End date filter
- `status` - Status filter
- `reconciliationStatus` - Reconciliation status filter

---

## Headers Required

All requests need authentication:
```
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json (for JSON requests)
```

---

## Quick Copy-Paste JSON Templates

### Template 1: Basic Reconciliation
```json
{
  "bankAccount": "REPLACE_WITH_BANK_ACCOUNT_ID",
  "statementDate": "2024-01-31T00:00:00.000Z",
  "statementNumber": "STMT-2024-01",
  "openingBalance": 100000,
  "closingBalance": 150000,
  "bookBalance": 148000,
  "statementBalance": 150000,
  "outstandingDeposits": 5000,
  "outstandingWithdrawals": 2000,
  "outstandingChecks": 1000,
  "bankCharges": 500,
  "interestEarned": 1500,
  "description": "Bank reconciliation",
  "status": "draft"
}
```

### Template 2: With Entries
```json
{
  "bankAccount": "REPLACE_WITH_BANK_ACCOUNT_ID",
  "statementDate": "2024-01-31T00:00:00.000Z",
  "openingBalance": 100000,
  "closingBalance": 150000,
  "bookBalance": 148000,
  "statementBalance": 150000,
  "entries": [
    {
      "statementDate": "2024-01-15T00:00:00.000Z",
      "statementDescription": "Transaction description",
      "statementAmount": 10000,
      "statementType": "credit",
      "statementReference": "REF001",
      "status": "unmatched"
    }
  ],
  "description": "Bank reconciliation with entries",
  "status": "draft"
}
```

---

## Reconciliation Status Values

- `pending` - Initial state, not yet started
- `in_progress` - Reconciliation in progress
- `reconciled` - Successfully reconciled (balances match)
- `discrepancy` - Reconciled but with differences
- `cancelled` - Cancelled reconciliation

---

## Voucher Number Format

Auto-generated voucher numbers follow this format:
- `RBV-YYMMDD-0001` (Reconcile Bank Voucher)

Example: `RBV-240131-0001` (Reconciliation voucher created on Jan 31, 2024)

---

## Refer Code Format

Auto-generated refer codes follow this format:
- `RBV-0001`, `RBV-0002`, etc.

---

## Reconciliation Calculation

The system automatically calculates:
- **Adjusted Balance** = Book Balance + Outstanding Deposits - Outstanding Withdrawals - Outstanding Checks + Interest Earned - Bank Charges - Errors
- **Difference** = |Statement Balance - Adjusted Balance|
- If difference < 0.01, status is set to "reconciled", otherwise "discrepancy"

