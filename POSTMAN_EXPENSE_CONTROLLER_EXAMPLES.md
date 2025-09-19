# Expense Controller - Postman Examples

This document provides comprehensive Postman examples for all expense controller endpoints.

## Base URL
```
http://localhost:3000/api/expenses
```

## Authentication
All endpoints require authentication. Add the following header to all requests:
```
Authorization: Bearer YOUR_JWT_TOKEN
```

---

## 1. GET All Expenses with Filtering

### Endpoint
```
GET /api/expenses
```

### Query Parameters (All Optional)
- `expenseType`: Filter by expense type (procurement, logistics, warehouse, sales_distribution, financial, operational, miscellaneous)
- `status`: Filter by status (pending, approved, rejected)
- `dateFrom`: Start date filter (YYYY-MM-DD)
- `dateTo`: End date filter (YYYY-MM-DD)
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10)

### Example Requests

#### Basic Request - Get All Expenses
```
GET http://localhost:3000/api/expenses
```

#### Filtered Request - Procurement Expenses Only
```
GET http://localhost:3000/api/expenses?expenseType=procurement&status=approved&page=1&limit=20
```

#### Date Range Filter
```
GET http://localhost:3000/api/expenses?dateFrom=2024-01-01&dateTo=2024-12-31
```

### Example Response
```json
{
  "status": "success",
  "results": 5,
  "total": 25,
  "page": 1,
  "pages": 3,
  "data": [
    {
      "_id": "64f8a1b2c3d4e5f6789012ab",
      "expenseType": "procurement",
      "referenceId": "64f8a1b2c3d4e5f6789012cd",
      "totalAmount": 15000,
      "currency": {
        "_id": "64f8a1b2c3d4e5f6789012ef",
        "name": "US Dollar",
        "code": "USD",
        "symbol": "$"
      },
      "exchangeRate": 280,
      "amountInPKR": 4200000,
      "paymentMethod": "bank_transfer",
      "expenseDate": "2024-01-15T00:00:00.000Z",
      "description": "Raw materials purchase",
      "status": "approved",
      "createdBy": {
        "_id": "64f8a1b2c3d4e5f6789012gh",
        "name": "John Doe",
        "email": "john@example.com"
      },
      "approvedBy": {
        "_id": "64f8a1b2c3d4e5f6789012ij",
        "name": "Jane Smith",
        "email": "jane@example.com"
      },
      "createdAt": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

---

## 2. GET Single Expense by ID

### Endpoint
```
GET /api/expenses/:id
```

### Example Request
```
GET http://localhost:3000/api/expenses/64f8a1b2c3d4e5f6789012ab
```

### Example Response
```json
{
  "status": "success",
  "data": {
    "expense": {
      "_id": "64f8a1b2c3d4e5f6789012ab",
      "expenseType": "procurement",
      "referenceId": "64f8a1b2c3d4e5f6789012cd",
      "totalAmount": 15000,
      "currency": {
        "_id": "64f8a1b2c3d4e5f6789012ef",
        "name": "US Dollar",
        "code": "USD",
        "symbol": "$"
      },
      "exchangeRate": 280,
      "amountInPKR": 4200000,
      "paymentMethod": "bank_transfer",
      "expenseDate": "2024-01-15T00:00:00.000Z",
      "description": "Raw materials purchase",
      "status": "approved"
    },
    "details": {
      "_id": "64f8a1b2c3d4e5f6789012cd",
      "supplier": {
        "_id": "64f8a1b2c3d4e5f6789012kl",
        "name": "ABC Suppliers Ltd",
        "email": "contact@abcsuppliers.com"
      },
      "items": [
        {
          "product": "64f8a1b2c3d4e5f6789012mn",
          "quantity": 100,
          "unitPrice": 150,
          "totalPrice": 15000
        }
      ],
      "totalCost": 15000,
      "currency": "64f8a1b2c3d4e5f6789012ef",
      "exchangeRate": 280,
      "amountInPKR": 4200000,
      "paymentMethod": "bank_transfer"
    }
  }
}
```

---

## 3. POST Create New Expense

### Endpoint
```
POST /api/expenses
```

### Request Headers
```
Content-Type: application/json
Authorization: Bearer YOUR_JWT_TOKEN
```

### Example Request Bodies

#### Procurement Expense
```json
{
  "expenseType": "procurement",
  "expenseData": {
    "supplier": "64f8a1b2c3d4e5f6789012kl",
    "items": [
      {
        "product": "64f8a1b2c3d4e5f6789012mn",
        "quantity": 50,
        "unitPrice": 200,
        "totalPrice": 10000
      }
    ],
    "totalCost": 10000,
    "currency": "64f8a1b2c3d4e5f6789012ef",
    "exchangeRate": 280,
    "paymentMethod": "cash",
    "expenseDate": "2024-01-20",
    "description": "Office supplies purchase",
    "notes": "Urgent procurement for new project"
  }
}
```

#### Logistics Expense
```json
{
  "expenseType": "logistics",
  "expenseData": {
    "transporter": "64f8a1b2c3d4e5f6789012op",
    "shipmentDetails": {
      "origin": "Karachi",
      "destination": "Lahore",
      "weight": 500,
      "volume": 10
    },
    "transportCost": 25000,
    "currency": "64f8a1b2c3d4e5f6789012qr",
    "paymentMethod": "bank_transfer",
    "expenseDate": "2024-01-22",
    "description": "Product shipment to Lahore warehouse"
  }
}
```

#### Financial Expense
```json
{
  "expenseType": "financial",
  "expenseData": {
    "linkedBankAccount": "64f8a1b2c3d4e5f6789012st",
    "expenseCategory": "bank_charges",
    "amount": 5000,
    "currency": "64f8a1b2c3d4e5f6789012uv",
    "paymentMethod": "bank_deduction",
    "expenseDate": "2024-01-25",
    "description": "Monthly bank maintenance charges"
  }
}
```

### Example Response
```json
{
  "status": "success",
  "data": {
    "_id": "64f8a1b2c3d4e5f6789012wx",
    "expenseType": "procurement",
    "referenceId": "64f8a1b2c3d4e5f6789012yz",
    "totalAmount": 10000,
    "currency": "64f8a1b2c3d4e5f6789012ef",
    "exchangeRate": 280,
    "amountInPKR": 2800000,
    "paymentMethod": "cash",
    "expenseDate": "2024-01-20T00:00:00.000Z",
    "description": "Office supplies purchase",
    "notes": "Urgent procurement for new project",
    "status": "pending",
    "createdBy": "64f8a1b2c3d4e5f6789012gh",
    "createdAt": "2024-01-20T14:30:00.000Z"
  },
  "message": "Expense created successfully"
}
```

---

## 4. PUT Update Expense

### Endpoint
```
PUT /api/expenses/:id
```

### Example Request
```
PUT http://localhost:3000/api/expenses/64f8a1b2c3d4e5f6789012wx
```

### Request Body
```json
{
  "expenseData": {
    "totalCost": 12000,
    "description": "Updated office supplies purchase",
    "notes": "Added additional items to the order"
  }
}
```

### Example Response
```json
{
  "status": "success",
  "data": {
    "_id": "64f8a1b2c3d4e5f6789012wx",
    "expenseType": "procurement",
    "totalAmount": 12000,
    "amountInPKR": 3360000,
    "description": "Updated office supplies purchase",
    "notes": "Added additional items to the order"
  },
  "message": "Expense updated successfully"
}
```

---

## 5. PUT Approve Expense

### Endpoint
```
PUT /api/expenses/:id/approve
```

### Example Request
```
PUT http://localhost:3000/api/expenses/64f8a1b2c3d4e5f6789012wx/approve
```

### Request Body
```json
{}
```

### Example Response
```json
{
  "status": "success",
  "data": {
    "_id": "64f8a1b2c3d4e5f6789012wx",
    "status": "approved",
    "approvedBy": "64f8a1b2c3d4e5f6789012ij",
    "approvedDate": "2024-01-21T09:15:00.000Z"
  },
  "message": "Expense approved successfully"
}
```

---

## 6. DELETE Expense (Soft Delete)

### Endpoint
```
DELETE /api/expenses/:id
```

### Example Request
```
DELETE http://localhost:3000/api/expenses/64f8a1b2c3d4e5f6789012wx
```

### Example Response
```json
{
  "status": "success",
  "message": "Expense deleted successfully"
}
```

---

## 7. GET Expense Analytics

### Endpoint
```
GET /api/expenses/analytics
```

### Query Parameters (Optional)
- `dateFrom`: Start date for analytics (YYYY-MM-DD)
- `dateTo`: End date for analytics (YYYY-MM-DD)

### Example Requests

#### Basic Analytics
```
GET http://localhost:3000/api/expenses/analytics
```

#### Date Range Analytics
```
GET http://localhost:3000/api/expenses/analytics?dateFrom=2024-01-01&dateTo=2024-03-31
```

### Example Response
```json
{
  "status": "success",
  "data": {
    "byType": [
      {
        "_id": "procurement",
        "totalAmount": 15750000,
        "count": 25,
        "avgAmount": 630000
      },
      {
        "_id": "logistics",
        "totalAmount": 8400000,
        "count": 15,
        "avgAmount": 560000
      },
      {
        "_id": "operational",
        "totalAmount": 5250000,
        "count": 30,
        "avgAmount": 175000
      }
    ],
    "total": {
      "total": 29400000,
      "count": 70
    },
    "byStatus": [
      {
        "_id": "approved",
        "count": 45,
        "totalAmount": 22050000
      },
      {
        "_id": "pending",
        "count": 20,
        "totalAmount": 6300000
      },
      {
        "_id": "rejected",
        "count": 5,
        "totalAmount": 1050000
      }
    ]
  }
}
```

---

## Error Responses

### 400 Bad Request
```json
{
  "status": "fail",
  "message": "Expense type and expense data are required"
}
```

### 404 Not Found
```json
{
  "status": "fail",
  "message": "Expense not found"
}
```

### 500 Internal Server Error
```json
{
  "status": "error",
  "message": "Database connection error"
}
```

---

## Expense Types Available

1. **procurement** - For supplier purchases and procurement expenses
2. **logistics** - For transport and shipping expenses
3. **warehouse** - For storage and warehouse-related expenses
4. **sales_distribution** - For sales and distribution expenses
5. **financial** - For banking and financial charges
6. **operational** - For office and administrative expenses
7. **miscellaneous** - For other business expenses

---

## Payment Methods

- `cash`
- `bank_transfer`
- `credit_card`
- `debit_card`
- `cheque`
- `online_payment`

---

## Status Values

- `pending` - Default status for new expenses
- `approved` - Approved by authorized personnel
- `rejected` - Rejected expenses

---

## Notes

1. All monetary amounts are stored in the original currency and converted to PKR using exchange rates
2. The `exchangeRate` field represents the conversion rate to PKR
3. Dates should be provided in ISO format (YYYY-MM-DD) or full ISO datetime
4. All delete operations are soft deletes (isActive: false)
5. Authentication is required for all endpoints
6. The system supports multi-currency operations with automatic PKR conversion
