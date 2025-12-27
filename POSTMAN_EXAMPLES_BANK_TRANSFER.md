# Bank Account Transfer Voucher API - Postman Examples

## Base URL
```
POST http://localhost:2507/api/bank-account-transfer-vouchers
```

**Note:** Make sure to include your authentication token in the headers.

---

## Important Notes

Bank Account Transfer Vouchers are used to transfer funds between bank accounts. Key features:
- Transfer funds from one bank account to another
- Track transfer status (draft, pending, initiated, in_transit, completed, failed, cancelled)
- Support multiple transfer methods (wire transfer, online transfer, RTGS, NEFT, IMPS, SWIFT, ACH)
- Track transfer fees and total amount
- Link to related transactions (purchases, sales, payments)
- Approval workflow
- File attachment support

---

## Scenario 1: Basic Bank Account Transfer (JSON)

**Method:** `POST`  
**Content-Type:** `application/json`

### Example: Transfer Between Bank Accounts

```json
{
  "voucherDate": "2024-01-15T00:00:00.000Z",
  "fromBankAccount": "507f1f77bcf86cd799439011",
  "toBankAccount": "507f1f77bcf86cd799439012",
  "amount": 50000,
  "currency": "507f1f77bcf86cd799439014",
  "currencyExchangeRate": 1,
  "transferMethod": "online_transfer",
  "transferFee": 50,
  "referenceNumber": "TRF-2024-001",
  "purpose": "Fund transfer for operations",
  "description": "Transfer from main account to operations account",
  "status": "draft"
}
```

---

## Scenario 2: Wire Transfer with All Fields

**Method:** `POST`  
**Content-Type:** `application/json`

```json
{
  "voucherDate": "2024-01-15T00:00:00.000Z",
  "fromBankAccount": "507f1f77bcf86cd799439011",
  "toBankAccount": "507f1f77bcf86cd799439012",
  "amount": 100000,
  "currency": "507f1f77bcf86cd799439014",
  "currencyExchangeRate": 1,
  "transferMethod": "wire_transfer",
  "transferFee": 500,
  "referenceNumber": "WIRE-2024-001",
  "fromBankTransactionId": "BANK-TXN-001",
  "toBankTransactionId": "BANK-TXN-002",
  "purpose": "International wire transfer",
  "description": "Wire transfer for international payment",
  "notes": "Urgent transfer required",
  "relatedPurchase": "507f1f77bcf86cd799439020",
  "status": "draft"
}
```

---

## Scenario 3: With File Upload (Transfer Receipt)

**Method:** `POST`  
**Content-Type:** `multipart/form-data`

### Postman Setup:
1. Select **Body** tab
2. Choose **form-data**
3. Add the following fields:

| Key | Type | Value |
|-----|------|-------|
| `fromBankAccount` | Text | `507f1f77bcf86cd799439011` |
| `toBankAccount` | Text | `507f1f77bcf86cd799439012` |
| `amount` | Text | `50000` |
| `transferMethod` | Text | `online_transfer` |
| `transferFee` | Text | `50` |
| `purpose` | Text | `Fund transfer` |
| `description` | Text | `Transfer between accounts` |
| `status` | Text | `draft` |
| `attachment` | File | [Select Transfer Receipt PDF/Image] |

---

## Scenario 4: RTGS Transfer

**Method:** `POST`  
**Content-Type:** `application/json`

```json
{
  "fromBankAccount": "507f1f77bcf86cd799439011",
  "toBankAccount": "507f1f77bcf86cd799439012",
  "amount": 500000,
  "transferMethod": "rtgs",
  "transferFee": 25,
  "referenceNumber": "RTGS-2024-001",
  "purpose": "RTGS transfer for large payment",
  "description": "RTGS transfer above 2 lakhs",
  "status": "draft"
}
```

---

## Field Descriptions

### Required Fields:
- `fromBankAccount`: MongoDB ObjectId - Source bank account (required)
- `toBankAccount`: MongoDB ObjectId - Destination bank account (required)
- `amount`: Number - Transfer amount (required, min: 0)

