function toDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDisplayDate(value) {
  const date = toDate(value);
  if (!date) return null;

  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = date.getUTCFullYear();
  return `${day}.${month}.${year}`;
}

function getDateKey(value) {
  const date = toDate(value);
  return date ? date.toISOString().slice(0, 10) : null;
}

function getSlotRange(slot) {
  const start = slot.startDate || slot.start_date || slot.timerange?.startDateIso || slot.timerange?.start_date;
  const end = slot.endDate || slot.end_date || slot.timerange?.endDateIso || slot.timerange?.end_date || start;

  return {
    startDate: toDate(start),
    endDate: toDate(end)
  };
}

function buildSlotItem({ id, assetUrl, duration, slotNumber, createdFor, startDate, endDate }) {
  const start = toDate(startDate);
  const end = toDate(endDate);

  return {
    id,
    assestUrl: assetUrl,
    duration,
    slotno: slotNumber,
    createdFor,
    timerange: {
      startDate: formatDisplayDate(start),
      endDate: formatDisplayDate(end),
      startDateIso: start ? start.toISOString() : null,
      endDateIso: end ? end.toISOString() : null
    }
  };
}

function flattenGeneratedSlotRecords(records, filters = {}) {
  const flattened = [];

  for (const record of records || []) {
    const slotGroups = record.slots && typeof record.slots === 'object' ? record.slots : {};

    for (const [billboardId, billboardSlots] of Object.entries(slotGroups)) {
      if (filters.billboardId && String(billboardId) !== String(filters.billboardId)) {
        continue;
      }

      for (const slot of Array.isArray(billboardSlots) ? billboardSlots : []) {
        const { startDate, endDate } = getSlotRange(slot);
        if (!startDate || !endDate) continue;

        const screenIds = Array.isArray(record.screenId) ? record.screenId : [record.screenId].filter(Boolean);
        const assetUrl = slot.assestUrl || slot.assetUrl;

        if (filters.screenId && !screenIds.map(String).includes(String(filters.screenId))) {
          continue;
        }

        if (filters.assetUrl && String(assetUrl) !== String(filters.assetUrl)) {
          continue;
        }

        if (filters.startGte && startDate < filters.startGte) {
          continue;
        }

        if (filters.startLt && startDate >= filters.startLt) {
          continue;
        }

        if (filters.endLte && endDate > filters.endLte) {
          continue;
        }

        if (filters.activeAt && (startDate > filters.activeAt || endDate < filters.activeAt)) {
          continue;
        }

        flattened.push({
          id: slot.id,
          campaignId: record.campaignId,
          billboardId,
          assetUrl,
          duration: slot.duration,
          slotNumber: slot.slotno,
          createdFor: slot.createdFor,
          startDate,
          endDate,
          screenId: screenIds[0] || null,
          screenIds,
          dateKey: getDateKey(startDate),
          record
        });
      }
    }
  }

  return flattened.sort((a, b) => (
    a.startDate - b.startDate ||
    Number(a.slotNumber || 0) - Number(b.slotNumber || 0)
  ));
}

module.exports = {
  buildSlotItem,
  flattenGeneratedSlotRecords,
  formatDisplayDate,
  getDateKey
};
