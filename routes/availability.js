const express = require('express');
const router = express.Router();
const { getBillboardAvailability, getAvailabilitySummaryByDate, getBillboardSlots } = require('../controllers/availabilityController');

// Billboard-specific availability
router.get('/billboards/:billboardId/availability', getBillboardAvailability);

// Billboard slots in simple JSON format { "DD.MM.YYYY": available_slots }
router.get('/billboards/:billboardId/slots', getBillboardSlots);

// Admin summary by date
router.get('/availability/summary', getAvailabilitySummaryByDate);

module.exports = router;




