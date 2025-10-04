const prisma = require('../db/db');
const logger = require('../config/logger');
const { getCurrentISTTime, convertUTCToIST, getStartOfDayIST, getEndOfDayIST } = require('../utils/timeUtils');

// Function to update campaign status based on start and end dates
const updateCampaignStatusByDate = async (campaignId) => {
  try {
    logger.info(`Updating campaign status by date for campaign: ${campaignId}`);
    
    // Get campaign with billboards (stored as JSON)
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId }
    });

    if (!campaign) {
      logger.error(`Campaign not found: ${campaignId}`);
      return null;
    }

    // Parse billboards from JSON
    let billboards = [];
    if (campaign.billboards && typeof campaign.billboards === 'string') {
      try {
        billboards = JSON.parse(campaign.billboards);
      } catch (error) {
        logger.error(`Error parsing billboards JSON for campaign ${campaignId}:`, error);
        return null;
      }
    } else if (Array.isArray(campaign.billboards)) {
      billboards = campaign.billboards;
    }

    if (!Array.isArray(billboards)) {
      logger.warn(`No valid billboards found for campaign ${campaignId}`);
      return null;
    }

    const now = getCurrentISTTime(); // Use IST time instead of UTC
    let campaignStatus = campaign.status;
    let updatedBillboards = [];
    let hasChanges = false;

    // Check each billboard's booking dates
    for (let i = 0; i < billboards.length; i++) {
      const billboard = billboards[i];
      
      if (!billboard.bookingDetails) {
        logger.warn(`No booking details found for billboard: ${billboard.id}`);
        continue;
      }

      const startDate = convertUTCToIST(billboard.bookingDetails.startDate);
      const endDate = convertUTCToIST(billboard.bookingDetails.endDate);
      let billboardStatus = billboard.status;

      // Determine billboard status based on dates (using IST time)
      if (now < startDate) {
        billboardStatus = 'SCHEDULED';
      } else if (now >= startDate && now <= endDate) {
        billboardStatus = 'LIVE';
      } else if (now > endDate) {
        billboardStatus = 'COMPLETED';
      }

      // Update billboard status if it has changed
      if (billboardStatus !== billboard.status) {
        logger.info(`Updating billboard ${billboard.id} status from ${billboard.status} to ${billboardStatus}`);
        
        billboards[i].status = billboardStatus;
        updatedBillboards.push(billboard);
        hasChanges = true;
      }
    }

    // Determine overall campaign status based on billboard statuses
    const billboardStatuses = billboards.map(b => b.status);
    const hasLiveBillboards = billboardStatuses.includes('LIVE');
    const hasScheduledBillboards = billboardStatuses.includes('SCHEDULED');
    const allCompleted = billboardStatuses.every(status => status === 'COMPLETED');
    const allScheduled = billboardStatuses.every(status => status === 'SCHEDULED');

    let newCampaignStatus = campaignStatus;

    if (hasLiveBillboards) {
      newCampaignStatus = 'LIVE';
    } else if (allCompleted) {
      newCampaignStatus = 'COMPLETED';
    } else if (allScheduled) {
      newCampaignStatus = 'SCHEDULED';
    } else if (hasScheduledBillboards) {
      newCampaignStatus = 'SCHEDULED';
    }

    // Update campaign if there are changes
    if (hasChanges || newCampaignStatus !== campaign.status) {
      logger.info(`Updating campaign ${campaignId} status from ${campaign.status} to ${newCampaignStatus}`);
      
      const updateData = {
        status: newCampaignStatus
      };

      // Only update billboards if there were changes
      if (hasChanges) {
        updateData.billboards = billboards;
      }

      const updatedCampaign = await prisma.campaign.update({
        where: { id: campaignId },
        data: updateData
      });

      logger.campaign('Campaign status updated by date', `Campaign ID: ${campaignId}, New Status: ${newCampaignStatus}`);
      
      return {
        campaign: updatedCampaign,
        updatedBillboards,
        statusChanged: true
      };
    }

    return {
      campaign,
      updatedBillboards,
      statusChanged: false
    };

  } catch (error) {
    logger.error(`Error updating campaign status by date for ${campaignId}:`, error);
    throw error;
  }
};

