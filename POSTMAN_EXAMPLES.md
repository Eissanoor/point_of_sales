# Postman API Examples - Expense Management System

This document provides complete request body examples for testing the expense management system APIs in Postman.

## 1. Procurement Expenses

### Create Procurement Expense
**POST** `/api/procurement-expenses`

```json
{
  "supplier": "60d5ecb74b24a1234567890a",
  "purchaseOrderNo": "PO-2024-001",
  "invoiceNo": "INV-2024-001",
  "productCategory": "60d5ecb74b24a1234567890b",
  "products": [
    {
      "product": "60d5ecb74b24a1234567890c",
      "quantity": 100,
      "unitPrice": 50.00
    },
    {
      "product": "60d5ecb74b24a1234567890d",
      "quantity": 200,
      "unitPrice": 25.00
    }
  ],
  "currency": "60d5ecb74b24a1234567890e",
  "exchangeRate": 278.50,
  "importDuty": 500.00,
  "packagingCost": 200.00,
  "handlingCost": 150.00,
  "linkedShipment": "60d5ecb74b24a1234567890f",
  "linkedBatch": "BATCH-2024-001",
  "paymentMethod": "bank",
  "dueDate": "2024-12-31",
  "notes": "Cigarette purchase from Dubai supplier - urgent delivery required"
}
```

### Update Payment Status
**PUT** `/api/procurement-expenses/{id}/payment`

```json
{
  "paymentStatus": "paid",
  "paidDate": "2024-09-17"
}
```

## 2. Logistics Expenses

### Create Logistics Expense
**POST** `/api/logistics-expenses`

```json
{
  "transporter": "60d5ecb74b24a1234567890g",
  "route": "Dubai → Karachi → Afghanistan → Pakistan",
  "vehicleContainerNo": "CONT-12345",
  "freightCost": 2000.00,
  "borderCrossingCharges": 300.00,
  "transporterCommission": 150.00,
  "serviceFee": 100.00,
  "transitWarehouseCharges": 250.00,
  "localTransportCharges": 200.00,
  "currency": "60d5ecb74b24a1234567890e",
  "exchangeRate": 278.50,
  "linkedShipment": "60d5ecb74b24a1234567890f",
  "linkedWarehouse": "60d5ecb74b24a1234567890h",
  "paymentMethod": "cash",
  "departureDate": "2024-09-15",
  "arrivalDate": "2024-09-20",
  "notes": "Express delivery for urgent stock replenishment"
}
```

### Update Transport Status
**PUT** `/api/logistics-expenses/{id}/status`

```json
{
  "transportStatus": "delivered",
  "arrivalDate": "2024-09-20"
}
```

## 3. Warehouse Expenses

### Create Warehouse Expense
**POST** `/api/warehouse-expenses`

```json
{
  "warehouse": "60d5ecb74b24a1234567890h",
  "expenseSubType": "rent",
  "rentAmount": 50000.00,
  "staffSalaries": 25000.00,
  "securityCost": 8000.00,
  "utilities": {
    "electricity": 12000.00,
    "water": 2000.00,
    "gas": 1500.00,
    "internet": 3000.00
  },
  "repairsCost": 5000.00,
  "maintenanceCost": 3000.00,
  "currency": "60d5ecb74b24a1234567890i",
  "exchangeRate": 1.00,
  "storageDuration": "monthly",
  "linkedStock": "60d5ecb74b24a1234567890j",
  "linkedBatch": "BATCH-2024-001",
  "paymentMethod": "bank",
  "expensePeriod": {
    "startDate": "2024-09-01",
    "endDate": "2024-09-30"
  },
  "notes": "Monthly warehouse expenses for Karachi facility"
}
```

## 4. Sales Distribution Expenses

### Create Sales Distribution Expense
**POST** `/api/sales-distribution-expenses`

```json
{
  "salesperson": "60d5ecb74b24a1234567890k",
  "salesTeam": "Team Alpha",
  "commissionRate": 5.0,
  "salesAmount": 100000.00,
  "customerDiscounts": 2000.00,
  "creditLoss": 1500.00,
  "badDebts": 500.00,
  "promotionalCost": 3000.00,
  "marketingCost": 2500.00,
  "currency": "60d5ecb74b24a1234567890i",
  "exchangeRate": 1.00,
  "linkedSalesInvoice": "60d5ecb74b24a1234567890l",
  "customer": "60d5ecb74b24a1234567890m",
  "paymentMethod": "mixed",
  "expenseType": "commission",
  "salesPeriod": {
    "startDate": "2024-09-01",
    "endDate": "2024-09-30"
  },
  "notes": "Monthly commission and promotional expenses"
}
```

## 5. Financial Expenses

### Create Financial Expense
**POST** `/api/financial-expenses`

```json
{
  "expenseSubType": "bank_charges",
  "bankCharges": 500.00,
  "transactionFees": 200.00,
  "exchangeGainLoss": -150.00,
  "loanInterest": 2000.00,
  "financeCharges": 300.00,
  "currency": "60d5ecb74b24a1234567890i",
  "exchangeRate": 1.00,
  "linkedBankAccount": "60d5ecb74b24a1234567890n",
  "transactionReference": "TXN-2024-001",
  "loanReference": "LOAN-2024-001",
  "paymentMethod": "bank",
  "transactionDate": "2024-09-17",
  "notes": "Monthly banking charges and loan interest"
}
```

## 6. Operational Expenses

### Create Operational Expense
**POST** `/api/operational-expenses`

