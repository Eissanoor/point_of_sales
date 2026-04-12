const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const {
  getSarafs,
  getSarafById,
  createSaraf,
  updateSaraf,
  deleteSaraf,
} = require('../controllers/sarafController');

router.route('/').get(protect, getSarafs).post(protect, createSaraf);

router
  .route('/:id')
  .get(protect, getSarafById)
  .put(protect, updateSaraf)
  .delete(protect, deleteSaraf);

module.exports = router;
