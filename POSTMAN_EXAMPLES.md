# Bank Payment Voucher API - Postman Examples

## Base URL
```
POST http://localhost:YOUR_PORT/api/bank-payment-vouchers
```

**Note:** Make sure to include your authentication token in the headers.

---

## Scenario 1: Create Voucher with File Upload (Multipart/Form-Data)

**Method:** `POST`  
**Content-Type:** `multipart/form-data`

### Postman Setup:
1. Select **Body** tab
2. Choose **form-data**
3. Add the following fields:

| Key | Type | Value |
|-----|------|-------|
| `voucherType` | Text | `payment` |
| `bankAccount` | Text | `507f1f77bcf86cd799439011` (Your bank account ID) |
| `payeeType` | Text | `supplier` |
| `payee` | Text | `507f1f77bcf86cd799439012` (Optional - Supplier/Customer/Employee ID) |
| `payeeName` | Text | `John Doe` (Required if payee is not provided) |
| `amount` | Text | `5000` |
| `currency` | Text | `507f1f77bcf86cd799439013` (Optional - Currency ID) |
| `currencyExchangeRate` | Text | `1` (Optional, default: 1) |
| `paymentMethod` | Text | `bank_transfer` |
| `checkNumber` | Text | `CHK123456` (Optional) |
| `referenceNumber` | Text | `REF789` (Optional) |
| `description` | Text | `Payment for services` (Optional) |
| `notes` | Text | `Additional notes here` (Optional) |
| `status` | Text | `draft` (Optional, default: draft) |
| `attachment` | File | Select a file (jpeg, jpg, png, webp, pdf, doc, docx, xls, xlsx) |

### Example cURL:
```bash
curl --location 'http://localhost:3000/api/bank-payment-vouchers' \
--header 'Authorization: Bearer YOUR_TOKEN' \
--form 'voucherType="payment"' \
--form 'bankAccount="507f1f77bcf86cd799439011"' \
--form 'payeeType="supplier"' \
--form 'payeeName="John Doe"' \
--form 'amount="5000"' \
--form 'paymentMethod="bank_transfer"' \
--form 'description="Payment for services"' \
--form 'attachment=@"/path/to/your/file.png"'
```

---

## Scenario 2: Create Voucher with Attachments Already Uploaded (JSON)

**Method:** `POST`  
**Content-Type:** `application/json`

### Postman Setup:
1. Select **Body** tab
2. Choose **raw**
3. Select **JSON** from dropdown
4. Use this JSON:

```json
{
  "voucherType": "payment",
  "bankAccount": "507f1f77bcf86cd799439011",
  "payeeType": "supplier",
  "payee": "507f1f77bcf86cd799439012",
  "payeeName": "John Doe",
  "amount": 5000,
  "currency": "507f1f77bcf86cd799439013",
  "currencyExchangeRate": 1,
  "paymentMethod": "bank_transfer",
  "checkNumber": "CHK123456",
  "referenceNumber": "REF789",
  "description": "Payment for services",
  "notes": "Additional notes here",
  "status": "draft",
  "voucherDate": "2024-01-15T00:00:00.000Z",
  "attachments": [
    {
      "url": "https://res.cloudinary.com/ddaeyau0r/image/upload/v1766755274/bank-payment-vouchers/lfzt4ym49eva1nhhmquz.png",
      "name": "invoice.png",
      "type": "image/png"
    },
    {
      "url": "https://res.cloudinary.com/ddaeyau0r/image/upload/v1766755274/bank-payment-vouchers/another-file.pdf",
      "name": "receipt.pdf",
      "type": "application/pdf"
    }
  ]
}
```

### Example cURL:
```bash
curl --location 'http://localhost:3000/api/bank-payment-vouchers' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer YOUR_TOKEN' \
--data '{
  "voucherType": "payment",
  "bankAccount": "507f1f77bcf86cd799439011",
  "payeeType": "supplier",
  "payeeName": "John Doe",
  "amount": 5000,
  "paymentMethod": "bank_transfer",
  "attachments": [
    {
      "url": "https://res.cloudinary.com/ddaeyau0r/image/upload/v1766755274/bank-payment-vouchers/lfzt4ym49eva1nhhmquz.png",
      "name": "invoice.png",
      "type": "image/png"
    }
  ]
}'
```

---

## Scenario 3: Create Voucher with Stringified Attachments (Multipart/Form-Data)

