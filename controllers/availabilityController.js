const prisma = require('../db/db');
const logger = require('../config/logger');
const { flattenGeneratedSlotRecords } = require('../utils/generatedSlotFormat');

const TOTAL_SLOTS_PER_DAY = 8;
const IST_OFFSET_MIN = 330; // +05:30

function parseDateParam(value, fallback) {
  if (!value) return fallback;
  const d = new Date(value);
  if (isNaN(d.getTime())) return fallback;
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function dateKeyIST(d) {
  const ist = new Date(d.getTime() + IST_OFFSET_MIN * 60 * 1000);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const day = String(ist.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function getBillboardMaxSlots(billboardId) {
  const billboard = await prisma.billboard.findUnique({
    where: { id: String(billboardId) },
    select: { max_slots_per_day: true, maxAdvertisers: true, type: true }
  });

  const configuredSlots = Number(billboard?.max_slots_per_day || billboard?.maxAdvertisers);
  if (Number.isFinite(configuredSlots) && configuredSlots > 0) {
    return Math.floor(configuredSlots);
  }
  
  const isStatic = billboard?.type?.toLowerCase() === 'static' || billboard?.type?.toLowerCase() === 'traditional';
  return isStatic ? 1 : TOTAL_SLOTS_PER_DAY;
}

async function computeAvailabilityForRange(billboardId, startDate, endDate, totalSlotsPerDay) {
  const results = {};
  const totalSlots = totalSlotsPerDay || await getBillboardMaxSlots(billboardId);

  // 1) Compute from Campaigns JSON (authoritative even before slots are generated)
  const overlappingCampaigns = await prisma.campaign.findMany({
    where: {
      // overlap window at campaign level as coarse filter
      startDate: { lte: endOfDay(endDate) },
      endDate: { gte: startOfDay(startDate) },
      status: { notIn: ['REJECTED', 'rejected', 'Rejected'] }
    },
    select: { id: true, billboards: true, startDate: true, endDate: true }
  });

  for (const camp of overlappingCampaigns) {
    let boards = camp.billboards;
    if (!boards) continue;
    if (typeof boards === 'string') {
      try { boards = JSON.parse(boards); } catch { continue; }
    }
    if (!Array.isArray(boards)) continue;
    
    const match = boards.find(b => {
      const bId = typeof b === 'object' ? (b?.id || b?.billboardId) : b;
      return String(bId) === String(billboardId);
    });
    
    if (!match) continue;

    const bs = (typeof match === 'object' ? (match.bookingDetails?.startDate || match.startDate) : null) || camp.startDate;
    const be = (typeof match === 'object' ? (match.bookingDetails?.endDate || match.endDate) : null) || camp.endDate;
    if (!bs || !be) continue;
    const bStart = startOfDay(new Date(bs));
    const bEnd = endOfDay(new Date(be));

    const rangeStart = bStart > startDate ? bStart : startOfDay(startDate);
    const rangeEnd = bEnd < endDate ? bEnd : endOfDay(endDate);
    if (rangeEnd < rangeStart) continue;

    for (let d = new Date(rangeStart); d <= rangeEnd; d.setDate(d.getDate() + 1)) {
      const key = dateKeyIST(d);
      if (!results[key]) results[key] = 0;
      results[key] += 1; // one booking consumes one slot per day
    }
  }

  // 2) Ignore generated slots for availability; trust campaign bookings only

  // build response map
  const map = {};
  for (
    let d = new Date(startDate);
    d <= endDate;
    d.setDate(d.getDate() + 1)
  ) {
    const key = dateKeyIST(d);
    const count = Math.max(0, Math.min(totalSlots, results[key] || 0));
    const booked = Array.from({ length: count }, (_, i) => i + 1);
    const unbooked = [];
    for (let i = count + 1; i <= totalSlots; i++) unbooked.push(i);
    map[key] = {
      date: key,
      booked,
      unbooked,
      totalSlots,
    };
  }

  return map;
}

// Upsert computed map into billboard_availability table
async function upsertAvailability(billboardId, availabilityMap) {
  // If Prisma client hasn't been regenerated yet, skip caching to avoid crashes
  const hasModel = prisma.billboardAvailability && typeof prisma.billboardAvailability.upsert === 'function';
  if (!hasModel) return;

  try {
    const ops = [];
    for (const key of Object.keys(availabilityMap)) {
      const day = new Date(key + 'T00:00:00Z');
      ops.push(
        prisma.billboardAvailability.upsert({
          where: { billboardId_date: { billboardId: String(billboardId), date: day } },
          update: { availability: availabilityMap[key] },
          create: {
            billboardId: String(billboardId),
            date: day,
            availability: availabilityMap[key],
          },
        })
      );
    }
    if (ops.length) await prisma.$transaction(ops);
  } catch (e) {
    // Log and continue without failing the API
    logger.warn('Availability upsert skipped:', e.message);
  }
}

async function upsertSlotAvailabilityCounts(billboardId, availabilityMap) {
  const hasModel = prisma.slot_availability && typeof prisma.slot_availability.upsert === 'function';
  if (!hasModel) return;

  try {
    const ops = Object.keys(availabilityMap).map((key) => {
      const availability = availabilityMap[key];
      const totalSlots = Number(availability.totalSlots || TOTAL_SLOTS_PER_DAY);
      const bookedSlots = Number(availability.booked?.length || 0);
      const availableSlots = Math.max(0, totalSlots - bookedSlots);
      const day = new Date(key + 'T00:00:00Z');

      return prisma.slot_availability.upsert({
        where: {
          billboard_id_date: {
            billboard_id: String(billboardId),
            date: day
          }
        },
        update: {
          total_slots: totalSlots,
          booked_slots: bookedSlots,
          available_slots: availableSlots,
          last_updated: new Date()
        },
        create: {
          billboard_id: String(billboardId),
          date: day,
          total_slots: totalSlots,
          booked_slots: bookedSlots,
          available_slots: availableSlots
        }
      });
    });

    if (ops.length) await prisma.$transaction(ops);
  } catch (e) {
    logger.warn('Slot availability count upsert skipped:', e.message);
  }
}

function buildSlotAvailabilityJson(availabilityMap) {
  const slotsJson = {};

  for (const key of Object.keys(availabilityMap).sort()) {
    const [year, month, day] = key.split('-');
    const dateKey = `${day}.${month}.${year}`;
    const dayData = availabilityMap[key];
    const totalSlots = Number(dayData.totalSlots || TOTAL_SLOTS_PER_DAY);
    const bookedSlots = Number(dayData.booked?.length || 0);
    slotsJson[dateKey] = Math.max(0, totalSlots - bookedSlots);
  }

  return slotsJson;
}

async function syncBillboardAvailabilityForRange(billboardId, start, end) {
  const startDate = startOfDay(new Date(start));
  const endDate = endOfDay(new Date(end));
  const totalSlots = await getBillboardMaxSlots(billboardId);
  const availabilityMap = await computeAvailabilityForRange(billboardId, startDate, endDate, totalSlots);

  await upsertAvailability(billboardId, availabilityMap);
  await upsertSlotAvailabilityCounts(billboardId, availabilityMap);

  return availabilityMap;
}

// Ensure default availability rows exist for current + next month (all 8 unbooked)
async function ensureDefaultAvailabilityForTwoMonths(billboardId) {
  try {
    const now = new Date();
    const start = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
    const end = endOfDay(new Date(now.getFullYear(), now.getMonth() + 2, 0));
    await syncBillboardAvailabilityForRange(billboardId, start, end);
  } catch (e) {
    logger.warn('Default availability init failed:', e.message);
  }
}

// Public helper to recompute and upsert availability for a specific range
async function recomputeAndUpsertForRange(billboardId, start, end) {
  return syncBillboardAvailabilityForRange(billboardId, start, end);
}

// Update slotAvailability JSON field on billboard with 2 months of data
async function updateBillboardSlotAvailabilityJSON(billboardId) {
  try {
    // Calculate 2 months range
    const now = new Date();
    const start = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
    const end = endOfDay(new Date(now.getFullYear(), now.getMonth() + 2, 0));
    const availabilityMap = await syncBillboardAvailabilityForRange(billboardId, start, end);
    const slotsJson = buildSlotAvailabilityJson(availabilityMap);
    
    // Update billboard with slot availability JSON
    await prisma.billboard.update({
      where: { id: String(billboardId) },
      data: {
        slotAvailability: slotsJson
      }
    });
    
    logger.info(`Updated slotAvailability JSON for billboard ${billboardId}`);
  } catch (error) {
    logger.warn(`Failed to update slotAvailability JSON for billboard ${billboardId}:`, error.message);
  }
}

async function generateAvailabilityForAllBillboards(months = 2) {
  const now = new Date();
  const start = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
  const end = endOfDay(new Date(now.getFullYear(), now.getMonth() + months, 0));
  const billboards = await prisma.billboard.findMany({
    select: { id: true }
  });

  let success = 0;
  let failed = 0;

  for (const billboard of billboards) {
    try {
      const availabilityMap = await syncBillboardAvailabilityForRange(billboard.id, start, end);
      await prisma.billboard.update({
        where: { id: String(billboard.id) },
        data: { slotAvailability: buildSlotAvailabilityJson(availabilityMap) }
      });
      success += 1;
    } catch (error) {
      failed += 1;
      logger.warn(`Failed generating availability for billboard ${billboard.id}:`, error.message);
    }
  }

  return {
    totalBillboards: billboards.length,
    success,
    failed,
    start: dateKeyIST(start),
    end: dateKeyIST(end)
  };
}

// GET /api/billboards/:billboardId/availability?start=YYYY-MM-DD&end=YYYY-MM-DD
exports.getBillboardAvailability = async (req, res) => {
  try {
    const { billboardId } = req.params;
    const start = parseDateParam(
      req.query.start,
      startOfDay(new Date())
    );
    const end = parseDateParam(
      req.query.end,
      startOfDay(new Date(new Date().setDate(new Date().getDate() + 59)))
    );

    if (end < start) {
      return res.status(400).json({ error: 'Invalid date range' });
    }

    // Always recompute fresh availability for requested range
    const recomputeMap = await syncBillboardAvailabilityForRange(billboardId, start, end);
    const byKey = new Map(Object.entries(recomputeMap));

    // Build ordered array response
    const response = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = dateKeyIST(d);
      response.push({ date: key, ...(byKey.get(key) || { booked: [], unbooked: Array.from({ length: TOTAL_SLOTS_PER_DAY }, (_, i) => i + 1), totalSlots: TOTAL_SLOTS_PER_DAY }) });
    }

    res.json({ billboardId: String(billboardId), start: dateKeyIST(start), end: dateKeyIST(end), days: response });
  } catch (error) {
    logger.error('Error fetching availability:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/availability/summary?date=YYYY-MM-DD
// Returns { date, totalBillboards, fullyBooked, partiallyBooked, empty }
exports.getAvailabilitySummaryByDate = async (req, res) => {
  try {
    const date = parseDateParam(req.query.date, startOfDay(new Date()));
    const key = date.toISOString().slice(0, 10);

    // Prefer cached availability rows for that date
    const rows = await prisma.billboardAvailability.findMany({
      where: { date: startOfDay(date) },
      select: { availability: true },
    });

    let availabilities = rows.map((r) => r.availability);

    // If cache is empty, compute from generated slots for all billboards for that day
    if (availabilities.length === 0) {
      const dayStart = startOfDay(date);
      const dayEnd = endOfDay(date);
      const slotRecords = await prisma.generatedSlot.findMany();
      const slots = flattenGeneratedSlotRecords(slotRecords, {
        startGte: dayStart,
        endLte: dayEnd
      });

      const map = new Map();
      for (const s of slots) {
        if (!map.has(s.billboardId)) map.set(s.billboardId, new Set());
        if (s.slotNumber != null) map.get(s.billboardId).add(s.slotNumber);
      }

      const summaryAvail = [];
      for (const [_, set] of map.entries()) {
        const booked = Array.from(set);
        const unbooked = [];
        for (let i = 1; i <= TOTAL_SLOTS_PER_DAY; i++) if (!set.has(i)) unbooked.push(i);
        summaryAvail.push({ date: key, booked, unbooked, totalSlots: TOTAL_SLOTS_PER_DAY });
      }
      availabilities = summaryAvail;
    }

    const totalBillboards = availabilities.length;
    let fullyBooked = 0, partiallyBooked = 0, empty = 0;
    for (const a of availabilities) {
      const bookedCount = a.booked?.length || 0;
      if (bookedCount === 0) empty++;
      else if (bookedCount >= TOTAL_SLOTS_PER_DAY) fullyBooked++;
      else partiallyBooked++;
    }

    res.json({ date: key, totalBillboards, fullyBooked, partiallyBooked, empty });
  } catch (error) {
    logger.error('Error fetching summary availability:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/billboards/:billboardId/slots - Returns simple JSON format { "DD.MM.YYYY": available_slots }
// Reads pre-calculated values from slot_availability table (updated after each campaign event).
// Falls back to live computation only for dates with no stored record.
exports.getBillboardSlots = async (req, res) => {
  try {
    const { billboardId } = req.params;
    const start = parseDateParam(req.query.start, startOfDay(new Date()));
    const end = parseDateParam(
      req.query.end,
      startOfDay(new Date(new Date().setDate(new Date().getDate() + 59)))
    );

    if (end < start) {
      return res.status(400).json({ error: 'Invalid date range' });
    }

    const maxSlotsPerDay = await getBillboardMaxSlots(billboardId);

    // --- Primary source: slot_availability table (pre-calculated after each campaign) ---
    const hasSlotAvailabilityModel =
      prisma.slot_availability && typeof prisma.slot_availability.findMany === 'function';

    let storedRows = [];
    if (hasSlotAvailabilityModel) {
      storedRows = await prisma.slot_availability.findMany({
        where: {
          billboard_id: String(billboardId),
          date: { gte: startOfDay(start), lte: endOfDay(end) },
        },
        select: { date: true, available_slots: true },
      });
    }

    // Index stored rows by IST date key (YYYY-MM-DD) for O(1) lookup
    const storedByKey = new Map();
    for (const row of storedRows) {
      storedByKey.set(dateKeyIST(row.date), Number(row.available_slots));
    }

    // Identify which dates in the range have NO stored record (need live computation)
    const missingDates = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      if (!storedByKey.has(dateKeyIST(d))) {
        missingDates.push(new Date(d));
      }
    }

    // For missing dates, run a targeted live computation and persist the results
    if (missingDates.length > 0) {
      // Compute the smallest continuous range covering all missing dates
      const liveStart = missingDates[0];
      const liveEnd = missingDates[missingDates.length - 1];
      try {
        const liveMap = await syncBillboardAvailabilityForRange(billboardId, liveStart, liveEnd);
        // Merge live results into storedByKey
        for (const [key, data] of Object.entries(liveMap)) {
          const avail = data.unbooked?.length ?? Math.max(0, maxSlotsPerDay - (data.booked?.length ?? 0));
          storedByKey.set(key, avail);
        }
      } catch (liveErr) {
        logger.warn(`Live availability fallback failed for billboard ${billboardId}:`, liveErr.message);
      }
    }

    // Build DD.MM.YYYY response map from the (now complete) stored values
    const slotsMap = {};
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = dateKeyIST(d);
      const [istYear, istMonth, istDay] = key.split('-');
      const dateStr = `${istDay}.${istMonth}.${istYear}`;
      // Default to maxSlotsPerDay if still missing (live computation also failed)
      slotsMap[dateStr] = storedByKey.has(key) ? storedByKey.get(key) : maxSlotsPerDay;
    }

    logger.info(`[getBillboardSlots] billboard=${billboardId} stored=${storedRows.length} liveComputed=${missingDates.length} total=${Object.keys(slotsMap).length}`);

    res.json(slotsMap);
  } catch (error) {
    logger.error('Error fetching billboard slots:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.generateBillboardAvailability = async (req, res) => {
  try {
    const requestedMonths = Number(req.body?.months || req.query.months || 2);
    const months = Number.isFinite(requestedMonths)
      ? Math.max(1, Math.min(12, Math.floor(requestedMonths)))
      : 2;
    const result = await generateAvailabilityForAllBillboards(months);
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('Error generating billboard availability:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Export helpers for other controllers
module.exports.computeAvailabilityForRange = computeAvailabilityForRange;
module.exports.upsertAvailability = upsertAvailability;
module.exports.upsertSlotAvailabilityCounts = upsertSlotAvailabilityCounts;
module.exports.ensureDefaultAvailabilityForTwoMonths = ensureDefaultAvailabilityForTwoMonths;
module.exports.startOfDay = startOfDay;
module.exports.endOfDay = endOfDay;
module.exports.recomputeAndUpsertForRange = recomputeAndUpsertForRange;
module.exports.updateBillboardSlotAvailabilityJSON = updateBillboardSlotAvailabilityJSON;
module.exports.syncBillboardAvailabilityForRange = syncBillboardAvailabilityForRange;
module.exports.generateAvailabilityForAllBillboards = generateAvailabilityForAllBillboards;
