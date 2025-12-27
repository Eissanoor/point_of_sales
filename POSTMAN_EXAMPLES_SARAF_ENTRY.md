# Saraf Entry Voucher API - Postman Examples

## Base URL
```
POST http://localhost:2507/api/saraf-entry-vouchers
```

**Note:** Make sure to include your authentication token in the headers.

---

## Important Notes

Saraf Entry Vouchers are used for currency exchange transactions (foreign exchange). Key features:
- Exchange currencies (buy, sell, exchange, conversion)
- Track exchange rates (market rate vs actual rate)
- Calculate exchange gain/loss
- Track commission and charges
- Link to bank accounts or cash accounts
- Track saraf (money changer) details
- Approval workflow
- File attachment support

---

## Scenario 1: Basic Currency Exchange (JSON)

**Method:** `POST`  
**Content-Type:** `application/json`

### Example: Currency Exchange Entry

```json
{
  "voucherDate": "2024-01-15T00:00:00.000Z",
  "exchangeType": "exchange",
  "fromCurrency": "507f1f77bcf86cd799439011",
  "fromAmount": 1000,
  "toCurrency": "507f1f77bcf86cd799439012",
  "toAmount": 75000,
  "exchangeRate": 75,
  "marketRate": 74.5,
  "commission": 50,
  "commissionPercentage": 5,
  "purpose": "Currency exchange for business",
  "description": "Exchange USD to INR",
  "status": "draft"
}
```

---

## Scenario 2: Buy Currency with Bank Account

**Method:** `POST`  
**Content-Type:** `application/json`

```json
{
  "voucherDate": "2024-01-15T00:00:00.000Z",
  "exchangeType": "buy",
  "fromCurrency": "507f1f77bcf86cd799439011",
  "fromAmount": 50000,
  "toCurrency": "507f1f77bcf86cd799439012",
  "toAmount": 600,
  "exchangeRate": 83.33,
  "marketRate": 82.5,
  "commission": 250,
  "fromBankAccount": "507f1f77bcf86cd799439020",
  "toBankAccount": "507f1f77bcf86cd799439021",
  "sarafName": "ABC Money Exchange",
  "sarafContact": "+91-1234567890",
  "purpose": "Buy USD for import payment",
  "description": "Buying USD from bank account",
  "status": "draft"
}
```

---

## Scenario 3: Sell Currency with Cash Account

**Method:** `POST`  
**Content-Type:** `application/json`

```json
{
  "voucherDate": "2024-01-15T00:00:00.000Z",
  "exchangeType": "sell",
  "fromCurrency": "507f1f77bcf86cd799439012",
  "fromAmount": 1000,
  "toCurrency": "507f1f77bcf86cd799439011",
  "toAmount": 75000,
  "exchangeRate": 75,
  "marketRate": 75.5,
  "commission": 100,
  "fromCashAccount": "507f1f77bcf86cd799439030",
  "toCashAccount": "507f1f77bcf86cd799439031",
  "sarafName": "XYZ Exchange",
  "sarafContact": "+91-9876543210",
  "purpose": "Sell USD for local currency",
  "description": "Selling USD from cash",
  "status": "draft"
}
```

---

## Scenario 4: With File Upload (Exchange Receipt)

**Method:** `POST`  
**Content-Type:** `multipart/form-data`

### Postman Setup:
1. Select **Body** tab
2. Choose **form-data**
3. Add the following fields:

| Key | Type | Value |
|-----|------|-------|
| `exchangeType` | Text | `exchange` |
| `fromCurrency` | Text | `507f1f77bcf86cd799439011` |
| `fromAmount` | Text | `1000` |
| `toCurrency` | Text | `507f1f77bcf86cd799439012` |
| `toAmount` | Text | `75000` |
| `exchangeRate` | Text | `75` |
| `purpose` | Text | `Currency exchange` |
| `description` | Text | `Exchange USD to INR` |
| `status` | Text | `draft` |
| `attachment` | File | [Select Exchange Receipt PDF/Image] |

---

## Scenario 5: Currency Conversion with Related Transaction

**Method:** `POST`  
**Content-Type:** `application/json`

```json
{
  "voucherDate": "2024-01-15T00:00:00.000Z",
  "exchangeType": "conversion",
  "fromCurrency": "507f1f77bcf86cd799439011",
  "fromAmount": 10000,
  "toCurrency": "507f1f77bcf86cd799439012",
  "toAmount": 750000,
  "exchangeRate": 75,
  "marketRate": 74.8,
  "commission": 500,
  "fromBankAccount": "507f1f77bcf86cd799439020",
  "toBankAccount": "507f1f77bcf86cd799439021",
  "referenceNumber": "EXCH-2024-001",
  "bankTransactionId": "BANK-TXN-001",
  "sarafName": "Global Exchange",
  "sarafContact": "+91-1111111111",
  "purpose": "Currency conversion for purchase",
  "description": "Converting INR to USD for import",
  "relatedPurchase": "507f1f77bcf86cd799439040",
  "status": "draft"
}
```

