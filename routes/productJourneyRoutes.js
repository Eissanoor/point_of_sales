const express = require('express');
const router = express.Router();
const { 
  getProductJourneys, 
  getProductJourneyByProductId, 
  createProductJourney 
} = require('../controllers/productJourneyController');
const { protect, admin } = require('../middlewares/authMiddleware');

router.route('/')
  .get(protect, admin, getProductJourneys)
  .post(protect, admin, createProductJourney);

router.route('/:productId')
  .get(protect, admin, getProductJourneyByProductId);

module.exports = router; 