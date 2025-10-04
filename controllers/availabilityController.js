const prisma = require('../db/db');
const logger = require('../config/logger');

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

async function computeAvailabilityForRange(billboardId, startDate, endDate) {
  const results = {};

  // 1) Compute from Campaigns JSON (authoritative even before slots are generated)
  const overlappingCampaigns = await prisma.campaign.findMany({
    where: {
      // overlap window at campaign level as coarse filter
      startDate: { lte: endOfDay(endDate) },
      endDate: { gte: startOfDay(startDate) }
    },
    select: { id: true, billboards: true }
  });

  for (const camp of overlappingCampaigns) {
    let boards = camp.billboards;
    if (!boards) continue;
    if (typeof boards === 'string') {
      try { boards = JSON.parse(boards); } catch { continue; }
    }
    if (!Array.isArray(boards)) continue;
    const match = boards.find(b => String(b?.id) === String(billboardId));
    if (!match) continue;

    const bs = match.bookingDetails?.startDate || match.startDate || camp.startDate;
    const be = match.bookingDetails?.endDate || match.endDate || camp.endDate;
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
    const count = Math.max(0, Math.min(TOTAL_SLOTS_PER_DAY, results[key] || 0));
    const booked = Array.from({ length: count }, (_, i) => i + 1);
    const unbooked = [];
    for (let i = count + 1; i <= TOTAL_SLOTS_PER_DAY; i++) unbooked.push(i);
    map[key] = {
      date: key,
      booked,
      unbooked,
      totalSlots: TOTAL_SLOTS_PER_DAY,
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

// Ensure default availability rows exist for current + next month (all 8 unbooked)
async function ensureDefaultAvailabilityForTwoMonths(billboardId) {
  try {
    const now = new Date();
    const start = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
    const end = endOfDay(new Date(now.getFullYear(), now.getMonth() + 2, 0));
    const TOTAL_SLOTS_PER_DAY = 8;
    const ops = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = dateKeyIST(d);
      const day = new Date(key + 'T00:00:00Z');
      const availability = { date: key, booked: [], unbooked: Array.from({ length: TOTAL_SLOTS_PER_DAY }, (_, i) => i + 1), totalSlots: TOTAL_SLOTS_PER_DAY };
      ops.push(
        prisma.billboardAvailability.upsert({
          where: { billboardId_date: { billboardId: String(billboardId), date: day } },
          update: { availability },
          create: { billboardId: String(billboardId), date: day, availability }
        })
      );
    }
    if (ops.length) await prisma.$transaction(ops);
  } catch (e) {
    logger.warn('Default availability init failed:', e.message);
  }
}

// Public helper to recompute and upsert availability for a specific range
async function recomputeAndUpsertForRange(billboardId, start, end) {
  const recomputeMap = await computeAvailabilityForRange(billboardId, startOfDay(new Date(start)), endOfDay(new Date(end)));
  await upsertAvailability(billboardId, recomputeMap);
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
    const recomputeMap = await computeAvailabilityForRange(billboardId, start, end);
    await upsertAvailability(billboardId, recomputeMap);
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
      const slots = await prisma.generatedSlot.findMany({
        where: { startDate: { gte: dayStart }, endDate: { lte: dayEnd } },
        select: { billboardId: true, slotNumber: true },
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

// Export helpers for other controllers
module.exports.computeAvailabilityForRange = computeAvailabilityForRange;
module.exports.upsertAvailability = upsertAvailability;
module.exports.ensureDefaultAvailabilityForTwoMonths = ensureDefaultAvailabilityForTwoMonths;
module.exports.startOfDay = startOfDay;
module.exports.endOfDay = endOfDay;
module.exports.recomputeAndUpsertForRange = recomputeAndUpsertForRange;