```json
{
  "expenseSubType": "salaries",
  "employeeSalaries": 150000.00,
  "officeRent": 30000.00,
  "utilities": {
    "electricity": 8000.00,
    "internet": 5000.00,
    "phone": 3000.00,
    "water": 1500.00
  },
  "officeSupplies": 2000.00,
  "stationery": 1000.00,
  "softwareExpenses": 10000.00,
  "equipmentCost": 5000.00,
  "insuranceCost": 3000.00,
  "currency": "60d5ecb74b24a1234567890i",
  "exchangeRate": 1.00,
  "department": "administration",
  "employee": "60d5ecb74b24a1234567890o",
  "paymentMethod": "bank",
  "expensePeriod": {
    "startDate": "2024-09-01",
    "endDate": "2024-09-30"
  },
  "notes": "Monthly operational expenses for head office"
}
```

## 7. Miscellaneous Expenses

### Create Miscellaneous Expense
**POST** `/api/miscellaneous-expenses`

```json
{
  "expenseSubType": "marketing",
  "marketingCost": 15000.00,
  "promotionCost": 8000.00,
  "entertainmentCost": 5000.00,
  "hospitalityCost": 3000.00,
  "unexpectedCosts": 2000.00,
  "adjustments": -500.00,
  "legalFees": 10000.00,
  "consultingFees": 7500.00,
  "currency": "60d5ecb74b24a1234567890i",
  "exchangeRate": 1.00,
  "paymentMethod": "mixed",
  "description": "Marketing campaign and legal consultation fees",
  "notes": "Q3 marketing campaign expenses and legal advisory costs"
}
```

## 8. Main Expense Creation

### Create Main Expense (Generic)
**POST** `/api/expenses`

```json
{
  "expenseType": "procurement",
  "expenseData": {
    "supplier": "60d5ecb74b24a1234567890a",
    "invoiceNo": "INV-2024-002",
    "productCategory": "60d5ecb74b24a1234567890b",
    "products": [
      {
        "product": "60d5ecb74b24a1234567890c",
        "quantity": 50,
        "unitPrice": 100.00
      }
    ],
    "currency": "60d5ecb74b24a1234567890e",
    "paymentMethod": "credit",
    "description": "Hardware supplies procurement",
    "notes": "Urgent procurement for project requirements"
  }
}
```

## 9. Transporter Management

### Create Transporter
**POST** `/api/transporters`

```json
{
  "name": "Express Logistics LLC",
  "contactPerson": "Ahmed Hassan",
  "phoneNumber": "+971-50-1234567",
  "email": "ahmed@expresslogistics.ae",
  "address": "Dubai Industrial Area, UAE",
  "city": "Dubai",
  "country": "UAE",
  "vehicleTypes": ["truck", "container"],
  "routes": [
    {
      "origin": "Dubai",
      "destination": "Karachi",
      "estimatedDays": 7,
      "ratePerKg": 2.5
    },
    {
      "origin": "Karachi",
      "destination": "Lahore",
      "estimatedDays": 2,
      "ratePerKg": 1.5
    }
  ],
  "commissionRate": 3.0,
  "paymentTerms": "credit_30",
  "rating": 4.5
}
```

## 10. Query Parameters Examples

### Get Expenses with Filters
**GET** `/api/expenses?expenseType=procurement&status=approved&dateFrom=2024-01-01&dateTo=2024-12-31&page=1&limit=10`

### Get Procurement Expenses with Filters
**GET** `/api/procurement-expenses?supplier=60d5ecb74b24a1234567890a&status=paid&page=1&limit=5`

### Get Logistics Expenses by Route
**GET** `/api/logistics-expenses/route/Dubai%20%E2%86%92%20Karachi`

### Get Expense Analytics
**GET** `/api/expenses/analytics?dateFrom=2024-01-01&dateTo=2024-12-31`

## 11. Update Examples

### Update Procurement Expense
**PUT** `/api/procurement-expenses/{id}`

```json
{
  "importDuty": 600.00,
  "packagingCost": 250.00,
  "notes": "Updated import duty after customs clearance"
}
```

### Approve Expense
**PUT** `/api/expenses/{id}/approve`

```json
{
  "approvalNotes": "Approved after verification of all documents"
}
```

## Response Format

All APIs return responses in this format:

### Success Response
```json
{
  "status": "success",
  "data": { /* response data */ },
  "message": "Operation completed successfully"
}
```

### Error Response
```json
{
  "status": "error",
  "message": "Error description"
}
```

### Paginated Response
```json
{
  "status": "success",
  "results": 10,
  "total": 100,
  "page": 1,
  "pages": 10,
  "data": [ /* array of items */ ]
}
```

## Notes for Testing

1. **Replace ObjectIds**: Replace all ObjectId examples (like `60d5ecb74b24a1234567890a`) with actual IDs from your database
2. **Currency Setup**: Ensure you have currencies set up in your database first
3. **Exchange Rates**: Update exchange rates to current values
4. **Date Formats**: Use ISO date format (YYYY-MM-DD) for dates
5. **Authentication**: Add authentication headers if your routes are protected
6. **Validation**: The system will validate all required fields and data types

## Common ObjectIds You'll Need

Before testing, create these entities first:
- Suppliers (`/api/suppliers`)
- Products (`/api/products`) 
- Categories (`/api/categories`)
- Currencies (`/api/currencies`)
- Warehouses (`/api/warehouses`)
- Users (`/api/users`)
- Customers (`/api/customers`)

Then use their returned `_id` values in the expense creation requests.
