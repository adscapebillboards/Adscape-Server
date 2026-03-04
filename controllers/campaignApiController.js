const prisma = require('../db/db');
const logger = require('../config/logger');
const { recomputeAndUpsertForRange, ensureDefaultAvailabilityForTwoMonths, updateBillboardSlotAvailabilityJSON } = require('./availabilityController');
// Helper to convert various duration formats to seconds
function toSeconds(input) {
  if (!input) return 10;
  if (typeof input === 'number') return Math.max(1, Math.floor(input));
  if (typeof input === 'string') {
    // If it's numeric string
    if (/^\d+$/.test(input.trim())) return Math.max(1, parseInt(input.trim(), 10));
    // If it's HH:MM:SS
    const m = input.match(/^(\d{1,2}):(\d{1,2}):(\d{1,2})$/);
    if (m) {
      const h = parseInt(m[1], 10) || 0;
      const mm = parseInt(m[2], 10) || 0;
      const s = parseInt(m[3], 10) || 0;
      return Math.max(1, h * 3600 + mm * 60 + s);
    }
  }
  return 10;
}
const multer = require('multer');
const cloudinary = require('../config/cloudinary');
const { v4: uuidv4 } = require('uuid');
const EmailService = require('../services/emailService');
const pushNotificationService = require('../services/pushNotificationService');
// const { generateSlots } = require('../utils/slotGenerator');

// Multer is kept for any legacy use-cases but createCampaign no longer uses it
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB limit
    files: 50 // Allow up to 50 files
  }
});