---

## Field Descriptions

### Required Fields:
- `fromCurrency`: MongoDB ObjectId - Source currency (required)
- `fromAmount`: Number - Amount in source currency (required, min: 0)
- `toCurrency`: MongoDB ObjectId - Destination currency (required)
- `toAmount`: Number - Amount in destination currency (required, min: 0)
- `exchangeRate`: Number - Exchange rate used (required, min: 0)

### Optional Fields:
- `voucherDate`: ISO date string
- `voucherNumber`: String (auto-generated if not provided)
- `exchangeType`: "buy" | "sell" | "exchange" | "conversion" (default: "exchange")
- `marketRate`: Number - Market exchange rate (for gain/loss calculation)
- `commission`: Number - Commission amount (default: 0)
- `commissionPercentage`: Number - Commission percentage (0-100, default: 0)
- `fromBankAccount`: MongoDB ObjectId - Source bank account
- `toBankAccount`: MongoDB ObjectId - Destination bank account
- `fromCashAccount`: MongoDB ObjectId - Source cash account
- `toCashAccount`: MongoDB ObjectId - Destination cash account
- `transactionId`: String (auto-generated if not provided)
- `referenceNumber`: String
- `bankTransactionId`: String - Bank transaction reference
- `sarafName`: String - Money changer/exchange dealer name
- `sarafContact`: String - Money changer contact details
- `purpose`: String - Purpose of exchange
- `description`: String
- `notes`: String
- `status`: "draft" | "pending" | "approved" | "completed" | "cancelled" | "rejected" (default: "draft")
- `relatedPurchase`: MongoDB ObjectId
- `relatedSale`: MongoDB ObjectId
- `relatedPayment`: MongoDB ObjectId
- `relatedSupplierPayment`: MongoDB ObjectId
- `relatedBankPaymentVoucher`: MongoDB ObjectId
- `relatedCashPaymentVoucher`: MongoDB ObjectId
- `attachments`: Array of objects with `url`, `name`, `type` OR file upload via `attachment` field

---

## Exchange Types

- `buy` - Buying foreign currency
- `sell` - Selling foreign currency
- `exchange` - General currency exchange
- `conversion` - Currency conversion

---

## Exchange Gain/Loss Calculation

The system automatically calculates exchange gain/loss when `marketRate` is provided:
- **Exchange Gain** = (Actual Rate - Market Rate) × From Amount (if positive)
- **Exchange Loss** = (Market Rate - Actual Rate) × From Amount (if negative)

---

## Update Voucher

**Method:** `PUT`  
**URL:** `http://localhost:2507/api/saraf-entry-vouchers/:id`

Same body format as create, but all fields are optional. **Note:** Cannot update if status is `completed` or `cancelled`.

---

## Other Endpoints

### Approve Voucher
**Method:** `PUT`  
**URL:** `http://localhost:2507/api/saraf-entry-vouchers/:id/approve`  
**Body:** None required

### Reject Voucher
**Method:** `PUT`  
**URL:** `http://localhost:2507/api/saraf-entry-vouchers/:id/reject`  
**Body:**
```json
{
  "rejectionReason": "Incorrect exchange rate"
}
```

### Complete Voucher
**Method:** `PUT`  
**URL:** `http://localhost:2507/api/saraf-entry-vouchers/:id/complete`  
**Body:** None required

**Note:** Marks the exchange as completed and records completion details.

### Cancel Voucher
**Method:** `PUT`  
**URL:** `http://localhost:2507/api/saraf-entry-vouchers/:id/cancel`  
**Body:** None required

**Note:** Cannot cancel if status is "completed".

### Get Vouchers by Currency
**Method:** `GET`  
**URL:** `http://localhost:2507/api/saraf-entry-vouchers/currency/:currencyId`  
**Query Parameters:**
- `page` - Page number
- `limit` - Items per page
- `startDate` - Start date filter
- `endDate` - End date filter
- `status` - Status filter
- `type` - "from" | "to" | "all" (default: "all") - Filter by currency direction

---

## Headers Required

All requests need authentication:
```
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json (for JSON requests)
```

---

## Quick Copy-Paste JSON Templates

