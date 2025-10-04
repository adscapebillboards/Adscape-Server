const express = require('express');
const router = express.Router();
const {
  updateCampaignStatus,
  updateAllCampaignsStatus,
  getCampaignStatus
} = require('../controllers/campaignStatusController');

// Update campaign status by date for a specific campaign
router.put('/campaigns/:campaignId/status', updateCampaignStatus);

// Update all campaigns status by date
router.put('/campaigns/status/batch', updateAllCampaignsStatus);

// Get campaign status summary
router.get('/campaigns/:campaignId/status', getCampaignStatus);

module.exports = router;








