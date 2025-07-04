const express = require('express');
const router = express.Router();
const { 
  createSalesJourney, 
  getSalesJourneyBySaleId, 
  getSalesJourneys,
  getSalesJourneyById
} = require('../controllers/salesJourneyController');
const { protect, admin } = require('../middlewares/authMiddleware');

// Create sales journey record
router.post('/', protect, createSalesJourney);

// Get all sales journey records with pagination and filtering
router.get('/', protect, getSalesJourneys);

// Get sales journey record by ID
router.get('/:id', protect, getSalesJourneyById);

// Get all sales journey records for a specific sale
router.get('/sale/:saleId', protect, getSalesJourneyBySaleId);

module.exports = router; 