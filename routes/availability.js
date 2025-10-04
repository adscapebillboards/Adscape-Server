const express = require('express');
const router = express.Router();
const { getBillboardAvailability, getAvailabilitySummaryByDate } = require('../controllers/availabilityController');

// Billboard-specific availability
router.get('/billboards/:billboardId/availability', getBillboardAvailability);

// Admin summary by date
router.get('/availability/summary', getAvailabilitySummaryByDate);

module.exports = router;




