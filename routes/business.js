const express = require('express');
const router = express.Router();
const businessController = require('../controllers/businessController');
const auth = require('../middleware/auth');

// Business profile routes (protected)
router.post('/business-profile', auth, businessController.updateBusinessProfile);
router.get('/business-profiler', auth, businessController.getBusinessProfile);

module.exports = router; 