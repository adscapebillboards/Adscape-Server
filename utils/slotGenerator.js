const prisma = require('../db/db');
const logger = require('../config/logger');
const { getDeveloperMode } = require('./developerMode');
const { buildSlotItem, flattenGeneratedSlotRecords, getDateKey } = require('./generatedSlotFormat');

function parseDateInput(value) {
  if (!value) return null;

  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(`${raw}T00:00:00.000Z`);
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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
    keys.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return keys;
}

function findFirstAvailableSlot(occupiedSlots, maxSlotsPerDay) {
  const limit = Math.min(maxSlotsPerDay, 8);
  for (let slotNumber = 1; slotNumber <= limit; slotNumber += 1) {
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

async function getExistingFlatSlots(startDate, endDate) {
  const records = await prisma.generatedSlot.findMany();
  return flattenGeneratedSlotRecords(records, {
    startGte: startDate,
    endLte: endDate
  });
}

function buildSlotIndex(existingSlots, campaignId) {
  const occupiedByBillboardDate = new Map();
  const campaignBillboardDates = new Set();

  for (const slot of existingSlots) {
    const dateKey = getDateKey(slot.startDate);
    if (!dateKey) continue;

    const billboardDateKey = `${slot.billboardId}:${dateKey}`;
    if (!occupiedByBillboardDate.has(billboardDateKey)) {
      occupiedByBillboardDate.set(billboardDateKey, new Set());
    }

    if (slot.slotNumber != null) {
      occupiedByBillboardDate.get(billboardDateKey).add(slot.slotNumber);
    }

    if (String(slot.campaignId) === String(campaignId)) {
      campaignBillboardDates.add(billboardDateKey);
    }
  }

  return { occupiedByBillboardDate, campaignBillboardDates };
}

async function generateSlots(campaign, options = {}) {
  try {
    const billboards = campaign.billboards;
    const developerModeEnabled = await getDeveloperMode();
    const createdFor = options.createdFor || (developerModeEnabled ? 'Development' : 'Production');

    logger.info('Starting grouped slot generation for campaign:', campaign.id);
    logger.info('Developer mode state for slot generation:', developerModeEnabled);

    if (!Array.isArray(billboards)) {
      logger.warn('Billboards data missing or not an array', { billboards });
      return;
    }

    if (billboards.length === 0) {
      logger.warn('No billboards in campaign', { campaignId: campaign.id });
      return;
    }

    const preparedBillboards = [];
    const allDateKeys = [];

    for (const billboard of billboards) {
      const billboardId = String(billboard.id);
      const assetUrl = billboard.files?.[0] || billboard.creative || billboard.images?.[0];
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

      preparedBillboards.push({
        billboardId,
        assetUrl,
        screenId: screenId ? String(screenId) : null,
        maxSlotsPerDay,
        duration,
        dateKeys
      });
      allDateKeys.push(...dateKeys);
    }

    if (preparedBillboards.length === 0 || allDateKeys.length === 0) {
      logger.warn('No valid billboards found for grouped slot generation', { campaignId: campaign.id });
      return;
    }

    const rangeStart = getUTCDateBounds(allDateKeys.sort()[0]).start;
    const rangeEnd = getUTCDateBounds(allDateKeys.sort()[allDateKeys.length - 1]).end;
    const existingFlatSlots = await getExistingFlatSlots(rangeStart, rangeEnd);
    const { occupiedByBillboardDate, campaignBillboardDates } = buildSlotIndex(existingFlatSlots, campaign.id);

    const slotsByBillboard = {};
    const billboardIds = [];
    const screenIds = [];

    for (const prepared of preparedBillboards) {
      slotsByBillboard[prepared.billboardId] = [];
      billboardIds.push(prepared.billboardId);
      if (prepared.screenId) screenIds.push(prepared.screenId);

      for (const dateKey of prepared.dateKeys) {
        const billboardDateKey = `${prepared.billboardId}:${dateKey}`;
        if (campaignBillboardDates.has(billboardDateKey)) {
          logger.slot(`Skipped: campaign ${campaign.id} already has a slot for ${prepared.billboardId} on ${dateKey}`);
          continue;
        }

        const occupiedSlots = occupiedByBillboardDate.get(billboardDateKey) || new Set();
        const slotNumber = findFirstAvailableSlot(occupiedSlots, prepared.maxSlotsPerDay);

        if (slotNumber == null) {
          logger.slot(`Skipped: ${prepared.billboardId} is full on ${dateKey} (${prepared.maxSlotsPerDay}/${prepared.maxSlotsPerDay})`);
          continue;
        }

        const { start, end } = getUTCDateBounds(dateKey);
        const slotItem = buildSlotItem({
          id: `${campaign.id}_${prepared.billboardId}_${dateKey}_${slotNumber}`,
          assetUrl: prepared.assetUrl,
          duration: prepared.duration,
          slotNumber,
          createdFor,
          startDate: start,
          endDate: end
        });

        slotsByBillboard[prepared.billboardId].push(slotItem);
        occupiedSlots.add(slotNumber);
        occupiedByBillboardDate.set(billboardDateKey, occupiedSlots);
        campaignBillboardDates.add(billboardDateKey);
        logger.slot(`Slot #${slotNumber} for ${prepared.billboardId} on ${dateKey}`);
      }
    }

    const existingRecord = await prisma.generatedSlot.findUnique({
      where: { campaignId: String(campaign.id) }
    });

    const mergedSlots = {
      ...(existingRecord?.slots && typeof existingRecord.slots === 'object' ? existingRecord.slots : {}),
      ...slotsByBillboard
    };

    await prisma.generatedSlot.upsert({
      where: { campaignId: String(campaign.id) },
      update: {
        billboardIds: [...new Set(billboardIds)],
        screenId: [...new Set(screenIds)],
        slots: mergedSlots
      },
      create: {
        campaignId: String(campaign.id),
        billboardIds: [...new Set(billboardIds)],
        screenId: [...new Set(screenIds)],
        slots: mergedSlots
      }
    });

    logger.info('Grouped slot generation completed for campaign:', campaign.id);
  } catch (error) {
    logger.error('Error in generateSlots function:', error);
    throw error;
  }
}

module.exports = { generateSlots };