### Optional Fields:
- `voucherDate`: ISO date string
- `voucherNumber`: String (auto-generated if not provided)
- `currency`: MongoDB ObjectId
- `currencyExchangeRate`: Number (default: 1)
- `transferMethod`: "wire_transfer" | "online_transfer" | "rtgs" | "neft" | "imps" | "swift" | "ach" | "other" (default: "online_transfer")
- `transferFee`: Number (default: 0, min: 0)
- `totalAmount`: Number (auto-calculated: amount + transferFee)
- `transactionId`: String (auto-generated if not provided)
- `referenceNumber`: String
- `fromBankTransactionId`: String - Transaction ID from source bank
- `toBankTransactionId`: String - Transaction ID from destination bank
- `purpose`: String - Purpose of transfer
- `description`: String
- `notes`: String
- `status`: "draft" | "pending" | "initiated" | "in_transit" | "completed" | "failed" | "cancelled" | "rejected" (default: "draft")
- `relatedPurchase`: MongoDB ObjectId
- `relatedSale`: MongoDB ObjectId
- `relatedPayment`: MongoDB ObjectId
- `relatedSupplierPayment`: MongoDB ObjectId
- `relatedBankPaymentVoucher`: MongoDB ObjectId
- `attachments`: Array of objects with `url`, `name`, `type` OR file upload via `attachment` field

---

## Transfer Methods

- `wire_transfer` - Wire transfer
- `online_transfer` - Online banking transfer
- `rtgs` - Real Time Gross Settlement (RTGS)
- `neft` - National Electronic Funds Transfer (NEFT)
- `imps` - Immediate Payment Service (IMPS)
- `swift` - SWIFT international transfer
- `ach` - Automated Clearing House (ACH)
- `other` - Other transfer method

---

## Update Voucher

**Method:** `PUT`  
**URL:** `http://localhost:2507/api/bank-account-transfer-vouchers/:id`

Same body format as create, but all fields are optional. **Note:** Cannot update if status is `completed` or `cancelled`.

---

## Other Endpoints

### Initiate Transfer
**Method:** `PUT`  
**URL:** `http://localhost:2507/api/bank-account-transfer-vouchers/:id/initiate`  
**Body:** None required

**Note:** Changes status to "initiated" and sets `initiatedAt` timestamp.

### Complete Transfer
**Method:** `PUT`  
**URL:** `http://localhost:2507/api/bank-account-transfer-vouchers/:id/complete`  
**Body:**
```json
{
  "fromBankTransactionId": "BANK-TXN-001",
  "toBankTransactionId": "BANK-TXN-002"
}
```

**Note:** Changes status to "completed" and sets `completedAt` timestamp.

### Mark Transfer as Failed
**Method:** `PUT`  
**URL:** `http://localhost:2507/api/bank-account-transfer-vouchers/:id/fail`  
**Body:**
```json
{
  "reason": "Insufficient funds"
}
```

**Note:** Changes status to "failed" and records failure details.

### Approve Voucher
**Method:** `PUT`  
**URL:** `http://localhost:2507/api/bank-account-transfer-vouchers/:id/approve`  
**Body:** None required

**Note:** Changes status to "pending" and records approval.

### Reject Voucher
**Method:** `PUT`  
**URL:** `http://localhost:2507/api/bank-account-transfer-vouchers/:id/reject`  
**Body:**
```json
{
  "rejectionReason": "Insufficient balance"
}
```

### Cancel Voucher
**Method:** `PUT`  
**URL:** `http://localhost:2507/api/bank-account-transfer-vouchers/:id/cancel`  
**Body:** None required

**Note:** Cannot cancel if status is "completed".

### Get Transfers by Bank Account
**Method:** `GET`  
**URL:** `http://localhost:2507/api/bank-account-transfer-vouchers/bank-account/:bankAccountId`  
**Query Parameters:**
- `page` - Page number
- `limit` - Items per page
- `startDate` - Start date filter
- `endDate` - End date filter
- `status` - Status filter
- `type` - "from" | "to" | "all" (default: "all") - Filter by transfer direction