### Template 1: Basic Exchange
```json
{
  "exchangeType": "exchange",
  "fromCurrency": "REPLACE_WITH_FROM_CURRENCY_ID",
  "fromAmount": 1000,
  "toCurrency": "REPLACE_WITH_TO_CURRENCY_ID",
  "toAmount": 75000,
  "exchangeRate": 75,
  "purpose": "Currency exchange",
  "description": "Exchange transaction",
  "status": "draft"
}
```

### Template 2: Buy Currency
```json
{
  "exchangeType": "buy",
  "fromCurrency": "REPLACE_WITH_LOCAL_CURRENCY_ID",
  "fromAmount": 50000,
  "toCurrency": "REPLACE_WITH_FOREIGN_CURRENCY_ID",
  "toAmount": 600,
  "exchangeRate": 83.33,
  "marketRate": 82.5,
  "commission": 250,
  "fromBankAccount": "REPLACE_WITH_BANK_ACCOUNT_ID",
  "sarafName": "Exchange Dealer Name",
  "purpose": "Buy foreign currency",
  "status": "draft"
}
```

### Template 3: Sell Currency
```json
{
  "exchangeType": "sell",
  "fromCurrency": "REPLACE_WITH_FOREIGN_CURRENCY_ID",
  "fromAmount": 1000,
  "toCurrency": "REPLACE_WITH_LOCAL_CURRENCY_ID",
  "toAmount": 75000,
  "exchangeRate": 75,
  "marketRate": 75.5,
  "commission": 100,
  "toBankAccount": "REPLACE_WITH_BANK_ACCOUNT_ID",
  "sarafName": "Exchange Dealer Name",
  "purpose": "Sell foreign currency",
  "status": "draft"
}
```

---

## Status Workflow

1. **draft** → Initial state
2. **pending** → Submitted for approval
3. **approved** → Approved by authorized user
4. **completed** → Exchange completed
5. **cancelled** → Cancelled before completion
6. **rejected** → Rejected during approval

---

## Voucher Number Format

Auto-generated voucher numbers follow this format:
- `SEV-YYMMDD-0001` (Saraf Entry Voucher)

Example: `SEV-240115-0001` (Saraf entry voucher created on Jan 15, 2024)

---

## Refer Code Format

Auto-generated refer codes follow this format:
- `SEV-0001`, `SEV-0002`, etc.

---

## Important Validations

1. **Different Currencies**: Source and destination currencies must be different
2. **Amounts**: Both fromAmount and toAmount must be greater than 0
3. **Exchange Rate**: Must be greater than 0
4. **Commission**: Must be 0 or greater
5. **Commission Percentage**: Must be between 0 and 100
6. **Status Restrictions**: 
   - Cannot update if status is "completed" or "cancelled"
   - Cannot cancel if status is "completed"

---

## Common Use Cases

### 1. Exchange for Purchase Payment
```json
{
  "exchangeType": "buy",
  "fromCurrency": "INR_CURRENCY_ID",
  "fromAmount": 100000,
  "toCurrency": "USD_CURRENCY_ID",
  "toAmount": 1200,
  "exchangeRate": 83.33,
  "relatedPurchase": "PURCHASE_ID",
  "purpose": "Exchange for import payment",
  "status": "draft"
}
```

### 2. Exchange from Sale Receipt
```json
{
  "exchangeType": "sell",
  "fromCurrency": "USD_CURRENCY_ID",
  "fromAmount": 5000,
  "toCurrency": "INR_CURRENCY_ID",
  "toAmount": 375000,
  "exchangeRate": 75,
  "relatedSale": "SALE_ID",
  "purpose": "Exchange from export receipt",
  "status": "draft"
}
```

### 3. Currency Conversion Between Accounts
```json
{
  "exchangeType": "conversion",
  "fromCurrency": "USD_CURRENCY_ID",
  "fromAmount": 1000,
  "toCurrency": "EUR_CURRENCY_ID",
  "toAmount": 900,
  "exchangeRate": 0.9,
  "fromBankAccount": "USD_BANK_ACCOUNT_ID",
  "toBankAccount": "EUR_BANK_ACCOUNT_ID",
  "purpose": "Currency conversion",
  "status": "draft"
}
```

---

## Exchange Rate Calculation

The system uses the provided `exchangeRate` to calculate `toAmount`:
- `toAmount = fromAmount × exchangeRate`

If you provide both `fromAmount` and `toAmount`, ensure they match the exchange rate, or the system will use the provided values as-is.

---

## Commission Calculation

If `commissionPercentage` is provided, the system automatically calculates:
- `commission = (fromAmount × commissionPercentage) / 100`

If both `commission` and `commissionPercentage` are provided, the `commission` value takes precedence.

