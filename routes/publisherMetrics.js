const express = require('express');
const router = express.Router();
const publisherMetricController = require('../controllers/publisherMetricController');
const auth = require('../middleware/auth');
const roleAuth = require('../middleware/roleAuth');

// Get publisher metrics by ID
router.get('/:publisherId', auth, publisherMetricController.getPublisherMetrics);

// Create or update publisher metrics
router.post('/upsert', auth, publisherMetricController.upsertPublisherMetrics);

// Get dashboard data for a publisher
router.get('/:publisherId/dashboard', auth, publisherMetricController.getPublisherDashboard);

// Update publisher settings
router.put('/:publisherId/settings', auth, publisherMetricController.updatePublisherSettings);

// Get all publisher metrics (admin only)
router.get('/', auth, roleAuth(['superadmin']), publisherMetricController.getAllPublisherMetrics);

module.exports = router;





