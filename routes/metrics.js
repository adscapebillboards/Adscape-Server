const express = require('express');
const router = express.Router();
const metricsController = require('../controllers/metricsController');
const auth = require('../middleware/auth');
const roleAuth = require('../middleware/roleAuth');

// Campaign metrics
router.get('/campaign-metrics/:campaignId', metricsController.getCampaignMetrics);

// Admin dashboard stats
router.get('/admin-dashboard-stats', metricsController.getAdminDashboardStats);
router.get('/admin-top-performers', metricsController.getTopPerformingBillboards);
router.get('/admin-revenue-series', metricsController.getAdminRevenueSeries);
router.get('/admin-publisher-data', metricsController.getPublisherDataTable);

// Publisher notifications
router.get('/publisher-bookings', auth, metricsController.getPublisherBookings);

// Location data
router.get('/states', metricsController.getStates);
router.get('/city', metricsController.getCitiesByState);
router.get('/availability', metricsController.checkAvailability);

module.exports = router; 