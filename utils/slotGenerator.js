const prisma = require('../db/db');
const logger = require('../config/logger');
const { v4: uuidv4 } = require('uuid');

// Helper to get start & end of a given date (local time)
function getDayRange(date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);

  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

async function generateSlots(campaign) {
  try {
    const billboards = campaign.billboards;

    logger.info('Starting slot generation for campaign:', campaign.id);
    logger.info('Campaign billboards:', billboards);
    logger.info('Billboards type:', typeof billboards);
    logger.info('Is billboards an array?', Array.isArray(billboards));

    if (!Array.isArray(billboards)) {
      logger.warn("Billboards data missing or not an array", { billboards });
      return;
    }

    if (billboards.length === 0) {
      logger.warn("No billboards in campaign", { campaignId: campaign.id });
      return;
    }

    for (const billboard of billboards) {
      const billboardId = billboard.id;
      const assetUrl = billboard.files?.[0];
      let screen_id = billboard.screen_id || billboard.screenId;
      if (!screen_id && billboardId) {
        const dbBillboard = await prisma.billboard.findUnique({ where: { id: billboardId }, select: { screen_id: true } });
        screen_id = dbBillboard?.screen_id || null;
      }
      const { startDate, endDate } = billboard.bookingDetails;

      // Extract asset scheduling information
      const assetScheduling = billboard.assetScheduling || {};
      const assetStartDate = assetScheduling.assetStartDate || startDate;
      const assetEndDate = assetScheduling.assetEndDate || endDate;
      const duration = assetScheduling.duration || 15; // Default 15 seconds

      logger.info(`Processing billboard ${billboardId}:`, {
        assetUrl,
        screen_id,
        startDate,
        endDate,
        assetStartDate,
        assetEndDate,
        duration,
        files: billboard.files,
        fullBillboard: billboard
      });

      if (!startDate || !endDate || !assetUrl) {
        logger.warn(`Missing data for billboard ${billboardId}:`, {
          hasStartDate: !!startDate,
          hasEndDate: !!endDate,
          hasAssetUrl: !!assetUrl
        });
        continue;
      }

      const start = new Date(assetStartDate);
      const end = new Date(assetEndDate);

      // --- REAL campaign slots: exactly one per day within range, cap 8/day overall ---
      for (
        let current = new Date(start);
        current <= end;
        current.setDate(current.getDate() + 1)
      ) {
        const { start: dayStart, end: dayEnd } = getDayRange(current);
        // If this campaign already has a slot for this billboard on this day, skip
        const existingForCampaign = await prisma.generatedSlot.findFirst({
          where: {
            billboardId,
            campaignId: campaign.id,
            startDate: { gte: dayStart, lte: dayEnd }
          }
        });
        if (existingForCampaign) {
          logger.slot(`Skipped: campaign ${campaign.id} already has a slot for ${billboardId} on ${dayStart.toDateString()}`);
          continue;
        }

        // Enforce max 8 slots per billboard per day overall
        const slotCountThisDay = await prisma.generatedSlot.count({
          where: {
            billboardId,
            startDate: { gte: dayStart, lte: dayEnd }
          }
        });
        if (slotCountThisDay >= 8) {
          logger.slot(`Skipped: ${billboardId} already has 8 slots on ${dayStart.toDateString()}`);
          continue;
        }

        const slotNumber = slotCountThisDay + 1;

        await prisma.generatedSlot.create({
          data: {
            campaignId: campaign.id,
            billboardId,
            assetUrl,
            startDate: dayStart,
            endDate: dayEnd,
            duration: duration,
            slotNumber,
            screenId: screen_id
          }
        });

        logger.slot(`Slot #${slotNumber} for ${billboardId} on ${dayStart.toDateString()}`);
      }
    }

    logger.info('Slot generation completed for campaign:', campaign.id);
  } catch (error) {
    logger.error('Error in generateSlots function:', error);
    throw error;
  }
}

module.exports = { generateSlots };