// Campaign creation — JSON only, responds immediately without waiting for file uploads.
// Files are uploaded separately via tus-js-client and attached via POST /campaigns/:id/attach-file
const createCampaign = async (req, res) => {
  try {
    logger.info('Campaign create request body keys:', Object.keys(req.body));

    // Support both:
    //   1. JSON body (new fast path): { campaignName, userName, billboards, ... }
    //   2. Legacy multipart with req.body.data JSON string
    let campaignData;

    if (req.body.data) {
      try {
        campaignData = JSON.parse(req.body.data);
      } catch (parseError) {
        logger.error('Error parsing campaign data:', parseError);
        return res.status(400).json({ error: 'Invalid JSON data' });
      }
    } else if (req.body.billboards || req.body.campaignName) {
      let billboards = req.body.billboards;
      if (typeof billboards === 'string') {
        try { billboards = JSON.parse(billboards); } catch (e) {
          return res.status(400).json({ error: 'Invalid billboards JSON' });
        }
      }
      campaignData = {
        userName: req.body.userName,
        campaignName: req.body.campaignName,
        startDate: req.body.startDate,
        endDate: req.body.endDate,
        totalAmount: req.body.totalAmount,
        billboards
      };
    } else {
      return res.status(400).json({ error: 'Missing campaign data.' });
    }

    const { userName, billboards, campaignName } = campaignData;
    if (!userName || !billboards || !Array.isArray(billboards)) {
      return res.status(400).json({ error: 'Missing required fields: userName and billboards array' });
    }

    logger.campaign('Campaign creation started (async mode)', `User: ${userName}, Billboards: ${billboards.length}`);

    const campaignId = uuidv4();

    // Build billboard records WITHOUT waiting for file uploads — files: [] initially
    const enrichedBillboards = billboards.map((billboard) => {
      const billboardObj = billboard.billboard || billboard;
      const id = billboardObj.id || billboard.billboardId || billboard.id;

      let bookingDetails = billboard.bookingDetails || billboardObj.bookingDetails;
      if (!bookingDetails && (billboard.startDate || billboard.endDate)) {
        bookingDetails = { startDate: billboard.startDate, endDate: billboard.endDate };
      }

      if (!id || !bookingDetails || !bookingDetails.startDate || !bookingDetails.endDate) {
        throw new Error('Invalid billboard data structure: missing id or bookingDetails');
      }

      const { location, city, pricePerDay, owner } = billboardObj;
      const screen_id = billboardObj.screen_id || billboardObj.screenId || billboard.screen_id || billboard.screenId || null;
      const { startDate, endDate } = bookingDetails;

      const days = (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24) + 1;
      const totalPrice = days * (pricePerDay || billboardObj.pricePerDay || 0);

      const { getISTTimestamp } = require('../utils/timeUtils');
      return {
        id,
        location: location || billboardObj.location,
        city: city || billboardObj.city,
        pricePerDay: pricePerDay || billboardObj.pricePerDay,
        totalPrice,
        bookingDetails: { startDate, endDate },
        files: [], // Files will be attached asynchronously via /attach-file
        owner: owner || billboardObj.owner,
        screen_id,
        userName,
        status: 'PENDING',
        createDate: getISTTimestamp(),
        endDate,
        billboardCampaignId: `${campaignId}_${id}`,
        ...billboardObj,
        ...billboard
      };
    });

    // Use provided totalAmount or calculate
    const totalAmount = parseFloat(campaignData.totalAmount) || enrichedBillboards.reduce((sum, b) => {
      const days = (new Date(b.bookingDetails.endDate) - new Date(b.bookingDetails.startDate)) / (1000 * 60 * 60 * 24) + 1;
      return sum + (days * (b.pricePerDay || 0));
    }, 0);

    const startDate = enrichedBillboards[0]?.bookingDetails.startDate;
    const endDate = enrichedBillboards[0]?.bookingDetails.endDate;

    logger.info(`Campaign ${campaignId}: creating DB record with ${enrichedBillboards.length} billboards (files will be attached asynchronously)`);

    // Test database connection before attempting to save
    try {
      await prisma.$connect();
      logger.info('✅ Database connection verified');
    } catch (dbError) {
      logger.error('❌ Database connection failed:', dbError.message);
      logger.error('⚠️  Campaign cannot be saved. Please check database connectivity.');
      return res.status(503).json({
        error: 'Database unavailable',
        message: 'Cannot save campaign. Database server is unreachable. Please check your connection and try again.',
        details: 'The database server at adscape-database.postgres.database.azure.com:5432 cannot be reached. Please verify Azure firewall rules and network connectivity.'
      });
    }

    try {
      const { parseISTDate } = require('../utils/timeUtils');
      await prisma.campaign.create({
        data: {
          id: campaignId,
          userName,
          campaignName: campaignName || "Auto Campaign",
          status: "PENDING",
          totalAmount,
          startDate: parseISTDate(startDate),
          endDate: parseISTDate(endDate),
          billboards: enrichedBillboards
        }
      });
      logger.info('✅ Campaign saved to database successfully');
    } catch (dbSaveError) {
      logger.error('❌ Failed to save campaign to database:', dbSaveError.message);
      logger.error('Error code:', dbSaveError.code);
      logger.error('Error meta:', dbSaveError.meta);

      // Check if it's a connection error
      if (dbSaveError.code === 'P1001' || dbSaveError.message.includes('Can\'t reach database server')) {
        return res.status(503).json({
          error: 'Database connection failed',
          message: 'Cannot save campaign. Database server is unreachable.',
          details: 'Please check Azure firewall rules and ensure the database server is running.'
        });
      }

      // Re-throw other database errors
      throw dbSaveError;
    }

    // After create, initialize and update availability cache for involved billboards
    try {
      await Promise.all(enrichedBillboards.map(async (b) => {
        try {
          await ensureDefaultAvailabilityForTwoMonths(String(b.id));
          await recomputeAndUpsertForRange(String(b.id), b.bookingDetails?.startDate || startDate, b.bookingDetails?.endDate || endDate);
          // Update the slotAvailability JSON field on the billboard (stores 2 months in one JSON)
          await updateBillboardSlotAvailabilityJSON(String(b.id));
        } catch (innerError) {
          logger.error(`Failed to update availability for billboard ${b.id}:`, innerError.message);
        }
      }));
    } catch (e) {
      logger.warn('Availability upsert after campaign creation failed:', e.message);
    }

    // Notifications: to superadmin and campaign owner
    // Only create notifications if database is available
    try {
      // Test connection before creating notifications
      await prisma.$connect();

      await prisma.$executeRawUnsafe(
        "INSERT INTO notifications (recipient_role, type, title, message, entity_type, entity_id) VALUES ('superadmin', $1, $2, $3, $4, $5)",
        'CAMPAIGN_CREATED',
        'New campaign created',
        `Campaign ${campaignId} created by ${userName}`,
        'campaign',
        String(campaignId)
      );
      await prisma.$executeRawUnsafe(
        'INSERT INTO notifications (recipient_email, recipient_role, type, title, message, entity_type, entity_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        userName,
        'user',
        'CAMPAIGN_CREATED',
        'Campaign created',
        `Your campaign ${campaignId} has been created`,
        'campaign',
        String(campaignId)
      );
      logger.info('✅ Campaign creation notifications created');
    } catch (e) {
      // Don't fail the entire request if notifications fail
      logger.warn('⚠️  Failed to create campaign creation notifications:', e.message);
      logger.warn('Campaign was created successfully, but notifications could not be sent');
    }

    logger.campaign('Campaign created successfully', `ID: ${campaignId}, User: ${userName}`);

    // Browser push notification for admin
    pushNotificationService.notifyAdmin(
      'New campaign submitted',
      `Campaign "${campaignName || 'Untitled'}" by ${userName} is waiting for approval.`,
      '/#/bookings'
    ).catch((e) => logger.warn('Push notify failed after campaign create:', e?.message));

    // Note: Emails will be sent after campaign name is updated
    // This prevents sending emails with "Auto Campaign" name

    res.status(201).json({
      message: 'Campaign created successfully.',
      id: campaignId
    });

  } catch (err) {
    logger.error('Error creating campaign:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

// Attach a file URL to a campaign billboard after async TUS upload
// POST /api/campaigns/:id/attach-file
// Body: { billboardId: string, fileUrl: string }
const attachCampaignFile = async (req, res) => {
  try {
    const { id: campaignId } = req.params;
    const { billboardId, fileUrl } = req.body;

    if (!campaignId || !billboardId || !fileUrl) {
      return res.status(400).json({ error: 'campaignId, billboardId and fileUrl are required' });
    }

    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Parse billboards field
    let billboards = campaign.billboards;
    if (typeof billboards === 'string') {
      try { billboards = JSON.parse(billboards); } catch { billboards = []; }
    }
    if (!Array.isArray(billboards)) billboards = [];

    // Find the billboard and push the file URL
    let found = false;
    const updated = billboards.map(bb => {
      const bbId = bb.id || bb.billboardId;
      if (String(bbId) === String(billboardId)) {
        found = true;
        const files = Array.isArray(bb.files) ? bb.files : [];
        return { ...bb, files: [...files, fileUrl] };
      }
      return bb;
    });

    if (!found) {
      // Fallback: attach to first billboard if ID not matched
      logger.warn(`attachCampaignFile: billboardId ${billboardId} not found in campaign ${campaignId}, attaching to first billboard`);
      if (updated.length > 0) {
        const files = Array.isArray(updated[0].files) ? updated[0].files : [];
        updated[0] = { ...updated[0], files: [...files, fileUrl] };
      }
    }

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { billboards: updated }
    });

    logger.info(`✅ Attached file to campaign ${campaignId}, billboard ${billboardId}: ${fileUrl}`);
    res.json({ success: true, message: 'File attached successfully', campaignId, billboardId, fileUrl });
  } catch (err) {
    logger.error('Error attaching campaign file:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

// Get campaigns by user
const getCampaignsByUser = async (req, res) => {
  // Try to get user from auth token first, then from query parameter
  let userIdentifier = req.query.user;
  let userEmail = null;
  let userName = null;

  // If no query param, try to get from auth token
  if (!userIdentifier && req.user) {
    // Use email as primary identifier, fallback to name
    userIdentifier = req.user.email || req.user.name;
    userEmail = req.user.email;
    userName = req.user.name;
    logger.info('Using user from auth token:', { userIdentifier, userEmail, userName });
  } else if (userIdentifier) {
    // If identifier looks like an email, treat it as email
    if (userIdentifier.includes('@')) {
      userEmail = userIdentifier;
      // Try to find user by email to get their name for matching old campaigns
      try {
        const user = await prisma.user.findUnique({
          where: { email: userEmail },
          select: { name: true, email: true }
        });
        if (user) {
          userName = user.name;
          logger.info('Found user by email:', { email: userEmail, name: userName });
        }
      } catch (userLookupError) {
        logger.warn('Could not lookup user by email:', userLookupError.message);
      }
    } else {
      // Assume it's a name
      userName = userIdentifier;
    }
  }

  logger.campaign('Fetching campaigns', `User: ${userIdentifier}, Email: ${userEmail}, Name: ${userName}`);

  if (!userIdentifier) {
    logger.warn('No user identifier provided for campaign fetch');
    return res.status(400).json({ error: 'User identifier required' });
  }

  try {
    // Match campaigns by userName (which could be name or email)
    // Build OR conditions to match both email and name for backward compatibility
    const whereConditions = [];

    // Always match by the provided identifier
    whereConditions.push({ userName: userIdentifier });

    // If we have both email and name, also match by name (for old campaigns created with name)
    if (userEmail && userName && userEmail !== userName) {
      whereConditions.push({ userName: userName });
    }
    // If identifier is email but we found a name, also match by name
    if (userEmail === userIdentifier && userName && userName !== userIdentifier) {
      whereConditions.push({ userName: userName });
    }

    const campaigns = await prisma.campaign.findMany({
      where: {
        OR: whereConditions
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    logger.campaign('Campaigns fetched', `User: ${userIdentifier}, Count: ${campaigns.length}`);
    logger.info('Matched campaigns by:', whereConditions);

    // Log campaign statuses for debugging
    campaigns.forEach(c => {
      logger.info(`Campaign ${c.id}: status = ${c.status}, name = ${c.campaignName}`);
    });

    res.json(campaigns);
  } catch (err) {
    logger.error('Error fetching campaigns:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

// Get all campaigns (admin)
const getAllCampaigns = async (req, res) => {
  try {
    const campaigns = await prisma.campaign.findMany({
      orderBy: {
        createdAt: 'desc'
      }
    });
    logger.campaign('All campaigns fetched', `Count: ${campaigns.length}`);
    res.json(campaigns);
  } catch (err) {
    logger.error('Error fetching campaigns:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

// Get campaigns by user email (for billboard owners/publishers)
const getCampaignsByUserEmail = async (req, res) => {
  const { userEmail } = req.query;

  if (!userEmail) {
    return res.status(400).json({ error: 'User email is required' });
  }

  try {
    // Get publisher's billboards
    // Filter by userId (which stores the billboard owner's email in the user_id column)
    const publisherBillboards = await prisma.billboard.findMany({
      where: {
        userId: userEmail
      },
      select: {
        id: true
      }
    });

    const billboardIds = publisherBillboards.map(bb => bb.id);

    if (billboardIds.length === 0) {
      logger.campaign('No billboards found for publisher', `User: ${userEmail}`);
      return res.json([]);
    }

    // Get all campaigns
    const allCampaigns = await prisma.campaign.findMany({
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Filter campaigns that include at least one of the publisher's billboards
    const filteredCampaigns = allCampaigns.filter(campaign => {
      let billboards = campaign.billboards;
      if (typeof billboards === 'string') {
        try {
          billboards = JSON.parse(billboards);
        } catch {
          return false;
        }
      }

      if (Array.isArray(billboards)) {
        return billboards.some(bb => billboardIds.includes(bb.id));
      }

      return false;
    });

    logger.campaign('User campaigns fetched (owner view)', `User: ${userEmail}, Count: ${filteredCampaigns.length}`);
    res.json(filteredCampaigns);
  } catch (err) {
    logger.error("Error fetching user campaigns:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// Update campaign status
// Update campaign status
const updateCampaignStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  logger.info('=== CAMPAIGN STATUS UPDATE REQUEST ===');
  logger.info(`Campaign ID: ${id}`);
  logger.info(`Requested Status: ${status}`);
  logger.info(`Request Method: ${req.method}`);
  logger.info(`Request URL: ${req.originalUrl}`);
  logger.info(`Request Body:`, req.body);
  logger.info('=======================================');

  try {
    // Get current campaign to check dates
    const currentCampaign = await prisma.campaign.findUnique({
      where: { id }
    });

    if (!currentCampaign) {
      logger.error(`Campaign ${id} not found`);
      return res.status(404).json({ error: 'Campaign not found' });
    }

    logger.info(`Current campaign status in DB: ${currentCampaign.status}`);
    logger.info(`Requested status: ${status}`);

    let newStatus = status.toUpperCase();
    logger.info(`Normalized status: ${newStatus}`);

    // Log if we're trying to update from APPROVED to PAYMENT_COMPLETED
    if (currentCampaign.status?.toUpperCase() === 'APPROVED' && newStatus === 'PAYMENT_COMPLETED') {
      logger.info(`🔄 Updating campaign from APPROVED to PAYMENT_COMPLETED`);
    }

    // Prevent skipping payment step - campaigns must be PAYMENT_COMPLETED before SCHEDULED
    if (newStatus === 'SCHEDULED' || newStatus === 'LIVE') {
      const currentStatus = currentCampaign.status?.toUpperCase();
      if (currentStatus !== 'PAYMENT_COMPLETED' && currentStatus !== 'SCHEDULED' && currentStatus !== 'LIVE') {
        logger.warn(`Cannot set campaign ${id} to ${newStatus} - payment not completed. Current status: ${currentStatus}`);
        return res.status(400).json({
          error: 'Invalid status transition',
          message: `Campaign must be PAYMENT_COMPLETED before it can be ${newStatus}`,
          currentStatus: currentCampaign.status
        });
      }
    }

    // If setting to PAYMENT_COMPLETED, generate slots and schedule
    if (newStatus === 'PAYMENT_COMPLETED') {
      logger.info(`💰 PAYMENT_COMPLETED status detected for campaign ${id}`);
      logger.info(`📅 Current campaign startDate: ${currentCampaign.startDate}`);
      logger.campaign('Payment completed, generating slots and scheduling', `Campaign ID: ${id}`);

      try {
        // Fetch campaign with billboards
        const campaignWithBillboards = await prisma.campaign.findUnique({
          where: { id },
          select: {
            id: true,
            billboards: true,
            startDate: true
          }
        });

        if (!campaignWithBillboards) {
          logger.error('Campaign not found for slot generation', `Campaign ID: ${id}`);
          // Still try to update status based on start date from currentCampaign
          if (currentCampaign && currentCampaign.startDate) {
            const now = new Date();
            const startDate = new Date(currentCampaign.startDate);
            newStatus = now < startDate ? 'SCHEDULED' : 'LIVE';
            logger.info(`Campaign ${id} status set to ${newStatus} (campaign not found in billboards query)`);
          }
        } else {
          // Parse the billboards JSON field if it's a string
          let parsedBillboards = campaignWithBillboards.billboards;
          if (typeof parsedBillboards === 'string') {
            try {
              parsedBillboards = JSON.parse(parsedBillboards);
            } catch (parseError) {
              logger.error('Error parsing billboards JSON:', parseError);
              // Still try to update status based on date even if parsing fails
              const now = new Date();
              const startDate = new Date(campaignWithBillboards.startDate);
              newStatus = now < startDate ? 'SCHEDULED' : 'LIVE';
              logger.info(`Campaign ${id} status set to ${newStatus} (billboard parsing failed)`);
            }
          }

          if (parsedBillboards && Array.isArray(parsedBillboards)) {
            // Create a new object with parsed billboards
            const campaignWithParsedBillboards = {
              ...campaignWithBillboards,
              billboards: parsedBillboards
            };

            // Generate slots after payment completion
            try {
              await generateSlots(campaignWithParsedBillboards);
              logger.campaign('Slots generated successfully after payment', `Campaign ID: ${id}`);
            } catch (slotGenError) {
              logger.error('Error in generateSlots:', slotGenError);
              // Continue to set status based on date even if slot generation fails
            }
          }

          // Now check if we should auto-schedule based on start date
          // This should always run regardless of billboard parsing success
          let startDateToCheck = campaignWithBillboards.startDate || (currentCampaign && currentCampaign.startDate);

          logger.info(`Campaign ${id} date check:`, {
            hasStartDate: !!startDateToCheck,
            startDate: startDateToCheck,
            currentCampaignStartDate: currentCampaign?.startDate
          });

          if (startDateToCheck) {
            const now = new Date();
            const startDate = new Date(startDateToCheck);

            // Validate the date
            if (!isNaN(startDate.getTime())) {
              // If start date hasn't arrived, set to SCHEDULED
              if (now < startDate) {
                newStatus = 'SCHEDULED';
                logger.info(`✅ Campaign ${id} payment completed. Auto-scheduling (start date: ${startDate.toISOString()}, now: ${now.toISOString()})`);
              } else {
                // Start date has passed, set to LIVE
                newStatus = 'LIVE';
                logger.info(`✅ Campaign ${id} payment completed. Auto-activating (start date already passed: ${startDate.toISOString()}, now: ${now.toISOString()})`);
              }
            } else {
              logger.warn(`⚠️ Campaign ${id} has invalid start date: ${startDateToCheck}. Defaulting to SCHEDULED.`);
              newStatus = 'SCHEDULED'; // Default to SCHEDULED for future campaigns
            }
          } else {
            // No start date found - default to SCHEDULED (campaigns typically start in the future)
            logger.warn(`⚠️ Campaign ${id} has no start date. Defaulting to SCHEDULED.`);
            newStatus = 'SCHEDULED';
          }

          logger.info(`📝 Campaign ${id} final status will be: ${newStatus}`);
        }
      } catch (slotError) {
        logger.error('Error generating slots after payment:', slotError);
        // Even if slot generation fails, try to update status based on date
        try {
          const campaignForDate = await prisma.campaign.findUnique({
            where: { id },
            select: { startDate: true }
          });

          if (campaignForDate && campaignForDate.startDate) {
            const now = new Date();
            const startDate = new Date(campaignForDate.startDate);

            if (!isNaN(startDate.getTime())) {
              newStatus = now < startDate ? 'SCHEDULED' : 'LIVE';
              logger.info(`Campaign ${id} status set to ${newStatus} after slot generation error (start date: ${startDate.toISOString()})`);
            } else {
              logger.warn(`Campaign ${id} has invalid start date after error. Defaulting to SCHEDULED.`);
              newStatus = 'SCHEDULED';
            }
          } else {
            // No start date found - default to SCHEDULED
            logger.warn(`Campaign ${id} has no start date after error. Defaulting to SCHEDULED.`);
            newStatus = 'SCHEDULED';
          }
        } catch (dateError) {
          logger.error('Error checking start date:', dateError);
          // Default to SCHEDULED if we can't determine schedule (safer than leaving as PAYMENT_COMPLETED)
          newStatus = 'SCHEDULED';
          logger.info(`Campaign ${id} status defaulted to SCHEDULED due to date check error`);
        }
      }
    }

    logger.info(`📝 About to update campaign ${id} to status: ${newStatus}`);
    logger.info(`📊 Current status before update: ${currentCampaign.status}`);
    logger.info(`📊 Requested status: ${status}`);
    logger.info(`📊 Normalized status: ${newStatus}`);

    // Perform the database update
    const campaign = await prisma.campaign.update({
      where: { id },
      data: { status: newStatus }
    });

    logger.info(`✅ Database update completed. Campaign status set to: ${campaign.status}`);

    // Verify the update actually happened by querying again
    const verifyCampaign = await prisma.campaign.findUnique({
      where: { id },
      select: { id: true, status: true, campaignName: true, startDate: true, endDate: true }
    });

    logger.campaign('Campaign status updated', `Campaign ID: ${id}, Status: ${newStatus} (requested: ${status})`);

    // Browser push notification for admin on campaign approval/action
    const pushTitles = {
      APPROVED: 'Campaign approved',
      REJECTED: 'Campaign rejected',
      PAYMENT_PENDING: 'Campaign – payment pending',
      PAYMENT_COMPLETED: 'Campaign – payment completed',
      SCHEDULED: 'Campaign scheduled',
      LIVE: 'Campaign live',
      COMPLETED: 'Campaign completed'
    };
    const pushTitle = pushTitles[newStatus] || `Campaign status: ${newStatus}`;
    const pushBody = `${verifyCampaign?.campaignName || id} is now ${newStatus}.`;
    pushNotificationService.notifyAdmin(pushTitle, pushBody, '/#/bookings').catch((e) => logger.warn('Push notify failed:', e?.message));

    logger.info('=== CAMPAIGN STATUS UPDATE RESPONSE ===');
    logger.info(`Campaign ID: ${id}`);
    logger.info(`Requested Status: ${status}`);
    logger.info(`Normalized Status: ${newStatus}`);
    logger.info(`Campaign Status in DB (from update result): ${campaign.status}`);
    logger.info(`Campaign Status in DB (verified query): ${verifyCampaign?.status}`);
    logger.info(`Status match: ${campaign.status === verifyCampaign?.status ? '✅ YES' : '❌ NO - MISMATCH!'}`);
    if (campaign.status !== verifyCampaign?.status) {
      logger.error(`❌ CRITICAL: Status mismatch! Update returned ${campaign.status} but verification query returned ${verifyCampaign?.status}`);
    }
    logger.info(`Campaign Start Date: ${verifyCampaign?.startDate}`);
    logger.info('========================================');

    res.json({
      success: true,
      message: 'Campaign status updated successfully',
      data: {
        id: campaign.id,
        status: campaign.status,
        verifiedStatus: verifyCampaign?.status,
        campaignName: campaign.campaignName,
        startDate: campaign.startDate,
        endDate: campaign.endDate
      },
      campaign
    });
  } catch (err) {
    logger.error('Error updating status:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

// Complete payment for a campaign - dedicated endpoint
const completePayment = async (req, res) => {
  const { id } = req.params;

  logger.info('=== PAYMENT COMPLETION REQUEST ===');
  logger.info(`Campaign ID: ${id}`);
  logger.info(`Request Method: ${req.method}`);
  logger.info(`Request URL: ${req.originalUrl}`);
  logger.info('===================================');

  try {
    // Get current campaign
    const currentCampaign = await prisma.campaign.findUnique({
      where: { id }
    });

    if (!currentCampaign) {
      logger.error(`Campaign ${id} not found for payment completion`);
      return res.status(404).json({ error: 'Campaign not found' });
    }

    logger.info(`Current campaign status: ${currentCampaign.status}`);
    logger.info(`Campaign start date: ${currentCampaign.startDate}`);

    // Validate that campaign is in a state that allows payment
    const currentStatus = currentCampaign.status?.toUpperCase();
    if (currentStatus !== 'APPROVED' && currentStatus !== 'PAYMENT_PENDING') {
      logger.warn(`Campaign ${id} cannot complete payment. Current status: ${currentStatus}`);
      return res.status(400).json({
        error: 'Invalid campaign status for payment',
        message: `Campaign must be APPROVED or PAYMENT_PENDING to complete payment. Current status: ${currentCampaign.status}`,
        currentStatus: currentCampaign.status
      });
    }

    // Fetch campaign with billboards for slot generation
    const campaignWithBillboards = await prisma.campaign.findUnique({
      where: { id },
      select: {
        id: true,
        billboards: true,
        startDate: true,
        endDate: true,
        campaignName: true
      }
    });

    if (!campaignWithBillboards) {
      logger.error(`Campaign ${id} not found for slot generation`);
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Parse billboards
    let parsedBillboards = campaignWithBillboards.billboards;
    if (typeof parsedBillboards === 'string') {
      try {
        parsedBillboards = JSON.parse(parsedBillboards);
      } catch (parseError) {
        logger.error('Error parsing billboards JSON:', parseError);
        return res.status(500).json({ error: 'Failed to parse campaign billboards' });
      }
    }

    if (!Array.isArray(parsedBillboards) || parsedBillboards.length === 0) {
      logger.error(`Campaign ${id} has no valid billboards`);
      return res.status(400).json({ error: 'Campaign has no billboards' });
    }

    // Generate slots after payment completion
    try {
      const campaignWithParsedBillboards = {
        ...campaignWithBillboards,
        billboards: parsedBillboards
      };

      logger.info(`Generating slots for campaign ${id}...`);
      await generateSlots(campaignWithParsedBillboards);
      logger.campaign('Slots generated successfully after payment', `Campaign ID: ${id}`);
    } catch (slotGenError) {
      logger.error('Error generating slots after payment:', slotGenError);
      // Continue with status update even if slot generation fails
    }

    // Determine final status based on start date
    let finalStatus = 'PAYMENT_COMPLETED';
    let startDateToCheck = campaignWithBillboards.startDate || currentCampaign.startDate;

    logger.info(`Campaign ${id} date check:`, {
      hasStartDate: !!startDateToCheck,
      startDate: startDateToCheck
    });

    if (startDateToCheck) {
      const now = new Date();
      const startDate = new Date(startDateToCheck);

      if (!isNaN(startDate.getTime())) {
        if (now < startDate) {
          finalStatus = 'SCHEDULED';
          logger.info(`✅ Campaign ${id} payment completed. Auto-scheduling (start date: ${startDate.toISOString()}, now: ${now.toISOString()})`);
        } else {
          finalStatus = 'LIVE';
          logger.info(`✅ Campaign ${id} payment completed. Auto-activating (start date already passed: ${startDate.toISOString()}, now: ${now.toISOString()})`);
        }
      } else {
        logger.warn(`⚠️ Campaign ${id} has invalid start date: ${startDateToCheck}. Defaulting to SCHEDULED.`);
        finalStatus = 'SCHEDULED';
      }
    } else {
      logger.warn(`⚠️ Campaign ${id} has no start date. Defaulting to SCHEDULED.`);
      finalStatus = 'SCHEDULED';
    }

    logger.info(`📝 Campaign ${id} final status will be: ${finalStatus}`);

    // Update campaign status
    const updatedCampaign = await prisma.campaign.update({
      where: { id },
      data: { status: finalStatus }
    });

    logger.info(`✅ Database update completed. Campaign status set to: ${updatedCampaign.status}`);

    // Verify the update
    const verifyCampaign = await prisma.campaign.findUnique({
      where: { id },
      select: { id: true, status: true, campaignName: true, startDate: true, endDate: true }
    });

    logger.info('=== PAYMENT COMPLETION RESPONSE ===');
    logger.info(`Campaign ID: ${id}`);
    logger.info(`Final Status: ${finalStatus}`);
    logger.info(`Campaign Status in DB: ${updatedCampaign.status}`);
    logger.info(`Verified Status: ${verifyCampaign?.status}`);
    logger.info(`Status match: ${updatedCampaign.status === verifyCampaign?.status ? '✅ YES' : '❌ NO'}`);
    logger.info('====================================');

    res.json({
      success: true,
      message: 'Payment completed successfully. Campaign scheduled.',
      data: {
        id: updatedCampaign.id,
        status: updatedCampaign.status,
        verifiedStatus: verifyCampaign?.status,
        campaignName: updatedCampaign.campaignName,
        startDate: updatedCampaign.startDate,
        endDate: updatedCampaign.endDate
      },
      campaign: updatedCampaign
    });
  } catch (err) {
    logger.error('Error completing payment:', err);
    logger.error('Error stack:', err.stack);
    res.status(500).json({
      error: 'Internal server error',
      message: err.message
    });
  }
};



// Update campaign status and name based on billboard statuses
const updateCampaignStatusBasedOnBillboards = async (campaignId, billboards) => {
  try {
    logger.info(`Checking campaign status for ${campaignId} with ${billboards.length} billboards`);

    // Log all billboard statuses for debugging
    logger.info('Billboard statuses:', billboards.map(b => ({ id: b.id, status: b.status })));

    // Check if all billboards are approved (case-insensitive)
    const allBillboardsApproved = billboards.every(b => b.status?.toUpperCase() === 'APPROVED');
    logger.info(`All billboards approved: ${allBillboardsApproved}`);

    // Log each billboard's status for debugging
    billboards.forEach((billboard, index) => {
      logger.info(`Billboard ${index + 1}: ID=${billboard.id}, Status=${billboard.status}`);
    });

    if (allBillboardsApproved) {
      logger.campaign('All billboards approved, updating campaign status and name', `Campaign ID: ${campaignId}`);

      logger.info(`Attempting to update campaign ${campaignId} status to APPROVED and name...`);

      // Get current campaign to check if name needs updating
      const currentCampaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { campaignName: true, status: true }
      });

      // Generate a new campaign name based on billboards
      const billboardCities = [...new Set(billboards.map(b => b.city).filter(Boolean))];
      const newCampaignName = billboardCities.length > 0
        ? `Approved Campaign - ${billboardCities.join(', ')}`
        : 'Approved Campaign';

      const updateData = {
        status: 'APPROVED',
        campaignName: newCampaignName
      };

      const updatedCampaign = await prisma.campaign.update({
        where: { id: campaignId },
        data: updateData
      });

      logger.campaign('Campaign status and name updated', `Campaign ID: ${campaignId}, New Status: ${updatedCampaign.status}, New Name: ${updatedCampaign.campaignName}`);

      // Verify the update
      const verification = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { status: true, campaignName: true }
      });
      logger.info(`Campaign verification - Status: ${verification?.status}, Name: ${verification?.campaignName}`);

      if (verification?.status === 'APPROVED') {
        logger.info('Campaign status and name update successful!');
        return 'APPROVED';
      } else {
        logger.error('Campaign status update failed - verification mismatch');
        return 'UPDATE_FAILED';
      }
    } else {
      logger.info('Not all billboards are approved, setting campaign status to pending');

      const updatedCampaign = await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: 'pending' }
      });

      logger.info(`Campaign status set to pending: ${updatedCampaign.status}`);
      return 'pending';
    }
  } catch (error) {
    logger.error(`Error updating campaign status for ${campaignId}:`, error);
    return 'ERROR';
  }
};

// Update individual billboard status within a campaign
const updateBillboardStatus = async (req, res) => {
  const { campaignId, billboardId } = req.params;
  const { status } = req.body;

  try {
    logger.info(`🔄 Billboard status update request:`, {
      campaignId,
      billboardId,
      requestedStatus: status,
      requestBody: req.body
    });

    // Validate status value
    const validStatuses = ['APPROVED', 'REJECTED', 'PENDING'];
    const normalizedStatus = status.toUpperCase();

    if (!validStatuses.includes(normalizedStatus)) {
      return res.status(400).json({ error: 'Invalid status. Must be one of: approved, rejected, pending' });
    }

    // Fetch the campaign
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId }
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    logger.info(`📋 Campaign found:`, {
      id: campaign.id,
      currentStatus: campaign.status,
      billboardsCount: campaign.billboards ? (Array.isArray(campaign.billboards) ? campaign.billboards.length : 'Not array') : 'No billboards'
    });

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

    // Validate billboards array
    if (!Array.isArray(billboards) || billboards.length === 0) {
      return res.status(500).json({ error: 'Invalid billboards data structure' });
    }

    // Find and update the specific billboard status
    const billboardIndex = billboards.findIndex(b => b.id === billboardId);
    if (billboardIndex === -1) {
      return res.status(404).json({ error: 'Billboard not found in campaign' });
    }

    // Store previous status for comparison
    const previousStatus = billboards[billboardIndex].status;

    logger.info(`📍 Billboard found at index ${billboardIndex}:`, {
      billboardId,
      previousStatus,
      newStatus: normalizedStatus,
      billboardData: billboards[billboardIndex]
    });

    // Update the billboard status (standardize to uppercase)
    billboards[billboardIndex].status = normalizedStatus;
    billboards[billboardIndex].updatedAt = new Date().toISOString();

    // Enhanced validation for approved billboards
    if (normalizedStatus === 'APPROVED') {
      const billboard = billboards[billboardIndex];

      logger.info(`✅ Validating billboard for approval:`, {
        billboardId,
        hasBookingDetails: !!billboard.bookingDetails,
        hasStartDate: !!billboard.bookingDetails?.startDate,
        hasEndDate: !!billboard.bookingDetails?.endDate,
        hasFiles: !!billboard.files,
        filesCount: billboard.files?.length || 0,
        hasScreenId: !!billboard.screen_id,
        screenId: billboard.screen_id
      });

      // Validate required data for approved billboards
      const validationErrors = [];

      if (!billboard.bookingDetails?.startDate || !billboard.bookingDetails?.endDate) {
        validationErrors.push('Missing booking dates');
      }

      if (!billboard.files || billboard.files.length === 0) {
        validationErrors.push('Missing asset files');
      }

      if (!billboard.screen_id || billboard.screen_id === 'NA') {
        validationErrors.push('Missing or invalid screen ID');
      }

      if (validationErrors.length > 0) {
        logger.warn(`❌ Billboard ${billboardId} approval validation failed:`, validationErrors);

        // Revert the status change if validation fails
        billboards[billboardIndex].status = previousStatus;
        billboards[billboardIndex].updatedAt = new Date().toISOString();

        await prisma.campaign.update({
          where: { id: campaignId },
          data: { billboards }
        });

        return res.status(400).json({
          error: 'Cannot approve billboard - validation failed',
          details: validationErrors
        });
      }

      logger.campaign('✅ Billboard approved with valid data', `Campaign ID: ${campaignId}, Billboard ID: ${billboardId}`);
    }

    // Update the campaign with modified billboards
    logger.info(`💾 Updating campaign with new billboard statuses...`);
    const updatedCampaign = await prisma.campaign.update({
      where: { id: campaignId },
      data: { billboards }
    });

    logger.info(`✅ Campaign updated successfully:`, {
      campaignId,
      billboardId,
      previousStatus,
      newStatus: normalizedStatus,
      totalBillboards: billboards.length,
      approvedBillboards: billboards.filter(b => b.status?.toUpperCase() === 'APPROVED').length,
      campaignStatus: updatedCampaign.status
    });

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
      logger.info(`🎉 All billboards are now approved! Campaign should be automatically updated.`);

      // Since database triggers are not installed, manually update campaign status
      try {
        logger.info(`🔧 Database triggers not available, manually updating campaign status...`);

        const manuallyUpdatedCampaign = await prisma.campaign.update({
          where: { id: campaignId },
          data: {
            status: 'APPROVED',
            updatedAt: new Date()
          }
        });

        logger.info(`✅ Campaign status manually updated to: ${manuallyUpdatedCampaign.status}`);

        // Generate slots manually since triggers aren't working
        await generateSlotsForCampaign(campaignId, billboards);

        // Update user metrics manually
        await updateUserStatistics(campaign.owner, campaign.totalAmount);

      } catch (manualUpdateError) {
        logger.error('❌ Error in manual campaign update:', manualUpdateError);
      }
    }

    // Send email notification based on billboard status asynchronously
    if (normalizedStatus === 'APPROVED') {
      // Use the original campaign data to ensure userName is included
      const campaignDataForEmail = {
        ...campaign,
        billboards: billboards // Use the updated billboards
      };

      EmailService.notifyBillboardApproved(campaignDataForEmail, billboards[billboardIndex])
        .catch(emailError => {
          logger.error('Error sending billboard approval email notification:', emailError);
        });
    } else if (normalizedStatus === 'REJECTED') {
      const rejectionReason = req.body.rejectionReason || 'No reason provided';

      // Use the original campaign data to ensure userName is included
      const campaignDataForEmail = {
        ...campaign,
        billboards: billboards // Use the updated billboards
      };

      EmailService.notifyBillboardRejected(campaignDataForEmail, billboards[billboardIndex], rejectionReason)
        .catch(emailError => {
          logger.error('Error sending billboard rejection email notification:', emailError);
        });
    }

    logger.campaign('Billboard status updated', `Campaign ID: ${campaignId}, Billboard ID: ${billboardId}, Status: ${normalizedStatus}`);

    // Browser push notification for admin on campaign billboard approval/rejection
    if (normalizedStatus === 'APPROVED' || normalizedStatus === 'REJECTED') {
      const action = normalizedStatus === 'APPROVED' ? 'approved' : 'rejected';
      pushNotificationService.notifyAdmin(
        `Campaign billboard ${action}`,
        `Billboard ${billboardId} in campaign ${campaignId} has been ${action}.`,
        '/#/bookings'
      ).catch((e) => logger.warn('Push notify failed:', e?.message));
    }

    res.json({
      message: 'Billboard status updated successfully',
      campaign: updatedCampaign,
      updatedBillboard: billboards[billboardIndex],
      allBillboardsApproved,
      campaignStatus: updatedCampaign.status,
      manualUpdateRequired: !allBillboardsApproved
    });
  } catch (err) {
    logger.error('❌ Error updating billboard status:', err);
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
    const durationSeconds = toSeconds(billboard.adDuration || billboard.bookingDetails?.duration || 10);

    logger.info(`🎬 Generating slots for billboard ${billboardId}:`, {
      assetUrl,
      screen_id,
      startDate,
      endDate,
      files: billboard.files
    });

    if (!startDate || !endDate || !assetUrl) {
      logger.warn(`⚠️ Missing data for billboard ${billboardId}:`, {
        hasStartDate: !!startDate,
        hasEndDate: !!endDate,
        hasAssetUrl: !!assetUrl
      });
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    // DEV: always ensure at least one slot for TODAY for quick testing
    try {
      const today = new Date();
      const { start: todayStart, end: todayEnd } = getDayRange(today);
      const existsToday = await prisma.generatedSlot.findFirst({
        where: {
          billboardId,
          campaignId: campaignId,
          startDate: { gte: todayStart, lte: todayEnd }
        },
        select: { id: true }
      });
      if (!existsToday) {
        await prisma.generatedSlot.create({
          data: {
            campaignId,
            billboardId,
            assetUrl,
            startDate: todayStart,
            endDate: todayEnd,
            duration: durationSeconds,
            slotNumber: 1,
            screenId: screen_id
          }
        });
        logger.slot(`✅ DEV: ensured today slot for billboard ${billboardId}`);
      }
    } catch (e) {
      logger.warn('DEV today-slot ensure failed:', e.message);
    }

    // Generate exactly one booked slot per day in the booking period
    for (let current = new Date(start); current <= end; current.setDate(current.getDate() + 1)) {
      const { start: dayStart, end: dayEnd } = getDayRange(current);

      const existing = await prisma.generatedSlot.findFirst({
        where: {
          billboardId,
          campaignId: campaignId,
          startDate: { gte: dayStart, lte: dayEnd }
        },
        select: { slotNumber: true }
      });

      if (!existing) {
        await prisma.generatedSlot.create({
          data: {
            campaignId,
            billboardId,
            assetUrl,
            startDate: dayStart,
            endDate: dayEnd,
            duration: 1,
            slotNumber: 1,
            screenId: screen_id
          }
        });
        logger.slot(`✅ Created 1 slot for ${billboardId} on ${dayStart.toISOString().slice(0, 10)}`);
      } else {
        logger.slot(`⛔ Slot already exists for ${billboardId} on ${dayStart.toISOString().slice(0, 10)}`);
      }
    }

    logger.info(`🎉 Slot generation completed for billboard ${billboardId}`);
  } catch (error) {
    logger.error(`❌ Error generating slots for billboard ${billboard.id}:`, error);
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
        // Update the slotAvailability JSON field after generating slots
        await updateBillboardSlotAvailabilityJSON(String(billboard.id));
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

// Update campaign name
const updateCampaignName = async (req, res) => {
  logger.info('Incoming body:', req.body);
  try {
    const { campaignId, campaignName } = req.body;
    logger.info('Received:', { campaignId, campaignName });

    if (!campaignId || !campaignName) {
      return res.status(400).json({ message: 'Campaign ID and name are required' });
    }

    const campaign = await prisma.campaign.update({
      where: { id: campaignId },
      data: { campaignName }
    });

    // Notifications for name update
    try {
      await prisma.$executeRawUnsafe(
        "INSERT INTO notifications (recipient_role, type, title, message, entity_type, entity_id) VALUES ('superadmin', $1, $2, $3, $4, $5)",
        'CAMPAIGN_UPDATED',
        'Campaign name updated',
        `Campaign ${campaignId} renamed to ${campaignName}`,
        'campaign',
        String(campaignId)
      );
      await prisma.$executeRawUnsafe(
        'INSERT INTO notifications (recipient_email, recipient_role, type, title, message, entity_type, entity_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        campaign.userName,
        'user',
        'CAMPAIGN_UPDATED',
        'Campaign name updated',
        `Your campaign has been renamed to ${campaignName}`,
        'campaign',
        String(campaignId)
      );
    } catch (e) {
      logger.warn('Failed to create campaign update notifications:', e.message);
    }

    logger.campaign('Campaign name updated', `Campaign ID: ${campaignId}, New name: ${campaignName}`);

    // Send emails with updated campaign name
    const campaignData = {
      id: campaignId,
      userName: campaign.userName,
      campaignName: campaignName,
      status: campaign.status,
      totalAmount: campaign.totalAmount,
      startDate: campaign.startDate,
      endDate: campaign.endDate,
      billboards: campaign.billboards
    };

    // Send confirmation email to user with updated campaign name
    EmailService.notifyCampaignCreatedUser(campaignData).catch(emailError => {
      logger.error('Error sending campaign creation confirmation to user:', emailError);
    });

    // Send notification to superadmin as new campaign request
    EmailService.notifyCampaignCreated(campaignData).catch(emailError => {
      logger.error('Error sending campaign creation notification to superadmin:', emailError);
    });

    // After name update, no changes to dates; skip availability update
    res.status(200).json({ message: 'Campaign name updated successfully', campaign });
  } catch (err) {
    logger.error('Update campaign name error:', err);
    res.status(500).json({ message: 'Failed to update campaign name' });
  }
};



async function generateSlots(campaign) {
  const isTest = false;
  const billboards = campaign.billboards;

  if (!Array.isArray(billboards)) {
    logger.warn("❗ Billboards data missing or not an array");
    return;
  }

  logger.info(`Starting slot generation for campaign ${campaign.id} with ${billboards.length} billboards`);

  for (const billboard of billboards) {
    const billboardId = String(billboard.id); // Ensure it's a string
    const assetUrl = billboard.files?.[0];
    // Extract screenId from billboard - check multiple possible field names
    const screenId = billboard.screen_id || billboard.screenId || null;
    const { startDate, endDate } = billboard.bookingDetails || {};
    const durationSeconds = (() => {
      const d = billboard.assetScheduling?.duration || billboard.adDuration || 15;
      const n = Number(d);
      return Number.isFinite(n) && n > 0 ? n : 15;
    })();

    logger.info(`Processing billboard ${billboardId}:`, {
      assetUrl,
      screenId,
      startDate,
      endDate,
      billboardKeys: Object.keys(billboard) // Log all available keys for debugging
    });

    if (!startDate || !endDate || !assetUrl) {
      logger.warn(`⚠️ Missing data for billboard ${billboardId}:`, {
        hasStartDate: !!startDate,
        hasEndDate: !!endDate,
        hasAssetUrl: !!assetUrl
      });
      continue;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    // No test slots in production logic

    // 🔁 Real campaign slot generation
    for (
      let current = new Date(start);
      current <= end;
      current.setDate(current.getDate() + 1)
    ) {
      const dateStr = current.toISOString().slice(0, 10);

      // Skip if this campaign already has a slot for this billboard on this day
      const existingForCampaign = await prisma.generatedSlot.findFirst({
        where: {
          campaignId: String(campaign.id),
          billboardId,
          startDate: {
            gte: new Date(`${dateStr}T00:00:00Z`),
            lte: new Date(`${dateStr}T23:59:59Z`)
          }
        }
      });
      if (existingForCampaign) {
        logger.info(`⛔ Skipped: campaign ${campaign.id} already has a slot for ${billboardId} on ${dateStr}`);
        continue;
      }

      // Enforce max 8 slots per billboard per day overall
      const slotCountThisDay = await prisma.generatedSlot.count({
        where: {
          billboardId,
          startDate: {
            gte: new Date(`${dateStr}T00:00:00Z`),
            lte: new Date(`${dateStr}T23:59:59Z`)
          }
        }
      });
      if (slotCountThisDay >= 8) {
        logger.info(`⛔ Skipped: ${billboardId} already has 8 slots on ${dateStr}`);
        continue;
      }

      try {
        const slotData = {
          campaignId: String(campaign.id), // Ensure it's a string
          billboardId,
          assetUrl,
          startDate: new Date(`${dateStr}T00:00:00Z`),
          endDate: new Date(`${dateStr}T23:59:59Z`),
          duration: durationSeconds,
          slotNumber: slotCountThisDay + 1,
          screenId: screenId ? String(screenId) : null
        };

        logger.info(`Creating slot with data:`, slotData);

        await prisma.generatedSlot.create({
          data: slotData
        });

        logger.info(`🆕 Slot #${slotCount + 1} for ${billboardId} on ${dateStr} with screenId: ${screenId}`);
      } catch (error) {
        logger.error(`❌ Error creating slot for ${billboardId} on ${dateStr}:`, error.message);
        logger.error(`❌ Error details:`, error);
      }
    }
  }

  logger.info(`Slot generation completed for campaign ${campaign.id}`);
}

// Delete campaign
const deleteCampaign = async (req, res) => {
  const { id } = req.params;

  try {
    // Check if campaign exists
    const campaign = await prisma.campaign.findUnique({
      where: { id }
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Delete related data in transaction
    await prisma.$transaction(async (tx) => {
      // Delete generated slots
      const deletedSlots = await tx.generatedSlot.deleteMany({
        where: { campaignId: id }
      });
      logger.info(`Deleted ${deletedSlots.count} generated slots for campaign ${id}`);

      // Delete asset play logs
      const deletedPlayLogs = await tx.assetPlayLog.deleteMany({
        where: { campaignId: id }
      });
      logger.info(`Deleted ${deletedPlayLogs.count} asset play logs for campaign ${id}`);

      // Delete asset plays
      const deletedAssetPlays = await tx.assetPlay.deleteMany({
        where: { campaignId: id }
      });
      logger.info(`Deleted ${deletedAssetPlays.count} asset plays for campaign ${id}`);

      // Delete the campaign
      await tx.campaign.delete({
        where: { id }
      });
    });

    logger.campaign('Campaign deleted successfully', `Campaign ID: ${id}, User: ${campaign.userName}`);
    res.json({
      message: 'Campaign deleted successfully',
      campaignId: id
    });
  } catch (err) {
    logger.error('Error deleting campaign:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Delete individual billboard from campaign
const deleteBillboardFromCampaign = async (req, res) => {
  const { campaignId, billboardId } = req.params;

  try {
    // Check if campaign exists
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

    if (!Array.isArray(billboards)) {
      return res.status(500).json({ error: 'Billboards data is not an array' });
    }

    // Find the billboard to delete
    const billboardIndex = billboards.findIndex(b => b.id === billboardId);
    if (billboardIndex === -1) {
      return res.status(404).json({ error: 'Billboard not found in campaign' });
    }

    const billboardToDelete = billboards[billboardIndex];

    // Remove the billboard from the array
    billboards.splice(billboardIndex, 1);

    // Calculate new total amount
    const newTotalAmount = billboards.reduce((sum, b) => {
      return sum + (parseFloat(b.totalPrice) || 0);
    }, 0);

    // Update campaign in transaction
    await prisma.$transaction(async (tx) => {
      // Delete generated slots for this specific billboard
      const deletedSlots = await tx.generatedSlot.deleteMany({
        where: {
          campaignId: campaignId,
          billboardId: billboardId
        }
      });
      logger.info(`Deleted ${deletedSlots.count} generated slots for billboard ${billboardId}`);

      // Delete asset play logs for this specific billboard (if assetUrl matches)
      if (billboardToDelete.files && billboardToDelete.files.length > 0) {
        const deletedPlayLogs = await tx.assetPlayLog.deleteMany({
          where: {
            campaignId: campaignId,
            assetUrl: { in: billboardToDelete.files }
          }
        });
        logger.info(`Deleted ${deletedPlayLogs.count} asset play logs for billboard ${billboardId}`);
      }

      // Delete asset plays for this specific billboard (if assetUrl matches)
      if (billboardToDelete.files && billboardToDelete.files.length > 0) {
        const deletedAssetPlays = await tx.assetPlay.deleteMany({
          where: {
            campaignId: campaignId,
            assetUrl: { in: billboardToDelete.files }
          }
        });
        logger.info(`Deleted ${deletedAssetPlays.count} asset plays for billboard ${billboardId}`);
      }

      // Update the campaign with the new billboards array and total amount
      await tx.campaign.update({
        where: { id: campaignId },
        data: {
          billboards: billboards,
          totalAmount: newTotalAmount
        }
      });
    });

    logger.campaign('Billboard deleted from campaign successfully', `Campaign ID: ${campaignId}, Billboard ID: ${billboardId}`);
    res.json({
      message: 'Billboard deleted from campaign successfully',
      campaignId: campaignId,
      billboardId: billboardId,
      remainingBillboards: billboards.length,
      newTotalAmount: newTotalAmount
    });
  } catch (err) {
    logger.error('Error deleting billboard from campaign:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  createCampaign,
  getCampaignsByUser,
  getAllCampaigns,
  getCampaignsByUserEmail,
  updateCampaignStatus,
  updateBillboardStatus,
  generateSlotsForBillboard,
  getCampaignWithBillboardStatuses,
  updateCampaignName,
  upload,
  deleteCampaign,
  deleteBillboardFromCampaign,
  updateUserStatistics,
  updateCampaignStatusBasedOnBillboards,
  completePayment,
  attachCampaignFile
}; 