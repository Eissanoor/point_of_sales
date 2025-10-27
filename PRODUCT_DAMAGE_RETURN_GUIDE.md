# Product Damage and Return System

This document explains how to implement and use the product damage and return functionality in the backend system.

## Overview

The system handles two main scenarios:
1. **Product Damage**: When products are damaged during handling, storage, or transportation
2. **Product Returns**: When customers return products for various reasons

Both systems include:
- Stock management with automatic adjustments
- Approval workflows
- Audit trails via ProductJourney
- Image support for documentation
- Statistics and reporting

## Models

### ProductDamage Model
Tracks damaged products with the following key fields:
- `product`: Reference to the damaged product
- `quantity`: Amount of damaged items
- `damageType`: Type of damage (transport_damage, handling_damage, etc.)
- `damageReason`: Detailed reason for damage
- `status`: pending, approved, rejected
- `estimatedLoss`: Financial impact
- `disposalMethod`: How damaged items are handled
- `warehouse/shop`: Location where damage occurred

### ProductReturn Model
Handles customer returns with:
- `customer`: Reference to returning customer
- `originalSale`: Link to original sale (optional)
- `products`: Array of returned items with conditions
- `status`: pending, approved, rejected, processed, refunded
- `totalRefundAmount`: Calculated refund amount
- `refundMethod`: How refund is processed

### Updated Product Model
Added fields:
- `damagedQuantity`: Total damaged items
- `returnedQuantity`: Total returned items

## API Endpoints

### Product Damage Endpoints

#### GET /api/product-damages
Get all damage records with filtering and pagination
- Query params: `page`, `limit`, `status`, `damageType`, `warehouse`, `shop`, `product`
- Returns paginated list of damage records

#### GET /api/product-damages/:id
Get specific damage record by ID

#### POST /api/product-damages
Create new damage record
- Body: `product`, `quantity`, `damageType`, `damageReason`, `warehouse/shop`, etc.
- Files: Multiple images supported
- Automatically updates product's `damagedQuantity`

#### PUT /api/product-damages/:id
Update damage record (approve/reject)
- Body: `status`, `adminNotes`
- When approved: reduces `countInStock` by damaged quantity

#### DELETE /api/product-damages/:id
Delete damage record
- If approved: restores stock and reduces `damagedQuantity`
- Deletes associated images from Cloudinary

#### GET /api/product-damages/statistics
Get damage statistics and analytics

### Product Return Endpoints

#### GET /api/product-returns
Get all return records with filtering and pagination
- Query params: `page`, `limit`, `status`, `customer`, `returnReason`, etc.

#### GET /api/product-returns/:id
Get specific return record by ID

#### POST /api/product-returns
Create new return request
- Body: `customer`, `products[]`, `returnReason`, `warehouse/shop`
- Products array includes: `product`, `quantity`, `returnReason`, `condition`
- Automatically calculates refund amounts based on condition

#### PUT /api/product-returns/:id
Update return record (approve/reject/process)
- Body: `status`, `adminNotes`, `refundStatus`
- When approved: updates `returnedQuantity` and restocks if restockable

#### DELETE /api/product-returns/:id
Delete return record
- Reverses stock adjustments if was approved

#### GET /api/product-returns/statistics
Get return statistics and analytics

## Stock Management Logic

### Available Stock Calculation
The system calculates available stock as:
```
Available Stock = countInStock - damagedQuantity - returnedQuantity
```

### Stock Adjustments

#### When Damage is Reported:
1. `damagedQuantity` increases
2. Available stock decreases (but `countInStock` stays same)

#### When Damage is Approved:
1. `countInStock` decreases by damaged quantity
2. `damagedQuantity` remains same
3. Available stock decreases further

#### When Return is Approved:
1. `returnedQuantity` increases
2. If restockable: `countInStock` increases
3. Available stock increases (for restockable items)

## Usage Examples

### Report Product Damage

```javascript
// POST /api/product-damages
{
  "product": "60f7b3b3b3b3b3b3b3b3b3b3",
  "warehouse": "60f7b3b3b3b3b3b3b3b3b3b4",
  "quantity": 5,
  "damageType": "transport_damage",
  "damageReason": "Package damaged during delivery",
  "damageDescription": "Box was crushed, items inside damaged",
  "estimatedLoss": 150.00,
  "disposalMethod": "destroy"
}
```

### Create Return Request

```javascript
// POST /api/product-returns
{
  "customer": "60f7b3b3b3b3b3b3b3b3b3b5",
  "originalSale": "60f7b3b3b3b3b3b3b3b3b3b6",
  "products": [
    {
      "product": "60f7b3b3b3b3b3b3b3b3b3b3",
      "quantity": 2,
      "returnReason": "defective_product",
      "condition": "defective"
    }
  ],
  "returnReason": "Product was defective upon arrival",
  "customerNotes": "Items not working properly",
  "warehouse": "60f7b3b3b3b3b3b3b3b3b3b4"
}
```

### Approve Damage

```javascript
// PUT /api/product-damages/:id
{
  "status": "approved",
  "adminNotes": "Damage confirmed, stock adjusted"
}
```

### Approve Return

```javascript
// PUT /api/product-returns/:id
{
  "status": "approved",
  "adminNotes": "Return approved, items restocked"
}
```

## Integration Points

### With Sales System
- Returns can be linked to original sales
- Refund amounts calculated based on original prices
- Stock adjustments affect sales availability

### With Stock Transfer System
- Available stock calculations consider damaged/returned quantities
- Transfers respect actual available inventory

### With Product Journey
- All damage and return actions create journey records
- Complete audit trail for compliance

## Security & Permissions

- **Create**: Any authenticated user can report damage/returns
- **Read**: Admin access required for viewing records
- **Update**: Admin access required for approval/rejection
- **Delete**: Admin access required for deletion

## File Uploads

Both systems support multiple image uploads:
- Damage photos for documentation
- Return condition photos
- Images stored in Cloudinary with automatic cleanup on deletion

## Statistics & Reporting

### Damage Statistics
- Total damages by period
- Damage type breakdown
- Financial loss tracking
- Status distribution

### Return Statistics
- Return volume by period
- Return reason analysis
- Refund amount tracking
- Customer return patterns

## Best Practices

1. **Always verify stock availability** before creating damage/return records
2. **Use appropriate damage types** for better categorization
3. **Document with images** when possible
4. **Set realistic refund amounts** based on item condition
5. **Regular cleanup** of old pending records
6. **Monitor statistics** for operational insights

## Error Handling

The system includes comprehensive error handling:
- Stock validation before operations
- Image upload error handling
- Database transaction safety
- Graceful degradation for missing references

## Future Enhancements

Potential improvements:
- Automated damage detection
- Return reason categorization
- Integration with external systems
- Advanced analytics and reporting
- Mobile app support
