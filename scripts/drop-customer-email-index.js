// Script to drop unique index on customer email field if it exists
// Run this with: node scripts/drop-customer-email-index.js
// Or run directly in MongoDB shell: db.customers.dropIndex({ email: 1 })

const mongoose = require('mongoose');
require('dotenv').config();

const dropCustomerEmailIndex = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('customers');

    // Get all indexes
    const indexes = await collection.indexes();
    console.log('Current indexes:', indexes);

    // Check if unique index on email exists
    const emailIndex = indexes.find(
      (idx) => idx.key && idx.key.email === 1 && idx.unique === true
    );

    if (emailIndex) {
      console.log('Found unique index on email, dropping it...');
      await collection.dropIndex({ email: 1 });
      console.log('✅ Successfully dropped unique index on email field');
    } else {
      console.log('✅ No unique index found on email field - duplicates are already allowed');
    }

    await mongoose.connection.close();
    console.log('Connection closed');
  } catch (error) {
    if (error.code === 27) {
      // Index not found
      console.log('✅ No unique index found on email field - duplicates are already allowed');
    } else {
      console.error('Error:', error.message);
    }
    await mongoose.connection.close();
  }
};

dropCustomerEmailIndex();

