# Postman Examples: SubCategory API

This document provides complete request body examples for testing the SubCategory APIs in Postman.

## Base URL
```
http://localhost:3000/api/subcategories
```

## Authentication
All endpoints require authentication. Add the following header to all requests:
```
Authorization: Bearer YOUR_JWT_TOKEN
```

---

## 1. Create SubCategory

### Endpoint
```
POST /api/subcategories
```

### Headers
```
Authorization: Bearer <your_token>
Content-Type: application/json
```

### Request Body Example

```json
{
  "name": "Premium Cigarettes",
  "category": "507f1f77bcf86cd799439011",
  "description": "High-end premium cigarette brands"
}
```

### Required Fields:
- `name` (string): SubCategory name (must be unique within the category)
- `category` (ObjectId): Reference to parent Category
- `description` (string, optional): Description of the subcategory

### Success Response (201 Created)
```json
{
  "status": "success",
  "data": {
    "_id": "507f1f77bcf86cd799439020",
    "name": "Premium Cigarettes",
    "category": "507f1f77bcf86cd799439011",
    "description": "High-end premium cigarette brands",
    "isActive": true,
    "id": 1,
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  },
  "message": "SubCategory created successfully"
}
```

### Error Response (400 Bad Request)
```json
{
  "status": "fail",
  "message": "SubCategory with this name already exists in this category"
}
```

---

## 2. Get All SubCategories

### Endpoint
```
GET /api/subcategories
```

### Query Parameters (Optional)
- `category`: Filter by category ID
- `isActive`: Filter by active status (true/false)

### Example Request
```
GET /api/subcategories?category=507f1f77bcf86cd799439011&isActive=true
```

### Success Response (200 OK)
```json
{
  "status": "success",
  "results": 2,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439020",
      "name": "Premium Cigarettes",
      "category": {
        "_id": "507f1f77bcf86cd799439011",
        "name": "Tobacco Products",
        "description": "All tobacco-related products"
      },
      "description": "High-end premium cigarette brands",
      "isActive": true,
      "id": 1,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    },
    {
      "_id": "507f1f77bcf86cd799439021",
      "name": "Standard Cigarettes",
      "category": {
        "_id": "507f1f77bcf86cd799439011",
        "name": "Tobacco Products",
        "description": "All tobacco-related products"
      },
      "description": "Standard cigarette brands",
      "isActive": true,
      "id": 2,
      "createdAt": "2024-01-15T11:00:00.000Z",
      "updatedAt": "2024-01-15T11:00:00.000Z"
    }
  ]
}
```

---

## 3. Get SubCategory by ID

### Endpoint
```
GET /api/subcategories/:id
```

### Example Request
```
GET /api/subcategories/507f1f77bcf86cd799439020
```

