const prisma = require('../db/db');
const logger = require('../config/logger');
const { getDeveloperMode } = require('./developerMode');

function parseDateInput(value) {
  if (!value) return null;

  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(`${raw}T00:00:00.000Z`);
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getUTCDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function getUTCDateBounds(dateKey) {
  return {
    start: new Date(`${dateKey}T00:00:00.000Z`),
    end: new Date(`${dateKey}T23:59:59.999Z`)
  };
}

function enumerateDateKeys(startDate, endDate) {
  const keys = [];
  const cursor = new Date(startDate);
  cursor.setUTCHours(0, 0, 0, 0);

  const final = new Date(endDate);
  final.setUTCHours(0, 0, 0, 0);

  while (cursor <= final) {
    keys.push(getUTCDateKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return keys;
}

function buildSlotIndex(existingSlots, campaignId) {
  const occupiedByDate = new Map();
  const campaignDates = new Set();

  for (const slot of existingSlots) {
    const dateKey = getUTCDateKey(slot.startDate);

    if (!occupiedByDate.has(dateKey)) {
      occupiedByDate.set(dateKey, new Set());
    }

    if (slot.slotNumber != null) {
      occupiedByDate.get(dateKey).add(slot.slotNumber);
    }

    if (String(slot.campaignId) === String(campaignId)) {
      campaignDates.add(dateKey);
    }
  }

  return { occupiedByDate, campaignDates };
}

function findFirstAvailableSlot(occupiedSlots, maxSlotsPerDay) {
  for (let slotNumber = 1; slotNumber <= maxSlotsPerDay; slotNumber += 1) {
    if (!occupiedSlots.has(slotNumber)) {
      return slotNumber;
    }
  }

  return null;
}

function toPositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

async function resolveBillboardMetadata(billboardId) {
  if (!billboardId) return null;

  return prisma.billboard.findUnique({
    where: { id: billboardId },
    select: {
      screen_id: true,
      max_slots_per_day: true
    }
  });
}

async function generateSlots(campaign) {
  try {
    const billboards = campaign.billboards;
    const developerModeEnabled = await getDeveloperMode();

    logger.info('Starting slot generation for campaign:', campaign.id);
    logger.info('Developer mode state for slot generation:', developerModeEnabled);

    if (!Array.isArray(billboards)) {
      logger.warn('Billboards data missing or not an array', { billboards });
      return;
    }

    if (billboards.length === 0) {
      logger.warn('No billboards in campaign', { campaignId: campaign.id });
      return;
    }

    for (const billboard of billboards) {
      const billboardId = String(billboard.id);
      const assetUrl = billboard.files?.[0];
      const bookingStart = billboard.assetScheduling?.assetStartDate || billboard.bookingDetails?.startDate || billboard.startDate;
      const bookingEnd = billboard.assetScheduling?.assetEndDate || billboard.bookingDetails?.endDate || billboard.endDate;

      if (!billboardId || !assetUrl || !bookingStart || !bookingEnd) {
        logger.warn(`Missing slot data for billboard ${billboardId || 'unknown'}`, {
          hasBillboardId: !!billboardId,
          hasAssetUrl: !!assetUrl,
          hasBookingStart: !!bookingStart,
          hasBookingEnd: !!bookingEnd
        });
        continue;
      }

      const startDate = parseDateInput(bookingStart);
      const endDate = parseDateInput(bookingEnd);

      if (!startDate || !endDate || startDate > endDate) {
        logger.warn(`Invalid slot range for billboard ${billboardId}`, {
          bookingStart,
          bookingEnd
        });
        continue;
      }

      let effectiveStartDate = startDate;
      if (developerModeEnabled) {
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);

        if (today < effectiveStartDate) {
          logger.info(`Developer mode active: shifting slot generation start for billboard ${billboardId} to today`, {
            campaignId: campaign.id,
            originalStartDate: effectiveStartDate.toISOString(),
            effectiveStartDate: today.toISOString()
          });
          effectiveStartDate = today;
        }
      }

      const dbBillboard = await resolveBillboardMetadata(billboardId);
      const screenId = billboard.screen_id || billboard.screenId || dbBillboard?.screen_id || null;
      const maxSlotsPerDay = toPositiveInt(
        billboard.max_slots_per_day || billboard.maxSlotsPerDay || dbBillboard?.max_slots_per_day || billboard.maxAdvertisers,
        8
      );
      const duration = toPositiveInt(billboard.assetScheduling?.duration || billboard.adDuration, 15);

      const dateKeys = enumerateDateKeys(effectiveStartDate, endDate);
      if (dateKeys.length === 0) {
        continue;
      }

      const overallRange = {
        gte: getUTCDateBounds(dateKeys[0]).start,
        lte: getUTCDateBounds(dateKeys[dateKeys.length - 1]).end
      };

      const existingSlots = await prisma.generatedSlot.findMany({
        where: {
          billboardId,
          startDate: overallRange
        },
        select: {
          startDate: true,
          slotNumber: true,
          campaignId: true
        },
        orderBy: [
          { startDate: 'asc' },
          { slotNumber: 'asc' }
        ]
      });

      const { occupiedByDate, campaignDates } = buildSlotIndex(existingSlots, campaign.id);
      const slotsToCreate = [];

      for (const dateKey of dateKeys) {
        if (campaignDates.has(dateKey)) {
          logger.slot(`Skipped: campaign ${campaign.id} already has a slot for ${billboardId} on ${dateKey}`);
          continue;
        }

        const occupiedSlots = occupiedByDate.get(dateKey) || new Set();
        const slotNumber = findFirstAvailableSlot(occupiedSlots, maxSlotsPerDay);

        if (slotNumber == null) {
          logger.slot(`Skipped: ${billboardId} is full on ${dateKey} (${maxSlotsPerDay}/${maxSlotsPerDay})`);
          continue;
        }

        const { start, end } = getUTCDateBounds(dateKey);

        slotsToCreate.push({
          campaignId: String(campaign.id),
          billboardId,
          assetUrl,
          startDate: start,
          endDate: end,
          duration,
          slotNumber,
          screenId: screenId ? String(screenId) : null
        });

        occupiedSlots.add(slotNumber);
        occupiedByDate.set(dateKey, occupiedSlots);
        campaignDates.add(dateKey);
      }

      if (slotsToCreate.length === 0) {
        logger.info(`No new slots generated for billboard ${billboardId} in campaign ${campaign.id}`);
        continue;
      }

      await prisma.generatedSlot.createMany({
        data: slotsToCreate
      });

      for (const slot of slotsToCreate) {
        logger.slot(`Slot #${slot.slotNumber} for ${slot.billboardId} on ${getUTCDateKey(slot.startDate)}`);
      }
    }

    logger.info('Slot generation completed for campaign:', campaign.id);
  } catch (error) {
    logger.error('Error in generateSlots function:', error);
    throw error;
  }
}

module.exports = { generateSlots };
