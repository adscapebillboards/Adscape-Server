const express = require('express');
const router = express.Router();
const prisma = require('../db/db');
const logger = require('../config/logger');
const { generateSlots } = require('../utils/slotGenerator');
const {
  createCampaign,
  getCampaignsByUser,
  getAllCampaigns,
  getCampaignsByUserEmail,
  updateCampaignStatus,
  updateCampaignName,
  upload,
  updateBillboardStatus,
  getCampaignWithBillboardStatuses,
  deleteCampaign,
  deleteBillboardFromCampaign,
  completePayment,
  attachCampaignFile
} = require('../controllers/campaignApiController');

// Campaign creation — JSON body only (fast path, no file upload blocking)
router.post('/create-campaign', createCampaign);

// Attach a file URL to a campaign billboard (called after async TUS upload completes)
router.post('/campaigns/:id/attach-file', attachCampaignFile);

// Get campaigns by user
router.get('/campaigns', getCampaignsByUser);

// Get all campaigns (admin)
router.get('/campaignsu', getAllCampaigns);

// Get campaigns by user email (for billboard owners)
router.get('/campaignsuz', getCampaignsByUserEmail);

// Complete payment for a campaign (dedicated endpoint)
router.post('/campaigns/:id/complete-payment', completePayment);

// Update campaign status
router.put('/campaigns/:id/status', updateCampaignStatus);

// Update individual billboard status within a campaign
router.put('/campaigns/:campaignId/billboards/:billboardId/status', updateBillboardStatus);

// Get campaign with individual billboard statuses
router.get('/campaigns/:id/with-billboard-statuses', getCampaignWithBillboardStatuses);

// Update campaign name
router.put('/update-campaign-name', updateCampaignName);

// Delete campaign
router.delete('/campaigns/:id', deleteCampaign);

// Delete individual billboard from campaign
router.delete('/campaigns/:campaignId/billboards/:billboardId', deleteBillboardFromCampaign);

// ===== DEV HELPER: Generate slots for today (bypasses payment gate) =====
router.post('/campaigns/:id/generate-slots-today', async (req, res) => {
  const { id } = req.params;
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    // Get today as YYYY-MM-DD in IST
    const now = new Date();
    const istStr = now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
    const [m, d, y] = istStr.split('/');
    const todayIST = `${y}-${m}-${d}`;

    let billboards = campaign.billboards;
    if (typeof billboards === 'string') billboards = JSON.parse(billboards);
    if (!Array.isArray(billboards) || billboards.length === 0) {
      return res.status(400).json({ error: 'Campaign has no billboards' });
    }

    const defaultAsset = 'https://res.cloudinary.com/dh0ehlpkp/image/upload/v1772717423/Logo_ssxriy.png';
    let totalCreated = 0;

    for (const bb of billboards) {
      const billboardId = String(bb.id);
      const assetUrl = bb.files?.[0] || bb.creative || defaultAsset;
      const screenId = bb.screen_id || bb.screenId || null;

      // Skip if slots already exist today for this billboard in this campaign
      const existing = await prisma.generatedSlot.count({
        where: {
          campaignId: id,
          billboardId,
          startDate: { gte: new Date(`${todayIST}T00:00:00Z`), lte: new Date(`${todayIST}T23:59:59Z`) }
        }
      });
      if (existing > 0) {
        logger.info(`[DEV] Slots already exist for billboard ${billboardId} on ${todayIST} — skipping`);
        continue;
      }

      await prisma.generatedSlot.create({
        data: {
          campaignId: String(id),
          billboardId,
          assetUrl,
          startDate: new Date(`${todayIST}T00:00:00.000Z`),
          endDate: new Date(`${todayIST}T23:59:59.000Z`),
          duration: 15,
          slotNumber: 1,
          screenId: screenId ? String(screenId) : null
        }
      });
      totalCreated++;
      logger.info(`[DEV] Created slot for billboard ${billboardId} on ${todayIST}`);
    }

    res.json({
      success: true,
      message: `Created ${totalCreated} slot(s) for today (${todayIST})`,
      date: todayIST,
      slotsCreated: totalCreated
    });
  } catch (err) {
    logger.error('[DEV] generate-slots-today error:', err.message);
    res.status(500).json({ error: err.message });
  }
});
// ===== END DEV HELPER =====

