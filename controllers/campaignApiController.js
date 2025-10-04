const prisma = require('../db/db');
const logger = require('../config/logger');
const { recomputeAndUpsertForRange, ensureDefaultAvailabilityForTwoMonths } = require('./availabilityController');
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
// const { generateSlots } = require('../utils/slotGenerator');

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 20 // Allow up to 20 files
  }
});

// Campaign creation with file upload
const createCampaign = async (req, res) => {
  try {
    // Debug: Check if files are being received
    logger.info('Request headers:', req.headers);
    logger.info('Request body keys:', Object.keys(req.body));
    logger.info('Request files:', req.files);
    logger.info('Request file:', req.file);
    logger.info('Content-Type header:', req.headers['content-type']);
    
    if (!req.body.data) {
      return res.status(400).json({ error: 'Missing campaign data' });
    }

    let campaignData;
    try {
      campaignData = JSON.parse(req.body.data);
      logger.info('Parsed campaign data:', campaignData);
    } catch (parseError) {
      logger.error('Error parsing campaign data:', parseError);
      return res.status(400).json({ error: 'Invalid JSON data' });
    }

    const { userName, billboards, campaignName } = campaignData;
    
    if (!userName || !billboards || !Array.isArray(billboards)) {
      return res.status(400).json({ error: 'Missing required fields: userName and billboards array' });
    }

    // Debug logging
    logger.info('Received campaign data:', { userName, billboardsCount: billboards.length });
    logger.info('First billboard sample:', billboards[0]);

    const uploadedFiles = req.files || [];
    logger.campaign('Campaign creation started', `User: ${userName}, Billboards: ${billboards.length}`);
    logger.info('Uploaded files count:', uploadedFiles.length);
    logger.info('Uploaded files:', uploadedFiles.map(f => ({ name: f?.originalname, size: f?.size })));
    logger.info('Billboard IDs from request:', billboards.map(b => b.id));

    const campaignId = uuidv4();

    const enrichedBillboards = await Promise.all(billboards.map(async (billboard) => {
      if (!billboard || !billboard.id || !billboard.bookingDetails) {
        logger.error('Invalid billboard data:', billboard);
        throw new Error('Invalid billboard data structure');
      }

      logger.info('Processing billboard:', billboard);

      const { id, location, city, pricePerDay, bookingDetails, owner } = billboard;
      // Extract screen_id from multiple possible field names
      const screen_id = billboard.screen_id || billboard.screenId || null;
      const { startDate, endDate } = bookingDetails;

      // Log the billboard data to see what's available
      logger.info(`Processing billboard ${id}:`, {
        id,
        location,
        city,
        pricePerDay,
        owner,
        screen_id,
        bookingDetails,
        allKeys: Object.keys(billboard)
      });

      if (!startDate || !endDate) {
        logger.error('Missing booking dates for billboard:', id);
        throw new Error('Missing booking dates');
      }

      const fileUrls = [];

      const matchingFiles = uploadedFiles.filter(file =>
        file && file.originalname && file.originalname.startsWith(`${id}_`)
      );

      // Check for files that don't match the pattern
      const nonMatchingFiles = uploadedFiles.filter(file =>
        file && file.originalname && !file.originalname.startsWith(`${id}_`)
      );
      
      if (nonMatchingFiles.length > 0) {
        logger.warn(`Billboard ${id}: Found ${nonMatchingFiles.length} non-matching files:`, nonMatchingFiles.map(f => f?.originalname));
      }

      logger.info(`Billboard ${id}: Found ${matchingFiles.length} matching files`);
      logger.info(`Billboard ${id}: Matching files:`, matchingFiles.map(f => f?.originalname));

const streamUpload = (fileBuffer) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: 'auto' }, // auto detects image/video/raw
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    );
    stream.end(fileBuffer);
  });
};

      for (const file of matchingFiles) {
        try {
          if (file && file.buffer) {
            logger.info(`Uploading file ${file.originalname} to Cloudinary...`);
            const url = await streamUpload(file.buffer);
            fileUrls.push(url);
            logger.info(`Successfully uploaded ${file.originalname} to: ${url}`);
          } else {
            logger.warn(`Skipping file ${file?.originalname || 'unknown'}: missing buffer`);
          }
        } catch (error) {
          logger.error(`Failed to upload file ${file?.originalname || 'unknown'}:`, error.message);
        }
      }

      logger.info(`Billboard ${id}: Uploaded ${fileUrls.length} files`);

      // Calculate total price for this billboard
      const days = (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24) + 1;
      const totalPrice = days * pricePerDay;

      const enrichedBillboard = {
        id,
        location,
        city,
        pricePerDay,
        totalPrice, // Add total price for this billboard
        bookingDetails: {
          startDate,
          endDate
        },
        files: fileUrls,
        owner,
        screen_id: screen_id, // Ensure screen_id is stored
        // Campaign-related information for each billboard
        userName: userName,
        status: "PENDING",
        createDate: new Date().toISOString(),
        endDate: endDate,
        billboardCampaignId: `${campaignId}_${id}`, // Generate unique billboard campaign ID
        // Keep all existing billboard details
        ...billboard
      };

      logger.info(`Enriched billboard ${id} with screen_id:`, enrichedBillboard.screen_id);

      return enrichedBillboard;
    }));

    const startDate = enrichedBillboards[0]?.bookingDetails.startDate;
    const endDate = enrichedBillboards[0]?.bookingDetails.endDate;

    // Calculate totalAmount
    const totalAmount = enrichedBillboards.reduce((sum, b) => {
      const days = (new Date(b.bookingDetails.endDate) - new Date(b.bookingDetails.startDate)) / (1000 * 60 * 60 * 24) + 1;
      return sum + (days * b.pricePerDay);
    }, 0);

    logger.info('Storing campaign in database with enriched billboards:', enrichedBillboards.map(b => ({
      id: b.id,
      filesCount: b.files?.length || 0,
      files: b.files
    })));

    await prisma.campaign.create({
      data: {
        id: campaignId,
        userName,
        campaignName: campaignName || "Auto Campaign",
        status: "PENDING",
        totalAmount,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        billboards: enrichedBillboards
      }
    });

    // After create, initialize and update availability cache for involved billboards
    try {
      for (const b of enrichedBillboards) {
        await ensureDefaultAvailabilityForTwoMonths(String(b.id));
        await recomputeAndUpsertForRange(String(b.id), b.bookingDetails?.startDate || startDate, b.bookingDetails?.endDate || endDate);
      }
    } catch (e) {
      logger.warn('Availability upsert after campaign creation failed:', e.message);
    }

    // Notifications: to superadmin and campaign owner
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
    } catch (e) {
      logger.warn('Failed to create campaign creation notifications:', e.message);
    }

    logger.campaign('Campaign created successfully', `ID: ${campaignId}, User: ${userName}`);
    
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

