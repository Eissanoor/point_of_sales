# Postman Example: Create Purchase with Multiple Payment Methods

## Endpoint
```
POST /api/purchases
```

## Headers
```
Authorization: Bearer <your_token>
Content-Type: multipart/form-data
```

## Body (form-data)

### Example 1: Multiple Payment Methods (Cash + Online)

| Key | Type | Value |
|-----|------|-------|
| `items` | Text | `[{"product":"507f1f77bcf86cd799439011","quantity":10,"purchaseRate":50,"retailRate":75,"wholesaleRate":60}]` |
| `supplier` | Text | `507f1f77bcf86cd799439012` |
| `warehouse` | Text | `507f1f77bcf86cd799439013` |
| `locationType` | Text | `warehouse` |
| `currency` | Text | `507f1f77bcf86cd799439014` (optional) |
| `purchaseDate` | Text | `2024-01-15` (optional, defaults to current date) |
| `invoiceNumber` | Text | `INV-001` (optional, auto-generated if empty) |
| `notes` | Text | `Purchase from supplier ABC` (optional) |
| `payments` | Text | `[{"method":"cash","amount":100},{"method":"online","amount":300,"bankAccount":"507f1f77bcf86cd799439015"}]` |
| `transactionReceipt` | File | (optional) Select a file to upload |

### Example 2: Single Payment Method (Backward Compatible)

| Key | Type | Value |
|-----|------|-------|
| `items` | Text | `[{"product":"507f1f77bcf86cd799439011","quantity":5,"purchaseRate":100,"retailRate":150,"wholesaleRate":120}]` |
| `supplier` | Text | `507f1f77bcf86cd799439012` |
| `shop` | Text | `507f1f77bcf86cd799439016` |
| `locationType` | Text | `shop` |
| `paymentMethod` | Text | `cash` |
| `bankAccount` | Text | (optional) |

### Example 3: Three Payment Methods (Cash + Bank + Credit)

| Key | Type | Value |
|-----|------|-------|
| `items` | Text | `[{"product":"507f1f77bcf86cd799439011","quantity":20,"purchaseRate":25,"retailRate":40,"wholesaleRate":30}]` |
| `supplier` | Text | `507f1f77bcf86cd799439012` |
| `warehouse` | Text | `507f1f77bcf86cd799439013` |
| `payments` | Text | `[{"method":"cash","amount":200},{"method":"bank","amount":150,"bankAccount":"507f1f77bcf86cd799439015"},{"method":"credit","amount":150}]` |
| `notes` | Text | `Split payment across three methods` |

## Payments Array Format

The `payments` field should be a JSON array string with the following structure:

```json
[
  {
    "method": "cash",
    "amount": 100
  },
  {
    "method": "online",
    "amount": 300,
    "bankAccount": "507f1f77bcf86cd799439015"
  }
]
```

### Payment Method Options:
- `cash` - Cash payment (no bankAccount needed)
- `bank` - Bank transfer (bankAccount required)
- `online` - Online payment (bankAccount required)
- `credit` - Credit payment (no bankAccount needed)
- `check` - Check payment (no bankAccount needed)

### Payment Object Fields:
- `method` (required): One of the payment methods above
- `amount` (required): Positive number representing the payment amount
- `bankAccount` (optional): Required only for `bank` and `online` methods, must be a valid BankAccount ID

## Items Array Format

The `items` field should be a JSON array string:

```json
[
  {
    "product": "507f1f77bcf86cd799439011",
    "quantity": 10,
    "purchaseRate": 50,
    "retailRate": 75,
    "wholesaleRate": 60
  },
  {
    "product": "507f1f77bcf86cd799439017",
    "quantity": 5,
    "purchaseRate": 100,
    "retailRate": 150,
    "wholesaleRate": 120
  }
]
```

### Item Object Fields:
- `product` (required): Product ID (ObjectId)
- `quantity` (required): Number of items (minimum: 1)
- `purchaseRate` (required): Purchase price per unit (minimum: 0)
- `retailRate` (required): Retail selling price per unit (minimum: 0)
- `wholesaleRate` (required): Wholesale selling price per unit (minimum: 0)

## Validation Rules

1. **Total Payment Amount**: The sum of all payment amounts should not exceed the total purchase amount (with 1% tolerance for rounding)
2. **Bank Account**: Required for `bank` and `online` payment methods
3. **Payment Amount**: Must be a positive number
4. **At least one payment**: You must provide at least one payment method

## Response Example

### Success Response (201 Created)
```json
{
  "status": "success",
  "data": {
    "_id": "507f1f77bcf86cd799439018",
    "user": "507f1f77bcf86cd799439019",
    "items": [
      {
        "product": "507f1f77bcf86cd799439011",
        "quantity": 10,
        "purchaseRate": 50,
        "retailRate": 75,
        "wholesaleRate": 60,
        "itemTotal": 500
      }
    ],
    "supplier": "507f1f77bcf86cd799439012",
    "warehouse": "507f1f77bcf86cd799439013",
    "locationType": "warehouse",
    "payments": [
      {
        "method": "cash",
        "amount": 100,
        "bankAccount": null
      },
      {
        "method": "online",
        "amount": 300,
        "bankAccount": "507f1f77bcf86cd799439015"
      }
    ],
    "totalAmount": 500,
    "totalQuantity": 10,
    "invoiceNumber": "PUR-2024-01-0001",
    "purchaseDate": "2024-01-15T00:00:00.000Z",
    "status": "completed",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

### Error Response (400 Bad Request)
```json
{
  "status": "fail",
  "message": "Total payment amount (500) exceeds purchase total (400)"
}
```

## Notes

1. **Multipart Form Data**: Since this endpoint accepts file uploads (transactionReceipt), it uses `multipart/form-data`
2. **JSON Strings**: When using multipart/form-data, array/object fields like `items` and `payments` must be sent as JSON strings
3. **Backward Compatibility**: The old `paymentMethod` and `bankAccount` fields still work for single payment scenarios
4. **File Upload**: The `transactionReceipt` field accepts image files (jpg, png, pdf, etc.) and uploads them to Cloudinary

