# Node.js MVC API with MongoDB

A RESTful API built with Node.js, Express, and MongoDB using MVC architecture.

## Features

- User authentication with JWT
- CRUD operations for users and products
- MVC architecture
- MongoDB database with Mongoose ODM
- Input validation
- Error handling
- API compression
- CORS enabled (allow all origins)

## Project Structure

```
backend/
  ├── config/
  │   └── db.js
  ├── controllers/
  │   ├── userController.js
  │   └── productController.js
  ├── middlewares/
  │   └── authMiddleware.js
  ├── models/
  │   ├── userModel.js
  │   └── productModel.js
  ├── routes/
  │   ├── userRoutes.js
  │   └── productRoutes.js
  ├── .env
  ├── app.js
  ├── package.json
  └── README.md
```

## Installation

1. Clone the repository
2. Install dependencies: `npm install`
3. Create a `.env` file in the root directory with the following variables:
   ```
   PORT=5000
   MONGODB_URI=mongodb://localhost:27017/myapp
   JWT_SECRET=your_jwt_secret
   NODE_ENV=development
   ```
4. Run the server: `npm start`

## API Endpoints

### Users

- `POST /api/users` - Register a new user
- `POST /api/users/login` - Login user
- `GET /api/users/profile` - Get user profile (protected)
- `PUT /api/users/profile` - Update user profile (protected)
- `GET /api/users` - Get all users (admin only)
- `DELETE /api/users/:id` - Delete user (admin only)

### Products

- `GET /api/products` - Get all products
- `GET /api/products/:id` - Get single product
- `POST /api/products` - Create a product (admin only)
- `PUT /api/products/:id` - Update a product (admin only)
- `DELETE /api/products/:id` - Delete a product (admin only)
- `POST /api/products/:id/reviews` - Create product review (protected)

## Technologies Used

- Node.js
- Express
- MongoDB
- Mongoose
- JWT Authentication
- bcryptjs
- dotenv
- cors
- compression
- morgan 