// Get assets for player with enhanced features
router.get('/assets/:screenId', async (req, res) => {
  try {
    const { screenId } = req.params;
    const { date, includeExpiration } = req.query;

    // Use provided date or default to today
    const targetDate = date || new Date().toISOString().slice(0, 10);
    const requestTime = new Date().toISOString();
    const userAgent = req.get('User-Agent') || 'Unknown';
    const clientIP = req.ip || req.connection.remoteAddress || 'Unknown';

    // Log the incoming request
    logger.info('=== ENHANCED ASSETS REQUEST RECEIVED ===');
    logger.info(`Request Time: ${requestTime}`);
    logger.info(`Screen ID: ${screenId}`);
    logger.info(`Target Date: ${targetDate}`);
    logger.info(`Include Expiration: ${includeExpiration}`);
    logger.info(`Client IP: ${clientIP}`);
    logger.info(`User Agent: ${userAgent}`);
    logger.info(`Request Method: ${req.method}`);
    logger.info(`Request URL: ${req.originalUrl}`);
    logger.info('========================================');

    // Get slots for the target date
    const slots = await prisma.generatedSlot.findMany({
      where: {
        screenId: screenId,
        startDate: {
          gte: new Date(`${targetDate}T00:00:00Z`),
          lt: new Date(`${targetDate}T23:59:59Z`)
        }
      },
      orderBy: {
        slotNumber: 'asc'
      }
    });

    logger.info(`Database query completed for screen ${screenId}:`);
    logger.info(`- Found ${slots.length} slots in database`);
    logger.info(`- Date range: ${targetDate}T00:00:00Z to ${targetDate}T23:59:59Z`);

    // Calculate expiration date (end of day + 1 day buffer)
    const expirationDate = new Date(`${targetDate}T23:59:59Z`);
    expirationDate.setDate(expirationDate.getDate() + 1);

    // Format assets for player with enhanced metadata
    const assets = slots.map(slot => {
      const asset = {
        asset_url: slot.assetUrl,
        slot_number: slot.slotNumber,
        duration: slot.duration || 10, // Default 10 seconds
        campaign_id: slot.campaignId,
        // Enhanced metadata
        file_type: getFileType(slot.assetUrl),
        file_size: null, // Will be populated if available
        created_at: slot.createdAt?.toISOString(),
        updated_at: slot.updatedAt?.toISOString()
      };

      // Add expiration information if requested
      if (includeExpiration === 'true') {
        asset.expires_at = expirationDate.toISOString();
        asset.expires_in_hours = Math.round((expirationDate.getTime() - Date.now()) / (1000 * 60 * 60));
      }

      return asset;
    });

    // Log detailed asset information
    logger.info(`=== ENHANCED ASSETS RESPONSE FOR SCREEN ${screenId} ===`);
    logger.info(`Total assets: ${assets.length}`);
    logger.info(`Response date: ${targetDate}`);
    logger.info(`Response time: ${new Date().toISOString()}`);

    if (assets.length > 0) {
      logger.info(`✅ ASSETS FOUND: ${assets.length} assets available for screen ${screenId}`);
      console.info(`[ASSETS] 📥 Asset download paths for screen ${screenId} (${assets.length} total):`);
      assets.forEach((asset, index) => {
        logger.info(`Asset ${index + 1}:`);
        logger.info(`  - URL: ${asset.asset_url}`);
        logger.info(`  - Slot Number: ${asset.slot_number}`);
        logger.info(`  - Duration: ${asset.duration}s`);
        logger.info(`  - Campaign ID: ${asset.campaign_id}`);
        logger.info(`  - File Type: ${asset.file_type}`);
        if (asset.expires_at) {
          logger.info(`  - Expires At: ${asset.expires_at}`);
          logger.info(`  - Expires In: ${asset.expires_in_hours} hours`);
        }
        // Log download path
        console.info(`  [${index + 1}] 📥 Download Path: ${asset.asset_url} (Slot: ${asset.slot_number}, Type: ${asset.file_type}, Duration: ${asset.duration}s)`);
      });
      // Log all remote URLs in a single line for easy tracking
      const allPaths = assets.map(a => a.asset_url).join(', ');
      logger.info(`📥 All asset remote URLs: ${allPaths}`);
      console.info(`[ASSETS] 📥 All remote URLs: ${allPaths}`);
      console.info(`[ASSETS] 💡 Note: Clients should send 'local_file_path' in track-play requests to log where assets are stored locally`);
    } else {
      logger.info(`❌ NO ASSETS FOUND: Screen ${screenId} has no assets assigned for ${targetDate}`);
      logger.info(`   This means the player will show a static image or default content`);
      console.info(`[ASSETS] 📥 No asset download paths for screen ${screenId} on ${targetDate}`);
    }
    logger.info('==============================================');

    // Send response with enhanced metadata
    const response = {
      assets,
      metadata: {
        screen_id: screenId,
        date: targetDate,
        total_assets: assets.length,
        generated_at: new Date().toISOString(),
        expires_at: includeExpiration === 'true' ? expirationDate.toISOString() : undefined
      }
    };

    res.json(response);

    // Log final summary
    if (assets.length > 0) {
      logger.info(`🎯 FINAL RESULT: Screen ${screenId} received ${assets.length} assets successfully`);
    } else {
      logger.info(`⚠️  FINAL RESULT: Screen ${screenId} received 0 assets - will show default content`);
    }

  } catch (err) {
    logger.error('=== ERROR FETCHING ENHANCED ASSETS ===');
    logger.error(`Screen ID: ${req.params.screenId}`);
    logger.error(`Error: ${err.message}`);
    logger.error(`Stack trace: ${err.stack}`);
    logger.error('=====================================');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper function to determine file type from URL
function getFileType(url) {
  if (!url) return 'unknown';

  const extension = url.split('.').pop()?.toLowerCase();
  const imageTypes = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];
  const videoTypes = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'flv'];

  if (imageTypes.includes(extension)) return 'image';
  if (videoTypes.includes(extension)) return 'video';

  return 'unknown';
}

// Track asset play
router.post('/track-play', async (req, res) => {
  try {
    const { screen_id, asset_url, played_at, local_file_path } = req.body;
    const requestTime = new Date().toISOString();
    const clientIP = req.ip || req.connection.remoteAddress || 'Unknown';

    // Log the incoming play request
    logger.info('=== ASSET PLAY REQUEST RECEIVED ===');
    logger.info(`Request Time: ${requestTime}`);
    logger.info(`Screen ID: ${screen_id}`);
    logger.info(`Asset URL: ${asset_url}`);
    logger.info(`Played At: ${played_at}`);
    if (local_file_path) {
      logger.info(`Local File Path: ${local_file_path}`);
    }
    logger.info(`Client IP: ${clientIP}`);
    logger.info(`Request Method: ${req.method}`);
    logger.info(`Request URL: ${req.originalUrl}`);
    logger.info('===================================');
    console.info(`[ASSETS] 🎬 Asset play tracked - Remote URL: ${asset_url} (Screen: ${screen_id}, Time: ${played_at})`);
    if (local_file_path) {
      console.info(`[ASSETS] 💾 Asset downloaded to local storage: ${local_file_path}`);
      logger.info(`💾 Local storage path: ${local_file_path}`);
    }

    // Log the play to database
    await prisma.assetPlayLog.create({
      data: {
        screenId: screen_id,
        assetUrl: asset_url,
        playedAt: new Date(played_at)
      }
    });

    logger.info(`✅ Play tracked successfully: Screen ${screen_id}, Asset ${asset_url}`);
    res.json({ message: 'Play tracked successfully' });
  } catch (err) {
    logger.error('=== ERROR TRACKING PLAY ===');
    logger.error(`Screen ID: ${req.body.screen_id}`);
    logger.error(`Asset URL: ${req.body.asset_url}`);
    logger.error(`Error: ${err.message}`);
    logger.error(`Stack trace: ${err.stack}`);
    logger.error('============================');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check for player
router.get('/health', (req, res) => {
  const requestTime = new Date().toISOString();
  const clientIP = req.ip || req.connection.remoteAddress || 'Unknown';
  const userAgent = req.get('User-Agent') || 'Unknown';

  // Log the health check request
  logger.info('=== HEALTH CHECK REQUEST ===');
  logger.info(`Request Time: ${requestTime}`);
  logger.info(`Client IP: ${clientIP}`);
  logger.info(`User Agent: ${userAgent}`);
  logger.info(`Request Method: ${req.method}`);
  logger.info(`Request URL: ${req.originalUrl}`);
  logger.info('===========================');

  const response = {
    status: 'ok',
    message: 'Player API is running',
    timestamp: requestTime
  };

  logger.info(`✅ Health check response sent: ${JSON.stringify(response)}`);
  res.json(response);
});

// Trigger modal for a specific screen
router.post('/trigger-modal/:screenId', async (req, res) => {
  try {
    const { screenId } = req.params;
    const requestTime = new Date().toISOString();
    const clientIP = req.ip || req.connection.remoteAddress || 'Unknown';
    const userAgent = req.get('User-Agent') || 'Unknown';

    // Log the modal trigger request
    logger.info('=== MODAL TRIGGER REQUEST ===');
    logger.info(`Request Time: ${requestTime}`);
    logger.info(`Screen ID: ${screenId}`);
    logger.info(`Client IP: ${clientIP}`);
    logger.info(`User Agent: ${userAgent}`);
    logger.info(`Request Method: ${req.method}`);
    logger.info(`Request URL: ${req.originalUrl}`);
    logger.info('============================');

    // Here you would typically:
    // 1. Store the modal trigger in database
    // 2. Send push notification to the device
    // 3. Or use WebSocket to notify the app in real-time

    // For now, we'll just log it and return success
    logger.info(`✅ Modal trigger request received for screen ${screenId}`);

    const response = {
      success: true,
      message: 'Modal trigger request received',
      screenId: screenId,
      timestamp: requestTime
    };

    logger.info(`✅ Modal trigger response sent: ${JSON.stringify(response)}`);
    res.json(response);

  } catch (err) {
    logger.error('=== ERROR TRIGGERING MODAL ===');
    logger.error(`Screen ID: ${req.params.screenId}`);
    logger.error(`Error: ${err.message}`);
    logger.error(`Stack trace: ${err.stack}`);
    logger.error('==============================');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get modal status for a screen
router.get('/modal-status/:screenId', async (req, res) => {
  try {
    const { screenId } = req.params;
    const requestTime = new Date().toISOString();

    // Log the modal status request
    logger.info('=== MODAL STATUS REQUEST ===');
    logger.info(`Request Time: ${requestTime}`);
    logger.info(`Screen ID: ${screenId}`);
    logger.info(`Request Method: ${req.method}`);
    logger.info(`Request URL: ${req.originalUrl}`);
    logger.info('===========================');

    // For now, return a simple status
    // In a real implementation, you'd check the database for pending modal triggers
    const response = {
      screenId: screenId,
      hasPendingModal: false, // This would be checked from database
      lastModalTrigger: null,
      timestamp: requestTime
    };

    logger.info(`✅ Modal status response sent: ${JSON.stringify(response)}`);
    res.json(response);

  } catch (err) {
    logger.error('=== ERROR GETTING MODAL STATUS ===');
    logger.error(`Screen ID: ${req.params.screenId}`);
    logger.error(`Error: ${err.message}`);
    logger.error('==================================');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Test endpoint to manually generate slots
router.post('/test-generate-slots/:campaignId', async (req, res) => {
  try {
    const { campaignId } = req.params;

    logger.info('Manual slot generation requested for campaign:', campaignId);

    // Fetch the campaign with billboards data
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId }
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    logger.info('Campaign found:', { id: campaign.id, status: campaign.status });
    logger.info('Campaign billboards:', campaign.billboards);

    await generateSlots(campaign);

    // Check how many slots were created
    const slotCount = await prisma.generatedSlot.count({
      where: { campaignId: campaignId }
    });

    logger.info(`Slots generated successfully. Total slots: ${slotCount}`);
    res.json({
      message: 'Slots generated successfully',
      campaignId,
      totalSlots: slotCount
    });
  } catch (err) {
    logger.error('Error in manual slot generation:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// Get slots for a campaign (debugging)
router.get('/slots/:campaignId', async (req, res) => {
  try {
    const { campaignId } = req.params;

    const slots = await prisma.generatedSlot.findMany({
      where: { campaignId },
      orderBy: { startDate: 'asc' }
    });

    res.json({
      campaignId,
      totalSlots: slots.length,
      slots
    });
  } catch (err) {
    logger.error('Error fetching slots:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// Check 10-digit pairing code
router.get('/check-pairing/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const billboard = await prisma.billboard.findFirst({
      where: { screen_id: code }
    });

    if (billboard) {
      logger.info(`✅ Pairing code mapped: ${code} to Billboard ${billboard.id}`);
      res.json({ isPaired: true, billboardId: billboard.id });
    } else {
      res.json({ isPaired: false });
    }
  } catch (err) {
    logger.error('Error checking pairing code:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Register or update a player screen
router.post('/register-screen', async (req, res) => {
  try {
    const { machineId, screenId, resolution, os, appVersion } = req.body;

    // Detect IP address
    const ipAddress =
      req.headers['x-forwarded-for'] ||
      req.socket.remoteAddress ||
      null;

    // Check if already exists
    let screen = await prisma.playerScreen.findUnique({
      where: { machineId }
    });

    if (!screen) {
      // First time registration
      screen = await prisma.playerScreen.create({
        data: {
          machineId,
          screenId,
          resolution,
          os,
          appVersion,
          ipAddress
        }
      });

      logger.info(`✅ Player registered: ${machineId} (${screenId})`);
    } else {
      // Update existing info (heartbeat / reconnect)
      screen = await prisma.playerScreen.update({
        where: { machineId },
        data: {
          screenId,
          resolution,
          os,
          appVersion,
          ipAddress
        }
      });

      logger.info(`🔄 Player updated: ${machineId} (${screenId})`);
    }

    res.json({
      message: 'Player registered successfully',
      screen
    });
  } catch (err) {
    logger.error('Error registering player:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// Get modal configuration (for player app)
router.get('/modal-config', async (req, res) => {
  try {
    // Example: fetch modal from DB (or config table)
    // Here I'll just hardcode JSON — replace with Prisma query later
    const modalConfig = {
      title: "Welcome 🎉",
      message: "This modal is fully remote-controlled via DB.",
      backgroundColor: "#1E1E2C",
      textColor: "#FFFFFF",
      animation: "slide_up", // fade_in | slide_up | slide_down | scale_in
      buttons: [
        { text: "Close", action: "close" },
        { text: "Learn More", action: "open_url", url: "https://example.com" }
      ]
    };

    res.json(modalConfig);
  } catch (err) {
    logger.error("Error fetching modal config:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

let globalModalFlag = true; // Or fetch from DB/config

router.get('/modal-visibility', async (req, res) => {
  try {
    // Optional: you can fetch modal flag from DB per screenId
    // const { screenId } = req.query;
    // const modalConfig = await prisma.modalConfig.findFirst({ where: { screenId } });

    res.json({ showModal: globalModalFlag });
  } catch (err) {
    logger.error('Error fetching modal visibility:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Optional: endpoint to toggle modal flag dynamically
router.post('/modal-visibility/toggle', (req, res) => {
  globalModalFlag = !globalModalFlag;
  res.json({ showModal: globalModalFlag });
});



module.exports = router; 