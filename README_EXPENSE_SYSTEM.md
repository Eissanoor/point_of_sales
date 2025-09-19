# Comprehensive Expense Management System

This document provides a complete overview of the expense management system implemented for your Node.js/MongoDB application.

## Overview

The expense management system is designed to handle 7 main categories of business expenses with multi-currency support and comprehensive tracking capabilities.

## System Architecture

### Core Models (11 Models)

1. **Main Expense Model** (`expenseModel.js`) - Central expense tracking
2. **Procurement Expense Model** (`procurementExpenseModel.js`) - Supplier purchases
3. **Logistics Expense Model** (`logisticsExpenseModel.js`) - Transport and shipping
4. **Warehouse Expense Model** (`warehouseExpenseModel.js`) - Storage and facility costs
5. **Sales Distribution Expense Model** (`salesDistributionExpenseModel.js`) - Sales-related costs
6. **Financial Expense Model** (`financialExpenseModel.js`) - Banking and finance charges
7. **Operational Expense Model** (`operationalExpenseModel.js`) - Office and admin costs
8. **Miscellaneous Expense Model** (`miscellaneousExpenseModel.js`) - Other business costs
9. **Transporter Model** (`transporterModel.js`) - Transport service providers
10. **Shipment Model** (`shipmentModel.js`) - Shipment and batch tracking
11. **Bank Account Model** (`bankAccountModel.js`) - Financial account management

### Key Features

- **Multi-Currency Support**: USD, AED, JPY, PKR with automatic conversion
- **Exchange Rate Tracking**: Automatic PKR conversion with historical rates
- **Comprehensive Relationships**: Links to suppliers, customers, warehouses, products
- **Status Management**: Pending, approved, paid, cancelled workflow
- **Soft Delete**: Maintains data integrity with isActive flags
- **Auto-Calculations**: Automatic total calculations and currency conversions

## API Endpoints

### Main Expense Management
```
GET    /api/expenses                    # Get all expenses with filtering
GET    /api/expenses/analytics          # Get expense analytics
GET    /api/expenses/:id                # Get single expense
POST   /api/expenses                    # Create new expense
PUT    /api/expenses/:id                # Update expense
PUT    /api/expenses/:id/approve        # Approve expense
DELETE /api/expenses/:id                # Delete expense (soft)
```

### Procurement Expenses
```
GET    /api/procurement-expenses                      # Get all procurement expenses
GET    /api/procurement-expenses/supplier/:id        # Get by supplier
GET    /api/procurement-expenses/:id                  # Get single expense
POST   /api/procurement-expenses                      # Create new expense
PUT    /api/procurement-expenses/:id                  # Update expense
PUT    /api/procurement-expenses/:id/payment          # Update payment status
DELETE /api/procurement-expenses/:id                  # Delete expense
```

### Logistics Expenses
```
GET    /api/logistics-expenses                        # Get all logistics expenses
GET    /api/logistics-expenses/route/:route          # Get by route
GET    /api/logistics-expenses/:id                    # Get single expense
POST   /api/logistics-expenses                        # Create new expense
PUT    /api/logistics-expenses/:id                    # Update expense
PUT    /api/logistics-expenses/:id/status             # Update transport status
DELETE /api/logistics-expenses/:id                    # Delete expense
```

### Transporters
```
GET    /api/transporters                              # Get all transporters
GET    /api/transporters/:id                          # Get single transporter
POST   /api/transporters                              # Create new transporter
PUT    /api/transporters/:id                          # Update transporter
DELETE /api/transporters/:id                          # Delete transporter
```

## Usage Examples

### 1. Creating a Procurement Expense

```javascript
POST /api/procurement-expenses
{
  "supplier": "60d5ecb74b24a1234567890a",
  "invoiceNo": "INV-2024-001",
  "productCategory": "60d5ecb74b24a1234567890b",
  "products": [
    {
      "product": "60d5ecb74b24a1234567890c",
      "quantity": 100,
      "unitPrice": 50
    }
  ],
  "currency": "60d5ecb74b24a1234567890d",
  "importDuty": 500,
  "packagingCost": 200,
  "paymentMethod": "bank",
  "notes": "Cigarette purchase from Dubai supplier"
}
```

### 2. Creating a Logistics Expense

```javascript
POST /api/logistics-expenses
{
  "transporter": "60d5ecb74b24a1234567890e",
  "route": "Dubai → Karachi → Afghanistan → Pakistan",
  "freightCost": 2000,
  "borderCrossingCharges": 300,
  "transitWarehouseCharges": 150,
  "currency": "60d5ecb74b24a1234567890d",
  "paymentMethod": "cash",
  "vehicleContainerNo": "CONT-12345"
}
```

### 3. Getting Expense Analytics

```javascript
GET /api/expenses/analytics?dateFrom=2024-01-01&dateTo=2024-12-31

Response:
{
  "status": "success",
  "data": {
    "byType": [
      {
        "_id": "procurement",
        "totalAmount": 150000,
        "count": 25,
        "avgAmount": 6000
      },
      {
        "_id": "logistics",
        "totalAmount": 75000,
        "count": 15,
        "avgAmount": 5000
      }
    ],
    "total": {
      "total": 225000,
      "count": 40
    },
    "byStatus": [
      {
        "_id": "approved",
        "count": 30,
        "totalAmount": 180000
      },
      {
        "_id": "pending",
        "count": 10,
        "totalAmount": 45000
      }
    ]
  }
}
```

## Model Relationships

```
Expense (Main)
├── ProcurementExpense → Supplier, Category, Product, Shipment
├── LogisticsExpense → Transporter, Warehouse, Shipment
├── WarehouseExpense → Warehouse, Product
├── SalesDistributionExpense → User, Customer, Sales
├── FinancialExpense → BankAccount
├── OperationalExpense → User
└── MiscellaneousExpense

All expenses → Currency, User (createdBy)
```

## Database Schema Features

### Auto-Calculations
- **Total Cost**: Automatically calculated from component costs
- **PKR Conversion**: Auto-converted using exchange rates
- **Product Totals**: Quantity × Unit Price calculations

### Validation
- Required field validation
- Enum value validation
- Minimum value constraints
- Email format validation
- Unique constraints where needed

### Middleware
- Pre-save hooks for calculations
- Auto-increment plugin for sequential IDs
- Timestamp tracking (createdAt, updatedAt)

## Query Features

### Filtering Options
- **By Type**: Filter expenses by category
- **By Status**: Filter by approval/payment status
- **By Date Range**: Filter by expense date
- **By Supplier/Transporter**: Filter by service provider
- **By Currency**: Filter by currency type

### Pagination
- Page-based pagination
- Configurable page size
- Total count and page information

### Population
- Automatic population of related models
- Selective field population for performance
- Deep population for nested relationships

## Best Practices

1. **Always specify currency** when creating expenses
2. **Use exchange rates** from the Currency model for consistency
3. **Link expenses** to relevant entities (suppliers, shipments, etc.)
4. **Add descriptive notes** for audit trails
5. **Use soft delete** to maintain data integrity
6. **Approve expenses** before marking as paid
7. **Track payment methods** for financial reconciliation

## Error Handling

The system includes comprehensive error handling:
- Validation errors with descriptive messages
- 404 errors for non-existent resources
- 500 errors for server issues
- Consistent error response format

## Security Considerations

- Authentication middleware ready for integration
- Role-based access control structure
- Input validation and sanitization
- Soft delete for data protection

This expense management system provides a robust foundation for tracking all business expenses with multi-currency support, comprehensive relationships, and detailed analytics capabilities.
