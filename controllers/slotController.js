const prisma = require('../db/db');
const logger = require('../config/logger');
const { v4: uuidv4 } = require('uuid');

// Get all slots
const getAllSlots = async (req, res) => {
  try {
    const slots = await prisma.generatedSlot.findMany({
      include: {
        campaign: {
          select: {
            id: true,
            campaignName: true,
            status: true
          }
        },
        billboard: {
          select: {
            id: true,
            location: true,
            city: true
          }
        }
      }
    });
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
    const slots = await prisma.generatedSlot.findMany({
      where: {
        billboardId: billboard_id
      },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        slotNumber: true
      },
      orderBy: [
        { startDate: 'asc' },
        { slotNumber: 'asc' }
      ]
    });

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
  const start = new Date(); start.setHours(0,0,0,0);
  const tomorrowEnd = new Date(); tomorrowEnd.setDate(tomorrowEnd.getDate() + 1); tomorrowEnd.setHours(23,59,59,999);

  // Entry log (both logger and console)
  logger.info && logger.info(`Incoming assets request for screen ${screen_id} (${start.toISOString()} - ${tomorrowEnd.toISOString()})`);
  console.info('[ASSETS] Incoming request', { screen_id, window: `${start.toISOString()} - ${tomorrowEnd.toISOString()}` });

  try {
    const slots = await prisma.generatedSlot.findMany({
      where: {
        screenId: screen_id,
        startDate: { gte: start },
        endDate: { lte: tomorrowEnd }
      },
      orderBy: [{ startDate: 'asc' }, { slotNumber: 'asc' }]
    });

    if (!slots || slots.length === 0) {
      logger.asset && logger.asset(
        'Assets response (none)',
        `Screen ${screen_id} window ${start.toISOString()} - ${tomorrowEnd.toISOString()}: 0 assets`
      );
      console.info('[ASSETS] None', { screen_id, count: 0, window: `${start.toISOString()} - ${tomorrowEnd.toISOString()}` });
      return res.json([]);
    }

    const assets = slots.map(slot => ({
      asset_url: slot.assetUrl,
      slot_number: slot.slotNumber,
      duration: slot.duration || 10,
      campaign_id: slot.campaignId,
      play_date: slot.startDate.toISOString().slice(0,10),
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

    res.json(finalList);
  } catch (err) {
    logger.error("DB error:", err);
    console.error('[ASSETS] Error', err);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Track asset play
const trackAssetPlay = async (req, res) => {
  const { screen_id, asset_url, played_at } = req.body;

  try {
    const timestamp = played_at ? new Date(played_at) : new Date();
    const playDate = timestamp.toISOString().split("T")[0];

    // Fetch campaign_id from generated_slots
    const slot = await prisma.generatedSlot.findFirst({
      where: {
        screenId: screen_id,
        assetUrl: asset_url,
        startDate: {
          lte: timestamp
        },
        endDate: {
          gte: timestamp
        }
      },
      select: {
        campaignId: true
      }
    });

    const campaign_id = slot?.campaignId || null;

    // Save detailed play log
    await prisma.assetPlayLog.create({
      data: {
        screenId: screen_id,
        assetUrl: asset_url,
        campaignId: campaign_id,
        playedAt: timestamp
      }
    });

    // Update daily count using upsert
    await prisma.assetPlay.upsert({
      where: {
        screenId_assetUrl_campaignId_playDate: {
          screenId: screen_id,
          assetUrl: asset_url,
          campaignId: campaign_id,
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
        campaignId: campaign_id,
        playDate: new Date(playDate),
        playCount: 1
      }
    });

    logger.asset('Play tracked', `Screen ${screen_id}, Asset: ${asset_url}`);
    console.info('[ASSETS] Play tracked', { screen_id, asset_url });
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