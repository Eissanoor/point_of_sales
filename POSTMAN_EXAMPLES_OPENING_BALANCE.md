# Opening Balance Voucher API - Postman Examples

## Base URL
```
POST http://localhost:2507/api/opening-balance-vouchers
```

**Note:** Make sure to include your authentication token in the headers.

---

## Important Notes

Opening Balance Vouchers are used to record opening balances for accounts at the start of a financial period. Unlike journal vouchers, opening balance entries:
- **Do NOT require debits to equal credits** (each account can have its own opening balance)
- Each entry must have either debit OR credit (not both, not neither)
- Minimum 1 entry required (can have multiple accounts)

---

## Scenario 1: Basic Opening Balance Entry (JSON)

**Method:** `POST`  
**Content-Type:** `application/json`

### Example: Opening Balance for Multiple Accounts

```json
{
  "voucherDate": "2024-01-01T00:00:00.000Z",
  "financialYear": "2024-2025",
  "periodStartDate": "2024-01-01T00:00:00.000Z",
  "periodEndDate": "2024-12-31T00:00:00.000Z",
  "entries": [
    {
      "account": "507f1f77bcf86cd799439011",
      "accountModel": "BankAccount",
      "accountName": "Main Bank Account",
      "debit": 100000,
      "credit": 0,
      "description": "Opening balance for bank account"
    },
    {
      "account": "507f1f77bcf86cd799439012",
      "accountModel": "CashAccount",
      "accountName": "Main Cash Register",
      "debit": 50000,
      "credit": 0,
      "description": "Opening balance for cash"
    },
    {
      "account": "507f1f77bcf86cd799439013",
      "accountModel": "Liability",
      "accountName": "Accounts Payable",
      "debit": 0,
      "credit": 25000,
      "description": "Opening balance for payables"
    }
  ],
  "currency": "507f1f77bcf86cd799439014",
  "currencyExchangeRate": 1,
  "description": "Opening balances for financial year 2024-2025",
  "status": "draft"
}
```

---

## Scenario 2: Single Account Opening Balance

**Method:** `POST`  
**Content-Type:** `application/json`

```json
{
  "voucherDate": "2024-01-01T00:00:00.000Z",
  "financialYear": "2024-2025",
  "periodStartDate": "2024-01-01T00:00:00.000Z",
  "entries": [
    {
      "account": "507f1f77bcf86cd799439011",
      "accountModel": "BankAccount",
      "accountName": "Main Bank Account",
      "debit": 100000,
      "credit": 0,
      "description": "Opening balance"
    }
  ],
  "description": "Bank account opening balance",
  "status": "draft"
}
```

---

## Scenario 3: With File Upload (Multipart/Form-Data)

**Method:** `POST`  
**Content-Type:** `multipart/form-data`

### Postman Setup:
1. Select **Body** tab
2. Choose **form-data**
3. Add the following fields:

| Key | Type | Value |
|-----|------|-------|
| `voucherDate` | Text | `2024-01-01T00:00:00.000Z` |
| `financialYear` | Text | `2024-2025` |
| `periodStartDate` | Text | `2024-01-01T00:00:00.000Z` |
| `entries` | Text | `[{"account":"507f1f77bcf86cd799439011","accountModel":"BankAccount","accountName":"Main Bank","debit":100000,"credit":0,"description":"Opening balance"}]` |
| `description` | Text | `Opening balances for new financial year` |
| `status` | Text | `draft` |
| `attachment` | File | [Select File] |

**Note:** The `entries` field should be a JSON stringified array.

---

## Scenario 4: With Pre-uploaded Attachments

**Method:** `POST`  
**Content-Type:** `application/json`

```json
{
  "voucherDate": "2024-01-01T00:00:00.000Z",
  "financialYear": "2024-2025",
  "periodStartDate": "2024-01-01T00:00:00.000Z",
  "entries": [
    {
      "account": "507f1f77bcf86cd799439011",
      "accountModel": "BankAccount",
      "accountName": "Main Bank Account",
      "debit": 100000,
      "credit": 0,
      "description": "Opening balance"
    }
  ],
  "description": "Opening balances",
  "attachments": [
    {
      "url": "https://res.cloudinary.com/ddaeyau0r/image/upload/v1766755274/opening-balance-vouchers/file.png",
      "name": "balance-sheet.png",
      "type": "image/png"
    }
  ],
  "status": "draft"
}
```

---

## Field Descriptions

### Required Fields:
- `voucherDate`: ISO date string - Date of the opening balance voucher
- `financialYear`: String - Financial year (e.g., "2024-2025" or "FY2024")
- `periodStartDate`: ISO date string - Start date of the financial period
- `entries`: Array of opening balance entry objects (minimum 1 entry)
  - `account`: MongoDB ObjectId - Account ID (required)
  - `accountModel`: String - Account type (required)
  - `debit`: Number (>= 0) - Debit amount
  - `credit`: Number (>= 0) - Credit amount
  - **Note:** Each entry must have either debit OR credit (not both, not neither)

### Optional Fields:
- `periodEndDate`: ISO date string - End date of the financial period
- `voucherNumber`: String (auto-generated if not provided)
- `currency`: MongoDB ObjectId
- `currencyExchangeRate`: Number (default: 1)
- `referenceNumber`: String
- `transactionId`: String (auto-generated if not provided)
- `description`: String
- `notes`: String
- `status`: `"draft"` | `"pending"` | `"approved"` | `"posted"` | `"cancelled"` | `"rejected"` (default: "draft")
- `attachments`: Array of objects with `url`, `name`, `type` OR file upload via `attachment` field

