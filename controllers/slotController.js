const prisma = require('../db/db');
const logger = require('../config/logger');
const { v4: uuidv4 } = require('uuid');
const { flattenGeneratedSlotRecords } = require('../utils/generatedSlotFormat');

// Get all slots
const getAllSlots = async (req, res) => {
  try {
    const slots = await prisma.generatedSlot.findMany();
    logger.db('SELECT', 'All slots fetched');
    res.json(slots);
  } catch (err) {
    logger.error('Error fetching slots:', err);
    res.status(500).send('Internal Server Error');
  }
};

// Get slots by billboard ID
const getSlotsByBillboard = async (req, res) => {
  const { billboard_id } = req.query;

  if (!billboard_id) {
    return res.status(400).send('billboard_id is required');
  }

  try {
    const records = await prisma.generatedSlot.findMany();
    const slots = flattenGeneratedSlotRecords(records, { billboardId: billboard_id }).map(slot => ({
      id: slot.id,
      billboard_id,
      start_date: slot.startDate instanceof Date ? slot.startDate.toISOString() : String(slot.startDate),
      end_date: slot.endDate instanceof Date ? slot.endDate.toISOString() : String(slot.endDate),
      slot_number: Number(slot.slotNumber)
    }));

    logger.db('SELECT', `Slots fetched for billboard ${billboard_id}`);
    res.json(slots);
  } catch (err) {
    logger.error('Database error:', err);
    res.status(500).send('Server error');
  }
};