---

## Headers Required

All requests need authentication:
```
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json (for JSON requests)
```

---

## Quick Copy-Paste JSON Templates

### Template 1: Basic Transfer
```json
{
  "fromBankAccount": "REPLACE_WITH_FROM_BANK_ACCOUNT_ID",
  "toBankAccount": "REPLACE_WITH_TO_BANK_ACCOUNT_ID",
  "amount": 50000,
  "transferMethod": "online_transfer",
  "transferFee": 50,
  "purpose": "Fund transfer",
  "description": "Transfer between accounts",
  "status": "draft"
}
```

### Template 2: Wire Transfer
```json
{
  "fromBankAccount": "REPLACE_WITH_FROM_BANK_ACCOUNT_ID",
  "toBankAccount": "REPLACE_WITH_TO_BANK_ACCOUNT_ID",
  "amount": 100000,
  "transferMethod": "wire_transfer",
  "transferFee": 500,
  "referenceNumber": "WIRE-001",
  "purpose": "International wire transfer",
  "description": "Wire transfer for payment",
  "status": "draft"
}
```

### Template 3: RTGS Transfer
```json
{
  "fromBankAccount": "REPLACE_WITH_FROM_BANK_ACCOUNT_ID",
  "toBankAccount": "REPLACE_WITH_TO_BANK_ACCOUNT_ID",
  "amount": 500000,
  "transferMethod": "rtgs",
  "transferFee": 25,
  "referenceNumber": "RTGS-001",
  "purpose": "RTGS transfer",
  "description": "Large amount transfer via RTGS",
  "status": "draft"
}
```

---

## Status Workflow

1. **draft** → Initial state
2. **pending** → Approved, ready to initiate
3. **initiated** → Transfer initiated
4. **in_transit** → Transfer in progress
5. **completed** → Transfer completed successfully
6. **failed** → Transfer failed
7. **cancelled** → Transfer cancelled
8. **rejected** → Rejected during approval

---

## Voucher Number Format

Auto-generated voucher numbers follow this format:
- `BTV-YYMMDD-0001` (Bank Transfer Voucher)

Example: `BTV-240115-0001` (Transfer voucher created on Jan 15, 2024)

---

## Refer Code Format

Auto-generated refer codes follow this format:
- `BTV-0001`, `BTV-0002`, etc.

---

## Important Validations

1. **Different Accounts**: Source and destination bank accounts must be different
2. **Amount**: Must be greater than 0
3. **Transfer Fee**: Must be 0 or greater
4. **Total Amount**: Automatically calculated as amount + transferFee
5. **Status Restrictions**: 
   - Cannot update if status is "completed" or "cancelled"
   - Cannot cancel if status is "completed"
   - Cannot initiate if status is "completed", "cancelled", or "failed"

---

## Common Use Cases

### 1. Transfer Funds for Purchase Payment
```json
{
  "fromBankAccount": "ACCOUNT_ID_1",
  "toBankAccount": "ACCOUNT_ID_2",
  "amount": 100000,
  "transferMethod": "neft",
  "relatedPurchase": "PURCHASE_ID",
  "purpose": "Payment for purchase",
  "status": "draft"
}
```

### 2. Transfer Funds Between Own Accounts
```json
{
  "fromBankAccount": "ACCOUNT_ID_1",
  "toBankAccount": "ACCOUNT_ID_2",
  "amount": 50000,
  "transferMethod": "online_transfer",
  "purpose": "Internal fund transfer",
  "status": "draft"
}
```

### 3. International Wire Transfer
```json
{
  "fromBankAccount": "ACCOUNT_ID_1",
  "toBankAccount": "ACCOUNT_ID_2",
  "amount": 100000,
  "transferMethod": "swift",
  "transferFee": 1000,
  "currency": "CURRENCY_ID",
  "currencyExchangeRate": 1.2,
  "purpose": "International payment",
  "status": "draft"
}
```