---

## Account Model Types

The `accountModel` field can be one of:
- `"BankAccount"` - Bank accounts
- `"CashAccount"` - Cash accounts
- `"Supplier"` - Supplier accounts
- `"Customer"` - Customer accounts
- `"Expense"` - Expense accounts
- `"Income"` - Income accounts
- `"Asset"` - Asset accounts
- `"Liability"` - Liability accounts
- `"Equity"` - Equity accounts

---

## Update Voucher

**Method:** `PUT`  
**URL:** `http://localhost:2507/api/opening-balance-vouchers/:id`

Same body format as create, but all fields are optional. **Note:** Cannot update if status is `posted` or `cancelled`.

---

## Other Endpoints

### Approve Voucher
**Method:** `PUT`  
**URL:** `http://localhost:2507/api/opening-balance-vouchers/:id/approve`  
**Body:** None required

### Reject Voucher
**Method:** `PUT`  
**URL:** `http://localhost:2507/api/opening-balance-vouchers/:id/reject`  
**Body:**
```json
{
  "rejectionReason": "Incorrect opening balances"
}
```

### Post Voucher (Mark as Posted to Ledger)
**Method:** `PUT`  
**URL:** `http://localhost:2507/api/opening-balance-vouchers/:id/post`  
**Body:** None required

**Note:** Posting marks the voucher as finalized. Once posted, it cannot be updated or cancelled.

### Cancel Voucher
**Method:** `PUT`  
**URL:** `http://localhost:2507/api/opening-balance-vouchers/:id/cancel`  
**Body:** None required

---

## Headers Required

All requests need authentication:
```
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json (for JSON requests)
```

For file uploads, Postman will automatically set:
```
Content-Type: multipart/form-data
```

---

## Quick Copy-Paste JSON Templates

### Template 1: Basic Opening Balance
```json
{
  "voucherDate": "2024-01-01T00:00:00.000Z",
  "financialYear": "2024-2025",
  "periodStartDate": "2024-01-01T00:00:00.000Z",
  "entries": [
    {
      "account": "REPLACE_WITH_ACCOUNT_ID",
      "accountModel": "BankAccount",
      "accountName": "Account Name",
      "debit": 100000,
      "credit": 0,
      "description": "Opening balance"
    }
  ],
  "description": "Opening balances for new financial year",
  "status": "draft"
}
```

### Template 2: Multiple Accounts
```json
{
  "voucherDate": "2024-01-01T00:00:00.000Z",
  "financialYear": "2024-2025",
  "periodStartDate": "2024-01-01T00:00:00.000Z",
  "periodEndDate": "2024-12-31T00:00:00.000Z",
  "entries": [
    {
      "account": "REPLACE_WITH_BANK_ACCOUNT_ID",
      "accountModel": "BankAccount",
      "accountName": "Main Bank",
      "debit": 100000,
      "credit": 0,
      "description": "Bank opening balance"
    },
    {
      "account": "REPLACE_WITH_CASH_ACCOUNT_ID",
      "accountModel": "CashAccount",
      "accountName": "Main Cash",
      "debit": 50000,
      "credit": 0,
      "description": "Cash opening balance"
    },
    {
      "account": "REPLACE_WITH_LIABILITY_ACCOUNT_ID",
      "accountModel": "Liability",
      "accountName": "Accounts Payable",
      "debit": 0,
      "credit": 25000,
      "description": "Payables opening balance"
    }
  ],
  "currency": "REPLACE_WITH_CURRENCY_ID",
  "description": "Opening balances for financial year 2024-2025",
  "status": "draft"
}
```

---

## Common Issues & Solutions

1. **"Opening balance voucher must have at least 1 entry" error**: 
   - Ensure entries array has at least 1 entry
   - Check that entries is a valid JSON array

2. **"An entry must have either a debit or credit amount" error**:
   - Each entry must have either debit OR credit (not both, not neither)
   - At least one must be greater than 0

3. **"An entry cannot have both debit and credit amounts" error**:
   - Set one to 0 if you only want debit or credit

4. **"Cannot update posted or cancelled voucher" error**:
   - Posted vouchers cannot be modified
   - Cancel the voucher first if needed (if not posted)

---

## Voucher Number Format

Auto-generated voucher numbers follow this format:
- `OBV-YYMMDD-0001` (Opening Balance Voucher)

Example: `OBV-240101-0001` (Opening balance voucher created on Jan 1, 2024)

---

## Refer Code Format

Auto-generated refer codes follow this format:
- `OBV-0001`, `OBV-0002`, etc.

---

## Status Workflow

1. **draft** → Initial state
2. **pending** → Submitted for approval
3. **approved** → Approved by authorized user
4. **posted** → Posted to general ledger (final state, cannot be modified)
5. **rejected** → Rejected during approval
6. **cancelled** → Cancelled before posting

---

## Key Differences from Journal Vouchers

1. **No Balance Requirement**: Opening balance vouchers do NOT require total debits to equal total credits
2. **Single Entry Allowed**: Can have just 1 entry (journal vouchers need minimum 2)
3. **Financial Year**: Requires financialYear and periodStartDate fields
4. **Purpose**: Specifically for recording opening balances at the start of a period