// Get campaigns by user
const getCampaignsByUser = async (req, res) => {
  const { user } = req.query;
  logger.campaign('Fetching campaigns', `User: ${user}`);
  
  try {
    const campaigns = await prisma.campaign.findMany({
      where: {
        userName: user
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    logger.campaign('Campaigns fetched', `User: ${user}, Count: ${campaigns.length}`);
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

// Get campaigns by user email (for billboard owners)
const getCampaignsByUserEmail = async (req, res) => {
  const { userEmail } = req.query;

  try {
    // For now, return empty array to test if endpoint works
    logger.campaign('User campaigns fetched (owner view)', `User: ${userEmail}, Count: 0`);
    res.json([]);
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

  try {
    const campaign = await prisma.campaign.update({
      where: { id },
      data: { status }
    });

    if (status.toLowerCase() === 'approved') {
      logger.campaign('Campaign approved, generating slots', `Campaign ID: ${id}`);

      try {
        // Fetch campaign with billboards
        const campaignWithBillboards = await prisma.campaign.findUnique({
          where: { id },
          select: {
            id: true,
            billboards: true
          }
        });

        if (campaignWithBillboards) {
          // Parse the billboards JSON field if it's a string
          let parsedBillboards = campaignWithBillboards.billboards;
          if (typeof parsedBillboards === 'string') {
            try {
              parsedBillboards = JSON.parse(parsedBillboards);
            } catch (parseError) {
              logger.error('Error parsing billboards JSON:', parseError);
              return;
            }
          }

          // Create a new object with parsed billboards
          const campaignWithParsedBillboards = {
            ...campaignWithBillboards,
            billboards: parsedBillboards
          };

          await generateSlots(campaignWithParsedBillboards);
          logger.campaign('Slots generated successfully', `Campaign ID: ${id}`);
        } else {
          logger.error('Campaign not found for slot generation', `Campaign ID: ${id}`);
        }
      } catch (slotError) {
        logger.error('Error generating slots:', slotError);
      }
    }

    logger.campaign('Campaign status updated', `Campaign ID: ${id}, Status: ${status}`);
    res.json({ message: 'Status updated', campaign });
  } catch (err) {
    logger.error('Error updating status:', err);
    res.status(500).json({ error: 'Internal server error.' });
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
        logger.slot(`✅ Created 1 slot for ${billboardId} on ${dayStart.toISOString().slice(0,10)}`);
      } else {
        logger.slot(`⛔ Slot already exists for ${billboardId} on ${dayStart.toISOString().slice(0,10)}`);
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
  updateCampaignStatusBasedOnBillboards
}; 