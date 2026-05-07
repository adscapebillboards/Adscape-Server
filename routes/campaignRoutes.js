
const express = require('express');
const router = express.Router();
const { 
  createCampaign, 
  getUserCampaigns, 
  updateCampaignName,
  updateBillboardStatus,
  getCampaignWithBillboardStatuses
} = require ('../controllers/campaignsController');
const auth = require('../middleware/auth');
const roleAuth = require('../middleware/roleAuth');


// POST /api/campaigns - Create a new campaign
router.post('/', auth, createCampaign);

// GET /api/campaigns - Get user's campaigns with role-based filtering
router.get('/', auth, getUserCampaigns);

// Update individual billboard status within a campaign
router.put('/:campaignId/billboards/:billboardId/status', auth, roleAuth(['superadmin']), updateBillboardStatus);

// Get campaign with individual billboard statuses
router.get('/:id/with-billboard-statuses', auth, getCampaignWithBillboardStatuses);

router.put('/update-campaign-name', auth, updateCampaignName);


module.exports = router;