**Method:** `POST`  
**Content-Type:** `multipart/form-data`

### Postman Setup:
1. Select **Body** tab
2. Choose **form-data**
3. Add the following fields:

| Key | Type | Value |
|-----|------|-------|
| `voucherType` | Text | `payment` |
| `bankAccount` | Text | `507f1f77bcf86cd799439011` |
| `payeeType` | Text | `supplier` |
| `payeeName` | Text | `John Doe` |
| `amount` | Text | `5000` |
| `paymentMethod` | Text | `bank_transfer` |
| `attachments` | Text | `[{"url":"https://res.cloudinary.com/ddaeyau0r/image/upload/v1766755274/bank-payment-vouchers/lfzt4ym49eva1nhhmquz.png","name":"invoice.png","type":"image/png"}]` |

**Note:** The `attachments` field should be a valid JSON string (stringified array).

---

## Scenario 4: Minimal Required Fields Only

**Method:** `POST`  
**Content-Type:** `application/json`

```json
{
  "voucherType": "payment",
  "bankAccount": "507f1f77bcf86cd799439011",
  "payeeType": "other",
  "payeeName": "John Doe",
  "amount": 5000,
  "paymentMethod": "bank_transfer"
}
```

---

## Field Descriptions

### Required Fields:
- `voucherType`: `"payment"` | `"receipt"` | `"transfer"`
- `bankAccount`: MongoDB ObjectId of the bank account
- `payeeType`: `"supplier"` | `"customer"` | `"employee"` | `"other"`
- `payeeName`: Name of the payee (required if `payee` is not provided)
- `amount`: Number (must be >= 0)
- `paymentMethod`: `"bank_transfer"` | `"check"` | `"online_payment"` | `"wire_transfer"` | `"dd"` | `"other"`

### Optional Fields:
- `voucherDate`: ISO date string (e.g., "2024-01-15T00:00:00.000Z")
- `voucherNumber`: String (auto-generated if not provided)
- `payee`: MongoDB ObjectId (Supplier/Customer/Employee ID)
- `currency`: MongoDB ObjectId
- `currencyExchangeRate`: Number (default: 1)
- `checkNumber`: String
- `transactionId`: String (auto-generated if not provided)
- `referenceNumber`: String
- `relatedPurchase`: MongoDB ObjectId
- `relatedSale`: MongoDB ObjectId
- `relatedPayment`: MongoDB ObjectId
- `relatedSupplierPayment`: MongoDB ObjectId
- `description`: String
- `notes`: String
- `status`: `"draft"` | `"pending"` | `"approved"` | `"completed"` | `"cancelled"` | `"rejected"` (default: "draft")
- `attachments`: Array of objects with `url`, `name`, `type` OR file upload via `attachment` field

---

## Update Voucher

**Method:** `PUT`  
**URL:** `http://localhost:YOUR_PORT/api/bank-payment-vouchers/:id`

Same body format as create, but all fields are optional (only include fields you want to update).

---

## Other Endpoints

### Approve Voucher
**Method:** `PUT`  
**URL:** `http://localhost:YOUR_PORT/api/bank-payment-vouchers/:id/approve`  
**Body:** None required

### Reject Voucher
**Method:** `PUT`  
**URL:** `http://localhost:YOUR_PORT/api/bank-payment-vouchers/:id/reject`  
**Body:**
```json
{
  "rejectionReason": "Insufficient documentation"
}
```

### Complete Voucher
**Method:** `PUT`  
**URL:** `http://localhost:YOUR_PORT/api/bank-payment-vouchers/:id/complete`  
**Body:** None required

### Cancel Voucher
**Method:** `PUT`  
**URL:** `http://localhost:YOUR_PORT/api/bank-payment-vouchers/:id/cancel`  
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

## Common Issues & Solutions

1. **"Cast to [string] failed" error**: 
   - Make sure `attachments` is a valid JSON array, not a string
   - If using multipart/form-data, stringify the array: `JSON.stringify([{...}])`

2. **File upload not working**:
   - Ensure field name is exactly `attachment` (singular)
   - Check file type is allowed (jpeg, jpg, png, webp, pdf, doc, docx, xls, xlsx)
   - File size must be <= 10MB

3. **Validation errors**:
   - Check that required fields are provided
   - Ensure ObjectIds are valid MongoDB ObjectIds
   - Verify enum values match allowed options