// Function to update all campaigns status by date
const updateAllCampaignsStatusByDate = async () => {
  try {
    logger.info('Starting batch update of all campaigns status by date');
    
    // Get all campaigns
    const campaigns = await prisma.campaign.findMany();

    logger.info(`Found ${campaigns.length} campaigns to process`);

    const results = [];
    
    for (const campaign of campaigns) {
      try {
        const result = await updateCampaignStatusByDate(campaign.id);
        if (result) {
          results.push(result);
        }
      } catch (error) {
        logger.error(`Error processing campaign ${campaign.id}:`, error);
        results.push({
          campaignId: campaign.id,
          error: error.message,
          statusChanged: false
        });
      }
    }

    const statusChangedCount = results.filter(r => r.statusChanged).length;
    logger.info(`Batch update completed. ${statusChangedCount} campaigns had status changes out of ${campaigns.length} total campaigns`);

    return {
      totalCampaigns: campaigns.length,
      updatedCampaigns: statusChangedCount,
      results
    };

  } catch (error) {
    logger.error('Error in batch campaign status update:', error);
    throw error;
  }
};

// Function to get campaign status summary
const getCampaignStatusSummary = async (campaignId) => {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId }
    });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    // Parse billboards from JSON
    let billboards = [];
    if (campaign.billboards && typeof campaign.billboards === 'string') {
      try {
        billboards = JSON.parse(campaign.billboards);
      } catch (error) {
        logger.error(`Error parsing billboards JSON for campaign ${campaignId}:`, error);
        billboards = [];
      }
    } else if (Array.isArray(campaign.billboards)) {
      billboards = campaign.billboards;
    }

    const now = getCurrentISTTime(); // Use IST time instead of UTC
    const statusCounts = {
      SCHEDULED: 0,
      LIVE: 0,
      COMPLETED: 0,
      PENDING: 0,
      APPROVED: 0,
      REJECTED: 0
    };

    const billboardStatuses = billboards.map(billboard => {
      if (!billboard.bookingDetails) {
        statusCounts[billboard.status] = (statusCounts[billboard.status] || 0) + 1;
        return {
          id: billboard.id,
          status: billboard.status,
          dateBasedStatus: null
        };
      }

      const startDate = convertUTCToIST(billboard.bookingDetails.startDate);
      const endDate = convertUTCToIST(billboard.bookingDetails.endDate);
      let dateBasedStatus = null;

      if (now < startDate) {
        dateBasedStatus = 'SCHEDULED';
      } else if (now >= startDate && now <= endDate) {
        dateBasedStatus = 'LIVE';
      } else if (now > endDate) {
        dateBasedStatus = 'COMPLETED';
      }

      statusCounts[dateBasedStatus] = (statusCounts[dateBasedStatus] || 0) + 1;

      return {
        id: billboard.id,
        status: billboard.status,
        dateBasedStatus,
        startDate: billboard.bookingDetails.startDate,
        endDate: billboard.bookingDetails.endDate
      };
    });

    return {
      campaignId,
      campaignStatus: campaign.status,
      totalBillboards: billboards.length,
      statusCounts,
      billboardStatuses
    };

  } catch (error) {
    logger.error(`Error getting campaign status summary for ${campaignId}:`, error);
    throw error;
  }
};

// API endpoint to manually trigger status update for a specific campaign
const updateCampaignStatus = async (req, res) => {
  try {
    const { campaignId } = req.params;
    
    if (!campaignId) {
      return res.status(400).json({ error: 'Campaign ID is required' });
    }

    const result = await updateCampaignStatusByDate(campaignId);
    
    if (!result) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    res.json({
      success: true,
      message: 'Campaign status updated successfully',
      data: result
    });

  } catch (error) {
    logger.error('Error in updateCampaignStatus endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// API endpoint to manually trigger batch status update
const updateAllCampaignsStatus = async (req, res) => {
  try {
    const result = await updateAllCampaignsStatusByDate();
    
    res.json({
      success: true,
      message: 'All campaigns status updated successfully',
      data: result
    });

  } catch (error) {
    logger.error('Error in updateAllCampaignsStatus endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// API endpoint to get campaign status summary
const getCampaignStatus = async (req, res) => {
  try {
    const { campaignId } = req.params;
    
    if (!campaignId) {
      return res.status(400).json({ error: 'Campaign ID is required' });
    }

    const summary = await getCampaignStatusSummary(campaignId);
    
    res.json({
      success: true,
      data: summary
    });

  } catch (error) {
    logger.error('Error in getCampaignStatus endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  updateCampaignStatusByDate,
  updateAllCampaignsStatusByDate,
  getCampaignStatusSummary,
  updateCampaignStatus,
  updateAllCampaignsStatus,
  getCampaignStatus
};
