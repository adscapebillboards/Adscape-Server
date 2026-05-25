const prisma = require('../db/db');
const logger = require('../config/logger');
const { isSuperAdminRole } = require('../utils/roles');
const { generateSlots: sharedGenerateSlots } = require('../utils/slotGenerator');
const { flattenGeneratedSlotRecords } = require('../utils/generatedSlotFormat');
const { recomputeAndUpsertForRange, ensureDefaultAvailabilityForTwoMonths, updateBillboardSlotAvailabilityJSON } = require('./availabilityController');

const createCampaign = async (req, res) => {
  try {
    const user = req.user; // From getUserInfo middleware
    const isOffline = req.body.isOffline === 'true' || req.body.billboardId;

    if (isOffline) {
      const { campaignName, billboardId, startDate, endDate, totalAmount, status, paymentStatus } = req.body;
      const { v4: uuidv4 } = require('uuid');
      const cloudinary = require('../config/cloudinary');

      const streamUpload = (fileBuffer) => {
        return new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { resource_type: 'auto' },
            (error, result) => {
              if (error) return reject(error);
              resolve(result.secure_url);
            }
          );
          stream.end(fileBuffer);
        });
      };

      const fileUrls = [];
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          try {
            const url = await streamUpload(file.buffer);
            fileUrls.push(url);
          } catch (uploadErr) {
            logger.error('Cloudinary upload error in offline campaign:', uploadErr);
          }
        }
      }

      const dbBillboard = await prisma.billboard.findUnique({
        where: { id: billboardId }
      });
      if (!dbBillboard) {
        return res.status(404).json({ error: 'Billboard not found' });
      }

      const parsedStartDate = new Date(startDate);
      const parsedEndDate = new Date(endDate);
      const days = Math.ceil((parsedEndDate.getTime() - parsedStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const parsedTotalAmount = parseFloat(totalAmount) || (days * dbBillboard.pricePerDay);

      const campaignId = uuidv4();
      const { getISTTimestamp } = require('../utils/timeUtils');

      const finalFileUrls = fileUrls.length > 0
        ? fileUrls
        : (dbBillboard.images && dbBillboard.images.length > 0 ? [dbBillboard.images[0]] : []);

      const enrichedBillboards = [{
        id: dbBillboard.id,
        location: dbBillboard.location,
        city: dbBillboard.city,
        pricePerDay: dbBillboard.pricePerDay,
        totalPrice: parsedTotalAmount,
        bookingDetails: {
          startDate,
          endDate
        },
        files: finalFileUrls,
        images: dbBillboard.images || [],
        owner: dbBillboard.userId || dbBillboard.owner,
        screen_id: dbBillboard.screenId || dbBillboard.screen_id,
        userName: user.email,
        status: 'APPROVED',
        createDate: getISTTimestamp(),
        endDate,
        billboardCampaignId: `${campaignId}_${dbBillboard.id}`,
        assetScheduling: {
          assetStartDate: startDate,
          assetEndDate: endDate,
          duration: 15
        }
      }];

      const { parseDateAsUTC } = require('../utils/timeUtils');
      const campaign = await prisma.campaign.create({
        data: {
          id: campaignId,
          userName: user.email,
          campaignName: campaignName || "Offline Campaign",
          status: status || "APPROVED",
          totalAmount: parsedTotalAmount,
          startDate: parseDateAsUTC(startDate),
          endDate: parseDateAsUTC(endDate),
          billboards: enrichedBillboards,
          assets: finalFileUrls.map(url => ({ billboardId: dbBillboard.id, url }))
        }
      });

      // For offline campaigns, always auto-approve and pre-schedule/activate the campaign, triggering direct slot generation immediately
      if (isOffline || status === 'PAYMENT_COMPLETED' || paymentStatus === 'paid') {
        let finalStatus = 'SCHEDULED';
        const now = new Date();
        const start = new Date(startDate);
        if (!isNaN(start.getTime()) && now >= start) {
          finalStatus = 'LIVE';
        }

        await prisma.campaign.update({
          where: { id: campaignId },
          data: { status: finalStatus }
        });

        try {
          const toISTDateString = (d) => {
            if (!d) return null;
            const dt = new Date(d);
            const ist = dt.toLocaleString('en-US', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
            const [m, day, y] = ist.split('/');
            return `${y}-${m}-${day}`;
          };

          const campaignStartStr = toISTDateString(startDate);
          const campaignEndStr = toISTDateString(endDate);

          const slotBillboards = enrichedBillboards.map(bb => ({
            ...bb,
            bookingDetails: {
              startDate: bb.bookingDetails?.startDate || campaignStartStr,
              endDate: bb.bookingDetails?.endDate || campaignEndStr,
            },
            startDate: bb.bookingDetails?.startDate || campaignStartStr,
            endDate: bb.bookingDetails?.endDate || campaignEndStr,
          }));

          await sharedGenerateSlots({
            id: campaignId,
            billboards: slotBillboards,
            startDate: parseDateAsUTC(startDate),
            endDate: parseDateAsUTC(endDate),
            campaignName: campaignName || "Offline Campaign"
          });
          logger.info(`✅ Slots auto-generated for offline campaign ${campaignId} during creation`);
        } catch (slotGenError) {
          logger.error('Error generating slots for offline campaign during creation:', slotGenError.message);
        }
      }

      // Automatically update the slot availability cache for the offline booking immediately
      try {
        await ensureDefaultAvailabilityForTwoMonths(String(dbBillboard.id));
        await recomputeAndUpsertForRange(String(dbBillboard.id), startDate, endDate);
        await updateBillboardSlotAvailabilityJSON(String(dbBillboard.id));
        logger.info(`✅ Availability cache updated successfully for offline campaign billboard ${dbBillboard.id}`);
      } catch (availError) {
        logger.error(`Failed to update availability cache for offline campaign billboard ${dbBillboard.id}:`, availError.message);
      }

      logger.campaign('Offline campaign created successfully', `Campaign ID: ${campaign.id}, User: ${user.email}`);
      return res.status(201).json({ message: 'Campaign created successfully', campaign });
    }

    // --- Regular JSON Campaign Flow ---
    const { billboards } = req.body;

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
    if (isSuperAdminRole(user.role)) {
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
    try {
      const { persistError } = require('../services/errorLogService');
      persistError({
        level: 'error',
        message: err?.message || 'Get campaigns error',
        stack: err?.stack || null,
        method: req.method,
        path: req.originalUrl || req.url,
        statusCode: 500,
        userId: req.user?.id,
        userEmail: req.user?.email,
        meta: { name: err?.name, code: err?.code, meta: err?.meta, clientVersion: err?.clientVersion },
      }).catch(() => { });
    } catch { }
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
            updatedAt: new Date(),
            approvedByEmail: req.user?.email || null,
            approvedByRole: req.user?.role || null
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
    await sharedGenerateSlots({
      id: campaignId,
      billboards: [billboard]
    });

    logger.info(`Slot generation completed for billboard ${billboard.id}`);
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
    const generatedSlotRecord = await prisma.generatedSlot.findUnique({
      where: { campaignId: String(id) }
    });
    const flatGeneratedSlots = flattenGeneratedSlotRecords(generatedSlotRecord ? [generatedSlotRecord] : []);
    const billboardsWithSlotCounts = await Promise.all(
      billboards.map(async (billboard) => {
        const slotCount = flatGeneratedSlots.filter(slot => String(slot.billboardId) === String(billboard.id)).length;

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