// Get assets by screen ID (today + tomorrow), include dynamic duration.
const getAssetsByScreen = async (req, res) => {
  const { screen_id } = req.params;
  const now = new Date();
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const tomorrowEnd = new Date(); tomorrowEnd.setDate(tomorrowEnd.getDate() + 1); tomorrowEnd.setHours(23, 59, 59, 999);

  // Entry log (both logger and console)
  logger.info && logger.info(`Incoming assets request for screen ${screen_id} (${start.toISOString()} - ${tomorrowEnd.toISOString()})`);
  console.info('[ASSETS] Incoming request', { screen_id, window: `${start.toISOString()} - ${tomorrowEnd.toISOString()}` });

  try {
    const records = await prisma.generatedSlot.findMany({
      where: {
        screenId: { has: String(screen_id) }
      }
    });
    let slots = flattenGeneratedSlotRecords(records, {
      screenId: screen_id,
      startGte: start,
      endLte: tomorrowEnd
    });

    if (!slots || slots.length === 0) {
      logger.asset && logger.asset(
        'Assets response (fallback)',
        `Screen ${screen_id} window ${start.toISOString()} - ${tomorrowEnd.toISOString()}: 0 assets. Falling back to any upcoming slots.`
      );

      slots = flattenGeneratedSlotRecords(records, {
        screenId: screen_id,
        startGte: start
      }).slice(0, 20);

      // If no future slots, just grab the latest slots available
      if (!slots || slots.length === 0) {
        slots = flattenGeneratedSlotRecords(records, { screenId: screen_id })
          .sort((a, b) => b.startDate - a.startDate || Number(a.slotNumber || 0) - Number(b.slotNumber || 0))
          .slice(0, 20);
      }

      if (!slots || slots.length === 0) {
        console.info('[ASSETS] None at all', { screen_id, count: 0 });
        return res.json([]);
      }
    }

    const assets = slots.map(slot => ({
      asset_url: slot.assetUrl,
      slot_number: slot.slotNumber,
      duration: slot.duration || 10,
      campaign_id: slot.campaignId,
      play_date: slot.startDate.toISOString().slice(0, 10),
      start_date: slot.startDate,
      end_date: slot.endDate
    }));

    // Append a 10s break item at the end of each loop/day
    const groupedByDay = assets.reduce((acc, a) => {
      acc[a.play_date] = acc[a.play_date] || []; acc[a.play_date].push(a); return acc;
    }, {});
    const finalList = [];
    Object.values(groupedByDay).forEach(list => {
      finalList.push(...list);
      finalList.push({ asset_url: 'BREAK_IMAGE', slot_number: 9999, duration: 10, campaign_id: null, play_date: list[0].play_date });
    });

    if (finalList.length === 0) {
      logger.asset && logger.asset(
        'Assets response (none after grouping)',
        `Screen ${screen_id} window ${start.toISOString()} - ${tomorrowEnd.toISOString()}: 0 assets`
      );
      console.info('[ASSETS] None after grouping', { screen_id, count: 0, window: `${start.toISOString()} - ${tomorrowEnd.toISOString()}` });
      return res.json([]);
    }

    // Detailed server log of what is being sent to the player
    const sample = finalList.slice(0, 5).map(a => ({
      asset_url: a.asset_url,
      slot_number: a.slot_number,
      duration: a.duration,
      play_date: a.play_date,
      start_date: a.start_date,
      end_date: a.end_date
    }));
    logger.asset && logger.asset(
      'Assets response',
      `Screen ${screen_id} window ${start.toISOString()} - ${tomorrowEnd.toISOString()}. Total: ${finalList.length}`,
      'sample:', JSON.stringify(sample)
    );
    console.info('[ASSETS] Sent', { screen_id, total: finalList.length, sample });

    // Log all asset remote URLs (clients will download these to local storage)
    console.info(`[ASSETS] 📥 Asset remote URLs for screen ${screen_id} (${finalList.length} total) - Clients will download these to local storage:`);
    finalList.forEach((asset, index) => {
      console.info(`  [${index + 1}] Remote URL: ${asset.asset_url} (Slot: ${asset.slot_number}, Duration: ${asset.duration}s, Date: ${asset.play_date})`);
    });
    logger.info && logger.info(`📥 Asset remote URLs for screen ${screen_id}: ${finalList.map(a => a.asset_url).join(', ')}`);
    console.info(`[ASSETS] 💡 Note: Clients should send 'local_file_path' in track-play requests to log where assets are stored locally`);

    res.json(finalList);
  } catch (err) {
    logger.error("DB error:", err);
    console.error('[ASSETS] Error', err);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Track asset play
const trackAssetPlay = async (req, res) => {
  const { screen_id, asset_url, played_at, local_file_path, campaign_id, duration_ms, duration } = req.body;

  try {
    const timestamp = played_at ? new Date(played_at) : new Date();
    const playDate = timestamp.toISOString().split("T")[0];

    let parsedDurationMs =
      duration_ms != null && !Number.isNaN(Number(duration_ms))
        ? Number(duration_ms)
        : duration != null && !Number.isNaN(Number(duration))
          ? Math.round(Number(duration) * 1000)
          : null;

    // Log local file path if provided
    if (local_file_path) {
      console.info(`[ASSETS] 💾 Asset downloaded to local storage: ${local_file_path} (Screen: ${screen_id}, Asset URL: ${asset_url})`);
      logger.info && logger.info(`💾 Asset local storage path: ${local_file_path} (Screen: ${screen_id}, Asset: ${asset_url})`);
    }

    // Prefer explicit campaign_id from player; otherwise infer from generated slots
    let resolvedCampaignId = campaign_id ? String(campaign_id) : null;
    if (!resolvedCampaignId || parsedDurationMs == null) {
      const slotRecords = await prisma.generatedSlot.findMany({
        where: {
          screenId: { has: String(screen_id) }
        }
      });
      const slot = flattenGeneratedSlotRecords(slotRecords, {
        screenId: screen_id,
        assetUrl: asset_url,
        activeAt: timestamp
      })[0];

      if (!resolvedCampaignId) resolvedCampaignId = slot?.campaignId || null;
      if (parsedDurationMs == null && slot?.duration != null && !Number.isNaN(Number(slot.duration))) {
        parsedDurationMs = Math.round(Number(slot.duration) * 1000);
      }
    }

    // Save detailed play log
    await prisma.assetPlayLog.create({
      data: {
        screenId: screen_id,
        assetUrl: asset_url,
        campaignId: resolvedCampaignId,
        playedAt: timestamp,
        durationMs: parsedDurationMs
      }
    });

    // Update daily count using upsert
    // Handle null campaignId by using the appropriate unique constraint
    if (resolvedCampaignId) {
      // Use unique constraint with campaignId when it's not null
      await prisma.assetPlay.upsert({
        where: {
          screenId_assetUrl_campaignId_playDate: {
            screenId: screen_id,
            assetUrl: asset_url,
            campaignId: resolvedCampaignId,
            playDate: new Date(playDate)
          }
        },
        update: {
          playCount: {
            increment: 1
          }
        },
        create: {
          screenId: screen_id,
          assetUrl: asset_url,
          campaignId: resolvedCampaignId,
          playDate: new Date(playDate),
          playCount: 1
        }
      });
    } else {
      // When campaignId is null, use the unique constraint without campaignId
      // The constraint [screenId, assetUrl, playDate] allows only one record per day
      // So we find any existing record for this day (regardless of campaignId)
      const existing = await prisma.assetPlay.findFirst({
        where: {
          screenId: screen_id,
          assetUrl: asset_url,
          playDate: new Date(playDate)
        }
      });

      if (existing) {
        // Update existing record
        await prisma.assetPlay.update({
          where: {
            id: existing.id
          },
          data: {
            playCount: {
              increment: 1
            }
          }
        });
      } else {
        // Create new record with null campaignId
        await prisma.assetPlay.create({
          data: {
            screenId: screen_id,
            assetUrl: asset_url,
            campaignId: null,
            playDate: new Date(playDate),
            playCount: 1
          }
        });
      }
    }

    logger.asset('Play tracked', `Screen ${screen_id}, Asset: ${asset_url}`);
    console.info('[ASSETS] Play tracked', { screen_id, asset_url, local_file_path: local_file_path || 'N/A' });
    console.info(`[ASSETS] 🎬 Asset play tracked - Remote URL: ${asset_url} (Screen: ${screen_id}, Timestamp: ${timestamp.toISOString()})`);
    if (local_file_path) {
      console.info(`[ASSETS] 💾 Local storage path: ${local_file_path}`);
    }
    logger.info && logger.info(`📥 Asset remote URL: ${asset_url}${local_file_path ? `, Local path: ${local_file_path}` : ''} (Screen: ${screen_id})`);
    res.sendStatus(200);
  } catch (err) {
    logger.error("DB error:", err);
    console.error('[ASSETS] Track error', err);
    res.status(500).send("Internal Server Error");
  }
};

// Get asset logs
const getAssetLogs = async (req, res) => {
  try {
    const logs = await prisma.assetPlayLog.findMany({
      select: {
        screenId: true,
        assetUrl: true,
        playedAt: true
      },
      orderBy: {
        playedAt: 'desc'
      },
      take: 50
    });
    logger.asset('Logs fetched', logs.length, 'entries');
    console.info('[ASSETS] Logs fetched', { count: logs.length });
    res.json(logs);
  } catch (err) {
    logger.error("Error fetching logs:", err);
    console.error('[ASSETS] Logs error', err);
    res.status(500).send("Server Error");
  }
};

module.exports = {
  getAllSlots,
  getSlotsByBillboard,
  getAssetsByScreen,
  trackAssetPlay,
  getAssetLogs
}; 