### Success Response (200 OK)
```json
{
  "status": "success",
  "data": {
    "_id": "507f1f77bcf86cd799439020",
    "name": "Premium Cigarettes",
    "category": {
      "_id": "507f1f77bcf86cd799439011",
      "name": "Tobacco Products",
      "description": "All tobacco-related products"
    },
    "description": "High-end premium cigarette brands",
    "isActive": true,
    "id": 1,
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

### Error Response (404 Not Found)
```json
{
  "status": "fail",
  "message": "SubCategory not found"
}
```

---

## 4. Update SubCategory

### Endpoint
```
PUT /api/subcategories/:id
```

### Headers
```
Authorization: Bearer <your_token>
Content-Type: application/json
```

### Request Body Example

```json
{
  "name": "Premium Cigarettes - Updated",
  "description": "Updated description for premium cigarette brands",
  "isActive": true
}
```

### All Fields (Optional):
- `name` (string): SubCategory name
- `description` (string): Description
- `isActive` (boolean): Active status
- `category` (ObjectId): Parent category (cannot be changed once set)

### Success Response (200 OK)
```json
{
  "status": "success",
  "data": {
    "_id": "507f1f77bcf86cd799439020",
    "name": "Premium Cigarettes - Updated",
    "category": "507f1f77bcf86cd799439011",
    "description": "Updated description for premium cigarette brands",
    "isActive": true,
    "id": 1,
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-16T14:20:00.000Z"
  },
  "message": "SubCategory updated successfully"
}
```

---

## 5. Delete SubCategory

### Endpoint
```
DELETE /api/subcategories/:id
```

### Example Request
```
DELETE /api/subcategories/507f1f77bcf86cd799439020
```

### Success Response (200 OK)
```json
{
  "status": "success",
  "message": "SubCategory deleted successfully"
}
```

### Error Response (404 Not Found)
```json
{
  "status": "fail",
  "message": "SubCategory not found"
}
```

---

## 6. Get SubCategories by Category

### Endpoint
```
GET /api/subcategories/category/:categoryId
```

### Example Request
```
GET /api/subcategories/category/507f1f77bcf86cd799439011
```

### Success Response (200 OK)
```json
{
  "status": "success",
  "results": 2,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439020",
      "name": "Premium Cigarettes",
      "category": "507f1f77bcf86cd799439011",
      "description": "High-end premium cigarette brands",
      "isActive": true,
      "id": 1,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    },
    {
      "_id": "507f1f77bcf86cd799439021",
      "name": "Standard Cigarettes",
      "category": "507f1f77bcf86cd799439011",
      "description": "Standard cigarette brands",
      "isActive": true,
      "id": 2,
      "createdAt": "2024-01-15T11:00:00.000Z",
      "updatedAt": "2024-01-15T11:00:00.000Z"
    }
  ]
}
```

---

## 7. Using SubCategory in Product Creation

### Endpoint
```
POST /api/products
```

### Headers
```
Authorization: Bearer <your_token>
Content-Type: multipart/form-data
```

### Request Body (form-data)

| Key | Type | Value |
|-----|------|-------|
| `name` | Text | `Marlboro Gold` |
| `category` | Text | `507f1f77bcf86cd799439011` |
| `subCategory` | Text | `507f1f77bcf86cd799439020` |
| `supplier` | Text | `507f1f77bcf86cd799439012` |
| `warehouse` | Text | `507f1f77bcf86cd799439013` |
| `purchaseRate` | Text | `50` |
| `retailRate` | Text | `75` |
| `wholesaleRate` | Text | `60` |
| `countInStock` | Text | `100` |
| `description` | Text | `Premium quality cigarettes` |
| `image` | File | (optional) Select image file |

### JSON Request Body (if using application/json)

```json
{
  "name": "Marlboro Gold",
  "category": "507f1f77bcf86cd799439011",
  "subCategory": "507f1f77bcf86cd799439020",
  "supplier": "507f1f77bcf86cd799439012",
  "warehouse": "507f1f77bcf86cd799439013",
  "purchaseRate": 50,
  "retailRate": 75,
  "wholesaleRate": 60,
  "countInStock": 100,
  "description": "Premium quality cigarettes"
}
```

### Success Response (201 Created)
```json
{
  "status": "success",
  "data": {
    "_id": "507f1f77bcf86cd799439030",
    "name": "Marlboro Gold",
    "category": "507f1f77bcf86cd799439011",
    "subCategory": "507f1f77bcf86cd799439020",
    "supplier": "507f1f77bcf86cd799439012",
    "warehouse": "507f1f77bcf86cd799439013",
    "purchaseRate": 50,
    "retailRate": 75,
    "wholesaleRate": 60,
    "countInStock": 100,
    "description": "Premium quality cigarettes",
    "isActive": true,
    "createdAt": "2024-01-15T12:00:00.000Z",
    "updatedAt": "2024-01-15T12:00:00.000Z"
  }
}
```

---

## 8. Using SubCategory in Purchase Creation

### Endpoint
```
POST /api/purchases
```

### Headers
```
Authorization: Bearer <your_token>
Content-Type: multipart/form-data
```

### Request Body (form-data)

| Key | Type | Value |
|-----|------|-------|
| `items` | Text | `[{"product":"507f1f77bcf86cd799439030","subCategory":"507f1f77bcf86cd799439020","quantity":10,"purchaseRate":50,"retailRate":75,"wholesaleRate":60}]` |
| `supplier` | Text | `507f1f77bcf86cd799439012` |
| `warehouse` | Text | `507f1f77bcf86cd799439013` |
| `locationType` | Text | `warehouse` |
| `payments` | Text | `[{"method":"cash","amount":500}]` |
| `purchaseDate` | Text | `2024-01-15` |
| `notes` | Text | `Purchase order for premium cigarettes` |

### Items Array Format (with subCategory)

```json
[
  {
    "product": "507f1f77bcf86cd799439030",
    "subCategory": "507f1f77bcf86cd799439020",
    "quantity": 10,
    "purchaseRate": 50,
    "retailRate": 75,
    "wholesaleRate": 60
  },
  {
    "product": "507f1f77bcf86cd799439031",
    "subCategory": "507f1f77bcf86cd799439021",
    "quantity": 5,
    "purchaseRate": 40,
    "retailRate": 60,
    "wholesaleRate": 50
  }
]
```

**Note:** The `subCategory` field in purchase items is optional. If not provided, it will be automatically populated from the product's subCategory.

### Success Response (201 Created)
```json
{
  "status": "success",
  "data": {
    "_id": "507f1f77bcf86cd799439040",
    "user": "507f1f77bcf86cd799439019",
    "items": [
      {
        "product": "507f1f77bcf86cd799439030",
        "subCategory": "507f1f77bcf86cd799439020",
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
    "totalAmount": 500,
    "totalQuantity": 10,
    "invoiceNumber": "PUR-2024-01-0001",
    "purchaseDate": "2024-01-15T00:00:00.000Z",
    "status": "completed",
    "createdAt": "2024-01-15T12:30:00.000Z",
    "updatedAt": "2024-01-15T12:30:00.000Z"
  }
}
```

---

## 9. Update Product with SubCategory

### Endpoint
```
PUT /api/products/:id
```

### Headers
```
Authorization: Bearer <your_token>
Content-Type: application/json
```

### Request Body Example

```json
{
  "subCategory": "507f1f77bcf86cd799439020",
  "retailRate": 80
}
```

**Note:** When updating a product's subCategory, the system validates that the subCategory belongs to the product's category.

### Success Response (200 OK)
```json
{
  "status": "success",
  "data": {
    "_id": "507f1f77bcf86cd799439030",
    "name": "Marlboro Gold",
    "category": "507f1f77bcf86cd799439011",
    "subCategory": "507f1f77bcf86cd799439020",
    "retailRate": 80,
    "updatedAt": "2024-01-16T10:00:00.000Z"
  }
}
```

---

## Complete Example: Full Workflow

### Step 1: Create Category
```
POST /api/categories
```
```json
{
  "name": "Tobacco Products",
  "description": "All tobacco-related products"
}
```

### Step 2: Create SubCategory
```
POST /api/subcategories
```
```json
{
  "name": "Premium Cigarettes",
  "category": "507f1f77bcf86cd799439011",
  "description": "High-end premium cigarette brands"
}
```

### Step 3: Create Product with SubCategory
```
POST /api/products
```
```json
{
  "name": "Marlboro Gold",
  "category": "507f1f77bcf86cd799439011",
  "subCategory": "507f1f77bcf86cd799439020",
  "supplier": "507f1f77bcf86cd799439012",
  "warehouse": "507f1f77bcf86cd799439013",
  "purchaseRate": 50,
  "retailRate": 75,
  "wholesaleRate": 60,
  "countInStock": 100
}
```

### Step 4: Create Purchase (subCategory auto-populated from product)
```
POST /api/purchases
```
```json
{
  "items": [
    {
      "product": "507f1f77bcf86cd799439030",
      "quantity": 10,
      "purchaseRate": 50,
      "retailRate": 75,
      "wholesaleRate": 60
    }
  ],
  "supplier": "507f1f77bcf86cd799439012",
  "warehouse": "507f1f77bcf86cd799439013",
  "locationType": "warehouse",
  "payments": [
    {
      "method": "cash",
      "amount": 500
    }
  ]
}
```

---

## Validation Rules

1. **SubCategory Name**: Must be unique within the same category
   - Error: "SubCategory with this name already exists in this category"

2. **Category Reference**: Must be a valid Category ID
   - Error: "Invalid category"

3. **Product SubCategory**: When creating/updating a product with subCategory:
   - The subCategory must exist
   - The subCategory must belong to the product's category
   - Error: "SubCategory does not belong to the provided category"

4. **Purchase Items**: The subCategory field in purchase items is optional
   - If not provided, it will be auto-populated from the product
   - If provided, it should match the product's subCategory (best practice)

---

## Error Responses

### 400 Bad Request
```json
{
  "status": "fail",
  "message": "Please enter subcategory name"
}
```

```json
{
  "status": "fail",
  "message": "Please select a category"
}
```

```json
{
  "status": "fail",
  "message": "SubCategory with this name already exists in this category"
}
```

```json
{
  "status": "fail",
  "message": "SubCategory does not belong to the provided category"
}
```

### 404 Not Found
```json
{
  "status": "fail",
  "message": "SubCategory not found"
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

## Notes

1. **Unique Constraint**: SubCategory names are unique per category. The same name can exist in different categories.

2. **Auto-Population**: In purchase items, if `subCategory` is not provided, it will be automatically fetched from the product's subCategory field.

3. **Relationships**:
   - SubCategory belongs to one Category
   - Products can have one SubCategory (optional)
   - Purchase Items can store SubCategory (auto-populated from product)

4. **Soft Delete**: Consider implementing soft delete by setting `isActive: false` instead of hard deleting.

5. **ObjectIds**: Replace all example ObjectIds (like `507f1f77bcf86cd799439011`) with actual IDs from your database.

---

## Common ObjectIds You'll Need

Before testing, ensure you have:
- **Category**: Create via `/api/categories` first
- **SubCategory**: Requires a valid Category ID
- **Product**: Can optionally include SubCategory
- **Purchase**: SubCategory is auto-populated from Product if not provided

