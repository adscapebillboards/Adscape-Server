const prisma = require('../db/db');
const logger = require('../config/logger');
const { recomputeAndUpsertForRange, ensureDefaultAvailabilityForTwoMonths, updateBillboardSlotAvailabilityJSON } = require('./availabilityController');
const { generateSlots: sharedGenerateSlots } = require('../utils/slotGenerator');
const { flattenGeneratedSlotRecords } = require('../utils/generatedSlotFormat');
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
const { sendAdminNewCampaignWhatsapp } = require('../services/whatsappService');
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
      let assets = req.body.assets;
      if (typeof assets === 'string') {
        try { assets = JSON.parse(assets); } catch (e) { assets = []; }
      } else if (!assets) {
        assets = [];
      }
      campaignData = {
        userName: req.body.userName,
        campaignName: req.body.campaignName,
        startDate: req.body.startDate,
        endDate: req.body.endDate,
        totalAmount: req.body.totalAmount,
        billboards,
        assets
      };
    } else {
      return res.status(400).json({ error: 'Missing campaign data.' });
    }

    const { userName, billboards, campaignName, assets = [] } = campaignData;
    if (!userName || !billboards || !Array.isArray(billboards)) {
      return res.status(400).json({ error: 'Missing required fields: userName and billboards array' });
    }

    logger.campaign('Campaign creation started (async mode)', `User: ${userName}, Billboards: ${billboards.length}`);

    const campaignId = uuidv4();

    const billboardIds = billboards.map(b => String((b.billboard || b).id || b.billboardId));
    const dbBillboards = await prisma.billboard.findMany({
      where: { id: { in: billboardIds } }
    });
    const dbBillboardsMap = new Map(dbBillboards.map(b => [String(b.id), b]));

    // Build billboard records WITHOUT waiting for file uploads — files: [] initially
    const enrichedBillboards = billboards.map((billboard) => {
      const billboardObj = billboard.billboard || billboard;
      const id = String(billboardObj.id || billboard.billboardId || billboard.id);

      let bookingDetails = billboard.bookingDetails || billboardObj.bookingDetails;
      if (!bookingDetails && (billboard.startDate || billboard.endDate)) {
        bookingDetails = { startDate: billboard.startDate, endDate: billboard.endDate };
      }

      if (!id || !bookingDetails || !bookingDetails.startDate || !bookingDetails.endDate) {
        throw new Error('Invalid billboard data structure: missing id or bookingDetails');
      }

      const dbBillboard = dbBillboardsMap.get(id);
      const { location, city, owner } = dbBillboard || billboardObj;
      const pricePerDay = dbBillboard?.pricePerDay || billboardObj.pricePerDay || 0;
      const screen_id = billboardObj.screen_id || billboardObj.screenId || billboard.screen_id || billboard.screenId || dbBillboard?.screenId || null;
      const { startDate, endDate } = bookingDetails;

      const days = Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) + 1;
      let totalPrice = days * pricePerDay;

      // Apply Bulk Booking Discount if applicable
      let discountApplied = false;
      let discountAmount = 0;
      if (dbBillboard?.bulkDiscountEnabled && dbBillboard?.bulkDiscountPercent && dbBillboard?.bulkDiscountThresholdDays) {
        if (days >= dbBillboard.bulkDiscountThresholdDays) {
          const originalPrice = totalPrice;
          totalPrice = originalPrice * (1 - (dbBillboard.bulkDiscountPercent / 100));
          discountAmount = originalPrice - totalPrice;
          discountApplied = true;
        }
      }

      const { getISTTimestamp } = require('../utils/timeUtils');
      return {
        id,
        location: location || billboardObj.location,
        city: city || billboardObj.city,
        pricePerDay: pricePerDay,
        totalPrice,
        discountApplied,
        discountAmount,
        bookingDetails: { startDate, endDate },
        files: [], // Files will be attached asynchronously via /attach-file
        owner: owner || billboardObj.owner,
        screen_id,
        userName,
        status: (campaignData.status === 'APPROVED' || campaignData.status === 'PAYMENT_COMPLETED' || campaignData.status === 'SCHEDULED' || campaignData.status === 'LIVE') ? 'APPROVED' : 'PENDING',
        createDate: getISTTimestamp(),
        endDate,
        billboardCampaignId: `${campaignId}_${id}`,
        ...billboardObj,
        ...billboard,
        // Ensure we don't overwrite the calculated price and discount
        totalPrice,
        discountApplied,
        discountAmount
      };
    });

    // Use provided totalAmount or calculate from enriched billboards
    const totalAmount = parseFloat(campaignData.totalAmount) || enrichedBillboards.reduce((sum, b) => sum + (b.totalPrice || 0), 0);

    const startDate = enrichedBillboards[0]?.bookingDetails.startDate;
    const endDate = enrichedBillboards[0]?.bookingDetails.endDate;

    logger.info(`Campaign ${campaignId}: creating DB record with ${enrichedBillboards.length} billboards (files will be attached asynchronously)`);

    try {
      const { parseDateAsUTC } = require('../utils/timeUtils');
      await prisma.campaign.create({
        data: {
          id: campaignId,
          userName,
          campaignName: campaignName || "Auto Campaign",
          status: campaignData.status || "PENDING",
          totalAmount,
          startDate: parseDateAsUTC(startDate),
          endDate: parseDateAsUTC(endDate),
          billboards: enrichedBillboards,
          assets
        }
      });
      logger.info('✅ Campaign saved to database successfully');

      // If we are auto-approving / pre-paying (e.g. offline paid campaign), auto-generate slots
      const isOffline = req.body.isOffline === 'true' || campaignData.isOffline === 'true' || campaignData.isOffline === true;
      if (isOffline || campaignData.status === 'PAYMENT_COMPLETED' || campaignData.paymentStatus === 'paid') {
        let finalStatus = 'SCHEDULED';
        if (startDate) {
          const now = new Date();
          const start = new Date(startDate);
          if (!isNaN(start.getTime()) && now >= start) {
            finalStatus = 'LIVE';
          }
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

          const slotBillboards = enrichedBillboards.map(bb => {
            const files = Array.isArray(bb.files) && bb.files.length > 0
              ? bb.files
              : (bb.images && bb.images.length > 0 ? [bb.images[0]] : ["https://res.cloudinary.com/dh0ehlpkp/image/upload/v1772717423/Logo_ssxriy.png"]);
            return {
              ...bb,
              files,
              bookingDetails: {
                startDate: bb.bookingDetails?.startDate || campaignStartStr,
                endDate: bb.bookingDetails?.endDate || campaignEndStr,
              },
              startDate: bb.bookingDetails?.startDate || campaignStartStr,
              endDate: bb.bookingDetails?.endDate || campaignEndStr,
            };
          });

          await sharedGenerateSlots({
            id: campaignId,
            billboards: slotBillboards,
            startDate: parseDateAsUTC(startDate),
            endDate: parseDateAsUTC(endDate),
            campaignName: campaignName || "Auto Campaign"
          });
          logger.info(`✅ Slots auto-generated for offline campaign ${campaignId} during creation`);
        } catch (slotGenError) {
          logger.error('Error generating slots for offline campaign during creation:', slotGenError.message);
        }
      }
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
    // Run asynchronously to prevent API timeout
    Promise.all(enrichedBillboards.map(async (b) => {
      try {
        await ensureDefaultAvailabilityForTwoMonths(String(b.id));
        await recomputeAndUpsertForRange(String(b.id), b.bookingDetails?.startDate || startDate, b.bookingDetails?.endDate || endDate);
        // Update the slotAvailability JSON field on the billboard (stores 2 months in one JSON)
        await updateBillboardSlotAvailabilityJSON(String(b.id));
      } catch (innerError) {
        logger.error(`Failed to update availability for billboard ${b.id}:`, innerError.message);
      }
    })).catch(e => {
      logger.warn('Availability upsert after campaign creation failed:', e.message);
    });

    // Notifications: to superadmin and campaign owner
    // Only create notifications if database is available
    try {
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

    // WhatsApp notification for super admin
    sendAdminNewCampaignWhatsapp(campaignName, userName);

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

    // Also update campaign assets list
    let assets = campaign.assets;
    if (typeof assets === 'string') {
      try { assets = JSON.parse(assets); } catch { assets = []; }
    }
    if (!Array.isArray(assets)) assets = [];
    const hasAsset = assets.some((asset) => {
      if (!asset) return false;
      if (typeof asset === 'string') return asset === fileUrl;
      return String(asset.url || asset.secure_url || '') === String(fileUrl);
    });
    if (!hasAsset) {
      assets.push({ billboardId: String(billboardId), url: fileUrl });
    }

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { 
        billboards: updated,
        assets: assets
      }
    });

    // Update existing slots that might be using the default logo
    const defaultLogo = "https://res.cloudinary.com/dh0ehlpkp/image/upload/v1772717423/Logo_ssxriy.png";

    // Update grouped GeneratedSlot JSON
    let updatedGeneratedCount = 0;
    const generatedSlotRecord = await prisma.generatedSlot.findUnique({
      where: { campaignId: String(campaignId) }
    });

    if (generatedSlotRecord?.slots && typeof generatedSlotRecord.slots === 'object') {
      const groupedSlots = { ...generatedSlotRecord.slots };
      const billboardSlots = Array.isArray(groupedSlots[String(billboardId)])
        ? groupedSlots[String(billboardId)]
        : [];

      groupedSlots[String(billboardId)] = billboardSlots.map(slot => {
        if ((slot.assestUrl || slot.assetUrl) !== defaultLogo) {
          return slot;
        }

        updatedGeneratedCount += 1;
         return {
           ...slot,
           assestUrl: fileUrl,
           assetUrl: fileUrl
         };
       });

      if (updatedGeneratedCount > 0) {
        await prisma.generatedSlot.update({
          where: { campaignId: String(campaignId) },
          data: { slots: groupedSlots }
        });
      }
    }

    // Update DailySlots
    const updatedDaily = await prisma.dailySlot.updateMany({
      where: {
        campaignId: campaignId,
        assetUrl: defaultLogo
        // Note: DailySlot doesn't have billboardId directly, but campaignId + logo check is safe enough
        // especially if we only update those using the logo.
      },
      data: {
        assetUrl: fileUrl
      }
    });

    logger.info(`✅ Attached file to campaign ${campaignId}, billboard ${billboardId}. Updated ${updatedGeneratedCount} GeneratedSlots and ${updatedDaily.count} DailySlots.`);
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

    // Fetch user details for all userName/emails in campaigns
    const userEmails = [...new Set(campaigns.map(c => c.userName).filter(Boolean))];
    const users = await prisma.user.findMany({
      where: {
        email: { in: userEmails }
      },
      select: {
        email: true,
        fullName: true,
        phoneNumber: true
      }
    });

    const userMap = new Map(users.map(u => [u.email.toLowerCase(), u]));

    const enrichedCampaigns = campaigns.map(c => {
      const u = c.userName ? userMap.get(c.userName.toLowerCase()) : null;
      return {
        ...c,
        userFullName: u?.fullName || null,
        userPhone: u?.phoneNumber || null
      };
    });

    logger.campaign('All campaigns fetched', `Count: ${campaigns.length}`);
    res.json(enrichedCampaigns);
  } catch (err) {
    logger.error('Error fetching campaigns:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

// Get campaigns by user email (for billboard owners/publishers)
const getCampaignsByUserEmail = async (req, res) => {
  const requesterEmail = req.user?.email;
  if (!requesterEmail) return res.status(401).json({ error: 'Authentication required' });

  try {
    // Get publisher's billboards
    // Filter by userId (which stores the billboard owner's email in the user_id column)
    const publisherBillboards = await prisma.billboard.findMany({
      where: {
        userId: requesterEmail
      },
      select: {
        id: true
      }
    });

    const billboardIds = publisherBillboards.map(bb => bb.id);

    if (billboardIds.length === 0) {
      logger.campaign('No billboards found for publisher', `User: ${requesterEmail}`);
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

    // For publisher accounts: only return the billboards they own and mask the end-user identity.
    const safeCampaigns = filteredCampaigns.map((campaign) => {
      let billboards = campaign.billboards;
      if (typeof billboards === 'string') {
        try { billboards = JSON.parse(billboards); } catch { billboards = []; }
      }

      const ownedBillboards = Array.isArray(billboards)
        ? billboards.filter((bb) => billboardIds.includes(bb.id))
        : [];

      return {
        ...campaign,
        userName: null,
        billboards: ownedBillboards.map((bb) => ({
          ...bb,
          userName: null,
          userEmail: null,
          userId: null,
        })),
      };
    });

    logger.campaign('User campaigns fetched (publisher owner view)', `User: ${requesterEmail}, Count: ${safeCampaigns.length}`);
    res.json(safeCampaigns);
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
    const updateData = { status: newStatus };
    if (newStatus === 'APPROVED' && req.user) {
      updateData.approvedByEmail = req.user.email || null;
      updateData.approvedByRole = req.user.role || null;
    }

    const campaign = await prisma.campaign.update({
      where: { id },
      data: updateData
    });

    logger.info(`✅ Database update completed. Campaign status set to: ${campaign.status}`);

    // Verify the update actually happened by querying again
    const verifyCampaign = await prisma.campaign.findUnique({
      where: { id },
      select: { id: true, status: true, campaignName: true, startDate: true, endDate: true }
    });

    logger.campaign('Campaign status updated', `Campaign ID: ${id}, Status: ${newStatus} (requested: ${status})`);

    // Recompute slot availability asynchronously for all affected billboards
    // so the slot_availability table reflects the new campaign status immediately.
    try {
      let billboardsForSync = currentCampaign.billboards;
      if (typeof billboardsForSync === 'string') {
        try { billboardsForSync = JSON.parse(billboardsForSync); } catch { billboardsForSync = []; }
      }
      if (Array.isArray(billboardsForSync) && billboardsForSync.length > 0) {
        Promise.all(billboardsForSync.map(async (b) => {
          const bId = String(b?.id || b?.billboardId || b);
          const bStart = b?.bookingDetails?.startDate || currentCampaign.startDate;
          const bEnd = b?.bookingDetails?.endDate || currentCampaign.endDate;
          if (bId && bStart && bEnd) {
            await recomputeAndUpsertForRange(bId, bStart, bEnd);
          }
        })).catch(e => logger.warn('Async slot recompute after status update failed:', e.message));
      }
    } catch (syncErr) {
      logger.warn('Could not trigger slot recompute after status update:', syncErr.message);
    }

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
      // Get campaign header dates as fallback for billboards missing bookingDetails
      const campaignStartDate = campaignWithBillboards.startDate;
      const campaignEndDate = campaignWithBillboards.endDate;

      // Helper: format a Date or ISO string as YYYY-MM-DD in IST
      const toISTDateString = (d) => {
        if (!d) return null;
        const dt = new Date(d);
        const ist = dt.toLocaleString('en-US', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
        const [m, day, y] = ist.split('/');
        return `${y}-${m}-${day}`;
      };

      const campaignStartStr = toISTDateString(campaignStartDate);
      const campaignEndStr = toISTDateString(campaignEndDate);

      // Enrich each billboard: inject campaign-level dates wherever billboard-level dates are missing
      const enrichedBillboards = parsedBillboards.map((bb) => {
        const bdStart = bb.bookingDetails?.startDate || bb.startDate;
        const bdEnd = bb.bookingDetails?.endDate || bb.endDate;
        return {
          ...bb,
          bookingDetails: {
            startDate: bdStart || campaignStartStr,
            endDate: bdEnd || campaignEndStr,
          },
          startDate: bdStart || campaignStartStr,
          endDate: bdEnd || campaignEndStr,
        };
      });

      logger.info(`[generateSlots] Campaign ${id} — sample billboard:`, JSON.stringify(enrichedBillboards[0]).slice(0, 400));

      const campaignWithParsedBillboards = {
        ...campaignWithBillboards,
        billboards: enrichedBillboards
      };

      logger.info(`Generating slots for campaign ${id}...`);
      await generateSlots(campaignWithParsedBillboards);
      logger.campaign('Slots generated successfully after payment', `Campaign ID: ${id}`);
    } catch (slotGenError) {
      logger.error('Error generating slots after payment:', slotGenError.message);
      logger.error('Slot gen stack:', slotGenError.stack);
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
            updatedAt: new Date(),
            approvedByEmail: req.user?.email || null,
            approvedByRole: req.user?.role || null
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
    await sharedGenerateSlots({
      id: String(campaignId),
      billboards: [billboard]
    });
    logger.info(`🎉 Slot generation completed for billboard ${billboard.id}`);
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

    await sharedGenerateSlots({
      id: String(campaignId),
      billboards: approvedBillboards
    });

    for (const billboard of approvedBillboards) {
      try {
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
  return sharedGenerateSlots(campaign);
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
      const generatedSlot = await tx.generatedSlot.findUnique({
        where: { campaignId: String(campaignId) }
      });
      let deletedSlotCount = 0;
      if (generatedSlot?.slots && typeof generatedSlot.slots === 'object') {
        const groupedSlots = { ...generatedSlot.slots };
        deletedSlotCount = Array.isArray(groupedSlots[String(billboardId)])
          ? groupedSlots[String(billboardId)].length
          : 0;
        delete groupedSlots[String(billboardId)];

        if (Object.keys(groupedSlots).length === 0) {
          await tx.generatedSlot.delete({ where: { campaignId: String(campaignId) } });
        } else {
          await tx.generatedSlot.update({
            where: { campaignId: String(campaignId) },
            data: {
              slots: groupedSlots,
              billboardIds: Object.keys(groupedSlots)
            }
          });
        }
      }
      logger.info(`Deleted ${deletedSlotCount} generated slots for billboard ${billboardId}`);

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

// Create Cashfree Order
const createCashfreeOrder = async (req, res) => {
  const axios = require('axios');
  const { campaignId } = req.body;
  const userEmail = req.user?.email || 'test@example.com';

  logger.info(`=== CREATE CASHFREE ORDER REQUEST ===`);
  logger.info(`Campaign ID: ${campaignId}, User: ${userEmail}`);

  try {
    // Fetch customer details from database to avoid fallback placeholders
    let dbUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: userEmail },
          { id: Number(req.user?.id || 0) }
        ]
      }
    });

    let userName = dbUser?.fullName || 'Customer';
    let rawPhone = dbUser?.phoneNumber || '9999999999';

    if (!dbUser) {
      // Try searching in publishers table as fallback
      const dbPublisher = await prisma.publisher.findFirst({
        where: { email: userEmail }
      });
      if (dbPublisher) {
        userName = dbPublisher.name;
        rawPhone = dbPublisher.phone;
      }
    }

    let userPhone = rawPhone.replace(/\D/g, '');
    // Ensure phone number length is standard and valid for Cashfree
    if (userPhone.length < 10) {
      userPhone = '9999999999';
    } else {
      // Take last 10 digits
      userPhone = userPhone.slice(-10);
    }
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId }
    });

    if (!campaign) {
      logger.error(`Campaign ${campaignId} not found`);
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const subtotal = Number(campaign.totalAmount || 0);
    const tax = Number((subtotal * 0.18).toFixed(2));
    const totalAmount = Number((subtotal + tax).toFixed(2));

    // Generate unique order ID linked to campaign ID
    const cashfreeOrderId = `order_${campaignId}_${Date.now()}`;

    const cashfreeUrl = process.env.CASHFREE_ENV === 'production' 
      ? 'https://api.cashfree.com/pg/orders' 
      : 'https://sandbox.cashfree.com/pg/orders';

    logger.info(`Creating Cashfree order with amount ${totalAmount} on ${cashfreeUrl}`);

    const response = await axios.post(
      cashfreeUrl,
      {
        order_amount: totalAmount,
        order_currency: 'INR',
        order_id: cashfreeOrderId,
        customer_details: {
          customer_id: `cust_${userEmail.replace(/[^a-zA-Z0-9]/g, '_')}`,
          customer_phone: userPhone.startsWith('+') ? userPhone : `+91${userPhone}`.slice(-13),
          customer_email: userEmail,
          customer_name: userName
        },
        order_meta: {
          // Point return_url to front-end hash router page
          return_url: `${req.headers.origin || 'https://adscape.co.in'}/#/campaign/${campaignId}/payment?order_id={order_id}`
        }
      },
      {
        headers: {
          'x-client-id': process.env.CASHFREE_APP_ID || '12914765da53744e491fec3d14d6741921',
          'x-client-secret': process.env.CASHFREE_SECRET_KEY || 'cfsk_ma_prod_7576b0b4d5925dd9baa3aab7500ab16a_a099bd63',
          'x-api-version': '2023-08-01',
          'Content-Type': 'application/json'
        }
      }
    );

    logger.info(`Cashfree Order created successfully. Session ID: ${response.data.payment_session_id}`);
    
    res.json({
      success: true,
      payment_session_id: response.data.payment_session_id,
      order_id: cashfreeOrderId,
      order_amount: totalAmount
    });
  } catch (err) {
    logger.error('Error creating Cashfree order:', err.response?.data || err.message);
    res.status(500).json({
      error: 'Failed to create payment order',
      details: err.response?.data || err.message
    });
  }
};

// Verify Cashfree Payment status
const verifyCashfreePayment = async (req, res) => {
  const axios = require('axios');
  const { orderId, campaignId } = req.body;

  logger.info(`=== VERIFY CASHFREE PAYMENT REQUEST ===`);
  logger.info(`Order ID: ${orderId}, Campaign ID: ${campaignId}`);

  try {
    const cashfreeUrl = process.env.CASHFREE_ENV === 'production' 
      ? `https://api.cashfree.com/pg/orders/${orderId}` 
      : `https://sandbox.cashfree.com/pg/orders/${orderId}`;

    const response = await axios.get(cashfreeUrl, {
      headers: {
        'x-client-id': process.env.CASHFREE_APP_ID || '12914765da53744e491fec3d14d6741921',
        'x-client-secret': process.env.CASHFREE_SECRET_KEY || 'cfsk_ma_prod_7576b0b4d5925dd9baa3aab7500ab16a_a099bd63',
        'x-api-version': '2023-08-01'
      }
    });

    const orderData = response.data;
    logger.info(`Cashfree Order verification status: ${orderData.order_status}`);

    if (orderData.order_status === 'PAID') {
      logger.info(`Payment successful for Order: ${orderId}, Campaign: ${campaignId}. Activating campaign...`);

      const currentCampaign = await prisma.campaign.findUnique({
        where: { id: campaignId }
      });

      if (!currentCampaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      if (currentCampaign.status === 'PAYMENT_COMPLETED' || currentCampaign.status === 'SCHEDULED' || currentCampaign.status === 'LIVE') {
        logger.info(`Campaign ${campaignId} already activated/scheduled. Skipping.`);
        return res.json({
          success: true,
          message: 'Payment already verified and processed.',
          status: currentCampaign.status
        });
      }

      const campaignWithBillboards = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: {
          id: true,
          billboards: true,
          startDate: true,
          endDate: true,
          campaignName: true
        }
      });

      if (campaignWithBillboards) {
        try {
          let parsedBillboards = campaignWithBillboards.billboards;
          if (typeof parsedBillboards === 'string') {
            parsedBillboards = JSON.parse(parsedBillboards);
          }

          if (Array.isArray(parsedBillboards) && parsedBillboards.length > 0) {
            const campaignStartDate = campaignWithBillboards.startDate;
            const campaignEndDate = campaignWithBillboards.endDate;

            const toISTDateString = (d) => {
              if (!d) return null;
              const dt = new Date(d);
              const ist = dt.toLocaleString('en-US', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
              const [m, day, y] = ist.split('/');
              return `${y}-${m}-${day}`;
            };

            const campaignStartStr = toISTDateString(campaignStartDate);
            const campaignEndStr = toISTDateString(campaignEndDate);

            const enrichedBillboards = parsedBillboards.map((bb) => {
              const bdStart = bb.bookingDetails?.startDate || bb.startDate;
              const bdEnd = bb.bookingDetails?.endDate || bb.endDate;
              return {
                ...bb,
                bookingDetails: {
                  startDate: bdStart || campaignStartStr,
                  endDate: bdEnd || campaignEndStr,
                },
                startDate: bdStart || campaignStartStr,
                endDate: bdEnd || campaignEndStr,
              };
            });

            await generateSlots({
              ...campaignWithBillboards,
              billboards: enrichedBillboards
            });
            logger.campaign('Slots generated successfully after payment verification', `Campaign ID: ${campaignId}`);
          }
        } catch (slotGenError) {
          logger.error('Error generating slots after payment verification:', slotGenError.message);
        }
      }

      let finalStatus = 'PAYMENT_COMPLETED';
      let startDateToCheck = campaignWithBillboards?.startDate || currentCampaign.startDate;

      if (startDateToCheck) {
        const now = new Date();
        const startDate = new Date(startDateToCheck);
        if (!isNaN(startDate.getTime())) {
          if (now < startDate) {
            finalStatus = 'SCHEDULED';
          } else {
            finalStatus = 'LIVE';
          }
        }
      }

      const updatedCampaign = await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: finalStatus }
      });

      logger.info(`Campaign ${campaignId} successfully updated to status: ${updatedCampaign.status}`);

      return res.json({
        success: true,
        message: 'Payment verified and campaign activated/scheduled.',
        status: updatedCampaign.status
      });
    } else {
      logger.warn(`Payment not completed for Order: ${orderId}. Current status: ${orderData.order_status}`);
      return res.status(400).json({
        success: false,
        message: `Payment status is ${orderData.order_status}`,
        orderStatus: orderData.order_status
      });
    }
  } catch (err) {
    logger.error('Error verifying Cashfree payment:', err.response?.data || err.message);
    res.status(500).json({
      error: 'Failed to verify payment',
      details: err.response?.data || err.message
    });
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
  attachCampaignFile,
  createCashfreeOrder,
  verifyCashfreePayment
}; 
