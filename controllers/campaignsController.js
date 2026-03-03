const prisma = require('../db/db');
const logger = require('../config/logger');

const createCampaign = async (req, res) => {
  try {
    const { billboards } = req.body;
    const user = req.user; // From getUserInfo middleware

    // Calculate total amount
    const totalAmount = billboards.reduce((sum, b) => {
      const days = (new Date(b.endDate) - new Date(b.startDate)) / (1000 * 60 * 60 * 24) + 1;
      return sum + (days * b.pricePerDay);
    }, 0);

    // Get start and end dates from billboards
    const startDate = new Date(Math.min(...billboards.map(b => new Date(b.startDate))));
    const endDate = new Date(Math.max(...billboards.map(b => new Date(b.endDate))));

    // Enrich each billboard with campaign information
    const enrichedBillboards = billboards.map(billboard => {
      // Calculate total price for this billboard
      const days = (new Date(billboard.endDate) - new Date(billboard.startDate)) / (1000 * 60 * 60 * 24) + 1;
      const totalPrice = days * billboard.pricePerDay;

      // Extract asset scheduling information
      const assetScheduling = billboard.assetScheduling || {};
      const assetStartDate = assetScheduling.assetStartDate || billboard.bookingDetails?.startDate;
      const assetEndDate = assetScheduling.assetEndDate || billboard.bookingDetails?.endDate;
      const duration = assetScheduling.duration || 15; // Default 15 seconds

      return {
        ...billboard,
        totalPrice, // Add total price for this billboard
        // Campaign-related information for each billboard
        userName: user.email,
        status: "PENDING",
        createDate: (() => {
          const { getISTTimestamp } = require('../utils/timeUtils');
          return getISTTimestamp();
        })(),
        endDate: billboard.endDate,
        billboardCampaignId: `${Date.now()}_${billboard.id}`, // Generate unique billboard campaign ID
        // Asset scheduling information
        assetScheduling: {
          assetStartDate,
          assetEndDate,
          duration
        },
        // Keep all existing billboard details
      };
    });

    const campaign = await prisma.campaign.create({
      data: {
        userName: user.email,
        campaignName: "Auto Campaign",
        status: "PENDING",
        totalAmount: totalAmount,
        startDate: startDate,
        endDate: endDate,
        billboards: enrichedBillboards // Store enriched billboards
      }
    });

    const pushNotificationService = require('../services/pushNotificationService');
    pushNotificationService.notifyAdmin(
      'New campaign submitted',
      `Campaign "Auto Campaign" by ${user.email} is waiting for approval.`,
      '/#/bookings'
    ).catch(e => logger.warn('Push notify failed after campaign create:', e?.message));

    logger.campaign('Campaign created successfully', `Campaign ID: ${campaign.id}, User: ${user.email}`);
    res.status(201).json({ message: 'Campaign created successfully', campaign });
  } catch (err) {
    logger.error('Error creating campaign:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

const getUserCampaigns = async (req, res) => {
  try {
    const user = req.user; // From getUserInfo middleware

    let whereClause = {};

    // Role-based filtering
    if (user.role === 'superadmin') {
      // Superadmin can see all campaigns
      whereClause = {};
    } else {
      // Publishers and users can only see their own campaigns
      whereClause = {
        userName: user.email
      };
    }

    const campaigns = await prisma.campaign.findMany({
      where: whereClause,
      orderBy: {
        createdAt: 'desc'
      }
    });

    logger.campaign(`Campaigns fetched for ${user.role}`, `User: ${user.email}, Count: ${campaigns.length}`, { role: user.role });
    res.json(campaigns);
  } catch (err) {
    logger.error('Get campaigns error:', err);
    res.status(500).json({ message: 'Failed to retrieve campaigns' });
  }
};

// Update individual billboard status within a campaign
const updateBillboardStatus = async (req, res) => {
  const { campaignId, billboardId } = req.params;
  const { status } = req.body;

  try {
    // Fetch the campaign
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId }
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Parse billboards if it's a JSON string
    let billboards = campaign.billboards;
    if (typeof billboards === 'string') {
      try {
        billboards = JSON.parse(billboards);
      } catch (parseError) {
        logger.error('Error parsing billboards JSON:', parseError);
        return res.status(500).json({ error: 'Invalid billboards data' });
      }
    }

    // Find and update the specific billboard status
    const billboardIndex = billboards.findIndex(b => b.id === billboardId);
    if (billboardIndex === -1) {
      return res.status(404).json({ error: 'Billboard not found in campaign' });
    }

    // Update the billboard status
    billboards[billboardIndex].status = status;
    billboards[billboardIndex].updatedAt = new Date().toISOString();

    // Update the campaign with modified billboards
    const updatedCampaign = await prisma.campaign.update({
      where: { id: campaignId },
      data: { billboards }
    });

    // Note: Slot generation is now only done after payment completion, not on approval
    // This ensures slots are only created when payment is confirmed
    if (status === 'APPROVED') {
      logger.campaign('Billboard approved', `Campaign ID: ${campaignId}, Billboard ID: ${billboardId}`);
      logger.info('⚠️  Slot generation will occur after payment completion, not on approval');
    }

    // Check if all billboards are now approved
    const allBillboardsApproved = billboards.every(b => b.status?.toUpperCase() === 'APPROVED');

    logger.info(`🔍 Campaign approval status check:`, {
      campaignId,
      allBillboardsApproved,
      totalBillboards: billboards.length,
      approvedCount: billboards.filter(b => b.status?.toUpperCase() === 'APPROVED').length,
      billboardStatuses: billboards.map(b => ({ id: b.id, status: b.status }))
    });

    if (allBillboardsApproved) {
      logger.info(`🎉 All billboards are now approved! Updating campaign status...`);

      try {
        // Update campaign status to APPROVED
        const campaignWithApprovedStatus = await prisma.campaign.update({
          where: { id: campaignId },
          data: {
            status: 'APPROVED',
            updatedAt: new Date()
          }
        });

        logger.info(`✅ Campaign status updated to: ${campaignWithApprovedStatus.status}`);

        // Note: Slot generation is now only done after payment completion, not on approval
        // This ensures slots are only created when payment is confirmed
        logger.info('⚠️  Slot generation will occur after payment completion, not on approval');

        // Update user metrics
        if (campaign.owner) {
          logger.info(`👤 Updating user statistics for: ${campaign.owner}`);
          await updateUserStatistics(campaign.owner, campaign.totalAmount);
        } else {
          logger.warn(`⚠️ No owner found for campaign ${campaignId}, skipping user statistics update`);
        }

      } catch (campaignUpdateError) {
        logger.error('❌ Error updating campaign status:', campaignUpdateError);
      }
    }

    logger.campaign('Billboard status updated', `Campaign ID: ${campaignId}, Billboard ID: ${billboardId}, Status: ${status}`);
    res.json({
      message: 'Billboard status updated successfully',
      campaign: updatedCampaign,
      updatedBillboard: billboards[billboardIndex]
    });
  } catch (err) {
    logger.error('Error updating billboard status:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

// Generate slots for a specific billboard
const generateSlotsForBillboard = async (campaignId, billboard) => {
  try {
    const billboardId = billboard.id;
    const assetUrl = billboard.files?.[0];
    const screen_id = billboard.screen_id;
    const { startDate, endDate } = billboard.bookingDetails;

    logger.info(`Generating slots for billboard ${billboardId}:`, {
      assetUrl,
      screen_id,
      startDate,
      endDate,
      files: billboard.files
    });

    if (!startDate || !endDate || !assetUrl) {
      logger.warn(`Missing data for billboard ${billboardId}:`, {
        hasStartDate: !!startDate,
        hasEndDate: !!endDate,
        hasAssetUrl: !!assetUrl
      });
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    // Generate slots for each day in the booking period
    for (
      let current = new Date(start);
      current <= end;
      current.setDate(current.getDate() + 1)
    ) {
      const dateStr = current.toISOString().slice(0, 10);
      // Skip if this campaign already created a slot for this billboard on this day
      const existingForCampaign = await prisma.generatedSlot.findFirst({
        where: {
          billboardId,
          campaignId,
          startDate: {
            gte: new Date(`${dateStr}T00:00:00Z`),
            lte: new Date(`${dateStr}T23:59:59Z`)
          }
        }
      });
      if (existingForCampaign) {
        logger.slot(`Skipped: campaign ${campaignId} already has a slot for billboard ${billboardId} on ${dateStr}`);
        continue;
      }

      // Enforce max 8 slots per billboard per day overall
      const totalSlotsThisDay = await prisma.generatedSlot.count({
        where: {
          billboardId,
          startDate: {
            gte: new Date(`${dateStr}T00:00:00Z`),
            lte: new Date(`${dateStr}T23:59:59Z`)
          }
        }
      });
      if (totalSlotsThisDay >= 8) {
        logger.slot(`Skipped: billboard ${billboardId} already has 8 slots on ${dateStr}`);
        continue;
      }

      const slotNumber = totalSlotsThisDay + 1;
      const slotStart = new Date(`${dateStr}T00:00:00Z`);
      const slotEnd = new Date(`${dateStr}T23:59:59Z`);

      const durationSeconds = (() => {
        const d = billboard.assetScheduling?.duration || billboard.adDuration || 15;
        const n = Number(d);
        return Number.isFinite(n) && n > 0 ? n : 15;
      })();

      await prisma.generatedSlot.create({
        data: {
          campaignId,
          billboardId,
          assetUrl,
          startDate: slotStart,
          endDate: slotEnd,
          duration: durationSeconds,
          slotNumber,
          screenId: screen_id
        }
      });

      logger.slot(`Slot #${slotNumber} created for billboard ${billboardId} on ${dateStr}`);
    }

    logger.info(`Slot generation completed for billboard ${billboardId}`);
  } catch (error) {
    logger.error(`Error generating slots for billboard ${billboard.id}:`, error);
    throw error;
  }
};

// Generate slots for all approved billboards in a campaign
const generateSlotsForCampaign = async (campaignId, billboards) => {
  try {
    logger.info(`🎬 Generating slots for campaign ${campaignId} with ${billboards.length} billboards`);

    const approvedBillboards = billboards.filter(b => b.status?.toUpperCase() === 'APPROVED');
    logger.info(`📋 Found ${approvedBillboards.length} approved billboards`);

    for (const billboard of approvedBillboards) {
      try {
        await generateSlotsForBillboard(campaignId, billboard);
      } catch (error) {
        logger.error(`❌ Error generating slots for billboard ${billboard.id}:`, error);
        // Continue with other billboards
      }
    }

    logger.info(`🎉 Slot generation completed for campaign ${campaignId}`);
  } catch (error) {
    logger.error(`❌ Error generating slots for campaign ${campaignId}:`, error);
    throw error;
  }
};

// Update user statistics when a campaign is approved
const updateUserStatistics = async (userEmail, campaignAmount) => {
  try {
    // Check if userEmail is provided
    if (!userEmail) {
      logger.warn(`⚠️ No user email provided for statistics update`);
      return;
    }

    logger.info(`👤 Updating user statistics for ${userEmail} with amount ${campaignAmount}`);

    // Find the user by email
    const user = await prisma.user.findUnique({
      where: { email: userEmail }
    });

    if (!user) {
      logger.warn(`⚠️ User not found: ${userEmail}`);
      return;
    }

    // Calculate new totals
    const currentTotalSpent = parseFloat(user.totalspent || '0');
    const newTotalSpent = currentTotalSpent + parseFloat(campaignAmount || 0);
    const currentTotalBookings = user.totalbookings || 0;
    const newTotalBookings = currentTotalBookings + 1;

    // Update user statistics
    await prisma.user.update({
      where: { id: user.id },
      data: {
        totalbookings: newTotalBookings,
        lastbooking: new Date(),
        totalspent: newTotalSpent.toString(),
        status: 'active'
      }
    });

    logger.info(`✅ User statistics updated for ${userEmail}:`, {
      newTotalBookings,
      newTotalSpent,
      previousTotalSpent: currentTotalSpent,
      addedAmount: campaignAmount
    });
  } catch (error) {
    logger.error(`❌ Error updating user statistics for ${userEmail}:`, error);
  }
};

// Get campaign with individual billboard statuses
const getCampaignWithBillboardStatuses = async (req, res) => {
  const { id } = req.params;

  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id }
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Parse billboards if it's a JSON string
    let billboards = campaign.billboards;
    if (typeof billboards === 'string') {
      try {
        billboards = JSON.parse(billboards);
      } catch (parseError) {
        logger.error('Error parsing billboards JSON:', parseError);
        return res.status(500).json({ error: 'Invalid billboards data' });
      }
    }

    // Get slot counts for each billboard
    const billboardsWithSlotCounts = await Promise.all(
      billboards.map(async (billboard) => {
        const slotCount = await prisma.generatedSlot.count({
          where: {
            billboardId: billboard.id,
            campaignId: id
          }
        });

        return {
          ...billboard,
          slotCount,
          canGenerateSlots: billboard.status === 'APPROVED' && slotCount === 0
        };
      })
    );

    const campaignWithBillboardStatuses = {
      ...campaign,
      billboards: billboardsWithSlotCounts
    };

    logger.campaign('Campaign with billboard statuses fetched', `Campaign ID: ${id}`);
    res.json(campaignWithBillboardStatuses);
  } catch (err) {
    logger.error('Error fetching campaign with billboard statuses:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};


const updateCampaignName = async (req, res) => {
  try {
    const { campaignId, campaignName } = req.body;

    if (!campaignId || !campaignName) {
      return res.status(400).json({ message: 'Campaign ID and name are required' });
    }

    const campaign = await prisma.campaign.update({
      where: { id: campaignId },
      data: { campaignName }
    });

    logger.campaign('Campaign name updated', `Campaign ID: ${campaignId}, New name: ${campaignName}`);
    res.status(200).json({ message: 'Campaign name updated successfully', campaign });
  } catch (err) {
    logger.error('Update campaign name error:', err);
    res.status(500).json({ message: 'Failed to update campaign name' });
  }
};

module.exports = {
  createCampaign,
  getUserCampaigns,
  updateCampaignName,
  updateBillboardStatus,
  generateSlotsForBillboard,
  generateSlotsForCampaign,
  updateUserStatistics,
  getCampaignWithBillboardStatuses
};