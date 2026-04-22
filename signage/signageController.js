const prisma = require('../db/db');
const logger = require('../config/logger');
const { flattenGeneratedSlotRecords } = require('../utils/generatedSlotFormat');

const FALLBACK_DEFAULT_LOGO = "https://res.cloudinary.com/dh0ehlpkp/image/upload/v1776145745/juu3ojtpwcvhckyffskv.png";

function inferMediaTypeFromUrl(url) {
    const u = String(url || "").toLowerCase();
    return u.endsWith(".mp4") || u.includes(".mp4?") ? "video" : "image";
}

function appendBillboardDefaults(assets, billboard) {
    const list = [...assets];

    const defaultUrl = billboard?.defaultAssetUrl
        || billboard?.default_asset_url
        || (Array.isArray(billboard?.images) && billboard.images.length > 0 ? billboard.images[0] : null)
        || FALLBACK_DEFAULT_LOGO;
    const defaultType = String(billboard?.defaultAssetType || billboard?.default_asset_type || inferMediaTypeFromUrl(defaultUrl) || "image").toLowerCase();
    const defaultDuration = Number(billboard?.defaultAssetDuration ?? billboard?.default_asset_duration ?? 15) || 15;

    list.push({
        id: "default-9",
        _id: "default-9",
        url: defaultUrl,
        asset_url: defaultUrl,
        type: defaultType === "video" ? "video" : "image",
        media_type: defaultType === "video" ? "video" : "image",
        duration: defaultDuration,
        campaignId: "default",
        campaign_id: "default",
        slotNumber: 9,
        slot_number: 9
    });

    const slot10Enabled = Boolean(billboard?.slot10Enabled ?? billboard?.slot10_enabled);
    const slot10Url = billboard?.slot10AssetUrl || billboard?.slot10_asset_url;
    if (slot10Enabled && slot10Url) {
        const slot10Type = String(billboard?.slot10AssetType || billboard?.slot10_asset_type || inferMediaTypeFromUrl(slot10Url) || "image").toLowerCase();
        const slot10Duration = Number(billboard?.slot10AssetDuration ?? billboard?.slot10_asset_duration ?? defaultDuration) || defaultDuration;
        list.push({
            id: "slot-10",
            _id: "slot-10",
            url: slot10Url,
            asset_url: slot10Url,
            type: slot10Type === "video" ? "video" : "image",
            media_type: slot10Type === "video" ? "video" : "image",
            duration: slot10Duration,
            campaignId: "slot10",
            campaign_id: "slot10",
            slotNumber: 10,
            slot_number: 10
        });
    }

    return list;
}

function buildPairingPayload(deviceId, connectionCode) {
  return {
    type: 'adscape-pairing',
    screenId: String(deviceId || '').trim(),
    connectionCode: String(connectionCode || '').trim() || undefined
  };
}

function limitString(value, maxLength) {
  const normalized = String(value || '').trim();
  return normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized;
}

/**
 * Controller for modern Android Signage (v3) API.
 * Handles device registration, asset delivery, and analytics.
 */

// 1. Device Registration (First Launch)
// POST /signage/devices/register
exports.registerDevice = async (req, res) => {
  try {
    const { deviceId, model, manufacturer, osVersion, screenResolution, appVersion, connectionCode } = req.body;

    if (!deviceId) return res.status(400).json({ error: 'deviceId is required' });

    const normalizedDeviceId = limitString(deviceId, 64);
    const normalizedConnectionCode = limitString(connectionCode, 20);
    const normalizedDeviceName = limitString(`${manufacturer || ''} ${model || ''}`, 255);
    const normalizedOsVersion = limitString(osVersion, 50);
    const normalizedAppVersionCode = limitString(appVersion, 20);

    // Keep the pairing code stable across app redeploys if the client already has one.
    const stableConnectionCode = normalizedConnectionCode
      || Math.floor(1000000000 + Math.random() * 9000000000).toString();

    const device = await prisma.adscapePlayer.upsert({
      where: { screenId: normalizedDeviceId },
      update: {
        deviceName: normalizedDeviceName,
        osVersion: normalizedOsVersion,
        appVersion: "F3", // We've refactored to F3
        appVersionCode: normalizedAppVersionCode,
        connectionCode: stableConnectionCode,
        updatedAt: new Date(),
        lastSeen: new Date()
      },
      create: {
        screenId: normalizedDeviceId,
        connectionCode: stableConnectionCode,
        deviceName: normalizedDeviceName,
        osVersion: normalizedOsVersion,
        appVersion: "F3",
        appVersionCode: normalizedAppVersionCode,
        isActive: true
      }
    });

    // Also update legacy PlayerScreen table for compatibility if needed
    try {
        await prisma.playerScreen.upsert({
            where: { machineId: normalizedDeviceId },
            update: { resolution: screenResolution, updatedAt: new Date() },
            create: { machineId: normalizedDeviceId, screenId: normalizedDeviceId, resolution: screenResolution }
        });
    } catch(e) { /* ignore legacy check */ }

    res.json({
      success: true,
      connectionCode: stableConnectionCode, // Machine shows this to user for pairing
      deviceId: device.screenId
    });
  } catch (error) {
    logger.error('Registration Error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
};

// 2. Check Pairing Status
// GET /signage/devices/pairing-status/:deviceId
exports.checkPairingStatus = async (req, res) => {
  try {
    const { deviceId } = req.params;

    // 1. Try matching billboard by screen_id directly (UUID or Connection Code)
    let billboard = await prisma.billboard.findFirst({
      where: {
        OR: [
          { screen_id: deviceId },
          { id: deviceId }
        ]
      }
    });

    // 2. If no direct match, look up the device's connection code and try matching that
    if (!billboard) {
      const player = await prisma.adscapePlayer.findUnique({
        where: { screenId: deviceId }
      });

      if (player && player.connectionCode) {
        billboard = await prisma.billboard.findFirst({
          where: { screen_id: player.connectionCode }
        });
      }
    }

    if (billboard) {
      res.json({
        isPaired: true,
        screenId: billboard.id,
        screen_id: billboard.screen_id,
        location: billboard.location
      });
    } else {
      res.json({ isPaired: false });
    }
  } catch (error) {
    res.status(500).json({ error: 'Pairing check failed' });
  }
};

// 2b. Get Pairing Payload
// GET /signage/devices/pairing-info/:deviceId
exports.getPairingInfo = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const normalizedDeviceId = String(deviceId || '').trim();

    if (!normalizedDeviceId) {
      return res.status(400).json({ error: 'deviceId is required' });
    }

    const player = await prisma.adscapePlayer.findUnique({
      where: { screenId: normalizedDeviceId },
      select: {
        screenId: true
      }
    });

    const payload = buildPairingPayload(normalizedDeviceId, req.query.connectionCode);

    res.json({
      success: true,
      registered: !!player,
      payload,
      qrValue: JSON.stringify(payload)
    });
  } catch (error) {
    logger.error('Get Pairing Info Error:', error);
    res.status(500).json({ error: 'Failed to fetch pairing info' });
  }
};

// 2c. Pairing QR redirect
// GET /signage/devices/pairing-qr/:deviceId?connectionCode=1234567890&size=640
exports.getPairingQr = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const normalizedDeviceId = String(deviceId || '').trim();

    if (!normalizedDeviceId) {
      return res.status(400).json({ error: 'deviceId is required' });
    }

    const size = Math.max(128, Math.min(parseInt(req.query.size, 10) || 640, 2048));
    const payload = buildPairingPayload(normalizedDeviceId, req.query.connectionCode);
    const qrValue = JSON.stringify(payload);
    const redirectUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=1&data=${encodeURIComponent(qrValue)}`;

    res.redirect(302, redirectUrl);
  } catch (error) {
    logger.error('Get Pairing QR Error:', error);
    res.status(500).json({ error: 'Failed to generate pairing QR' });
  }
};

// DELETE /signage/devices/:deviceId
exports.deregisterDevice = async (req, res) => {
  try {
    const { deviceId } = req.params;

    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId is required' });
    }

    const normalizedDeviceId = String(deviceId).trim();

    const disconnectedBillboards = await prisma.billboard.updateMany({
      where: { screen_id: normalizedDeviceId },
      data: { screen_id: null }
    });

    await prisma.adscapePlayer.deleteMany({
      where: { screenId: normalizedDeviceId }
    });

    try {
      await prisma.playerScreen.deleteMany({
        where: {
          OR: [
            { machineId: normalizedDeviceId },
            { screenId: normalizedDeviceId }
          ]
        }
      });
    } catch (legacyError) {
      logger.warn?.('Legacy player screen cleanup skipped:', legacyError);
    }

    logger.info('[SIGNAGE] Device deregistered', {
      deviceId: normalizedDeviceId,
      disconnectedBillboards: disconnectedBillboards.count
    });

    res.json({
      success: true,
      deviceId: normalizedDeviceId,
      disconnectedBillboards: disconnectedBillboards.count
    });
  } catch (error) {
    logger.error('Deregister Device Error:', error);
    res.status(500).json({ error: 'Device deregistration failed' });
  }
};

// 3. Get Assets for Screen
// GET /signage/screens/:screenId/assets?date=YYYY-MM-DD
exports.getAssets = async (req, res) => {
  try {
    const { screenId } = req.params;
    const dateStr = req.query.date || new Date().toISOString().split('T')[0];
    
    // DEBUG LOG
    try {
        require('fs').appendFileSync('signage_requests.log', `${new Date().toISOString()} - screenId: ${screenId}, date: ${dateStr}\n`);
    } catch(e) {}
    const scheduleDate = new Date(`${dateStr}T00:00:00.000Z`);
    const dayStart = new Date(`${dateStr}T00:00:00.000Z`);
    // Extend range to 3 days to show upcoming slots in the timeline preview
    const dayEnd = new Date(dayStart.getTime() + (3 * 24 * 60 * 60 * 1000) - 1);

    // Resolve the billboard first to handle ID mapping (internal ID vs hardware screen_id)
    const billboard = await prisma.billboard.findFirst({
        where: {
            OR: [
                { id: String(screenId) },
                { screen_id: String(screenId) }
            ]
        }
    });

    if (!billboard) {
        return res.status(404).json({ error: 'Billboard not found' });
    }

    // 1. Prioritize modern GeneratedSlots
    const generatedSlotRecords = await prisma.generatedSlot.findMany({
        where: {
            OR: [
                { billboardIds: { has: String(billboard.id) } },
                { billboardIds: { has: String(billboard.screen_id || '') } },
                { screenId: { has: String(billboard.id) } },
                { screenId: { has: String(billboard.screen_id || '') } }
            ]
        }
    });

    const generatedSlots = flattenGeneratedSlotRecords(generatedSlotRecords).filter((slot) => {
        const billboardMatch = [String(billboard.id), String(billboard.screen_id || '')].includes(String(slot.billboardId));
        const screenMatch = [String(billboard.id), String(billboard.screen_id || '')].includes(String(slot.screenId || ''));
        return (billboardMatch || screenMatch) && slot.startDate <= dayEnd && slot.endDate >= dayStart;
    });

    if (generatedSlots.length > 0) {
        let slots = generatedSlots.map((slot, index) => {
            const mediaType = slot.assetUrl.toLowerCase().endsWith('.mp4') ? 'video' : 'image';
            const slotNumber = slot.slotNumber || (index + 1);

            return {
                id: slot.id,
                _id: slot.id,
                url: slot.assetUrl,
                asset_url: slot.assetUrl,
                type: mediaType,
                media_type: mediaType,
                duration: slot.duration || 15,
                campaignId: slot.campaignId,
                campaign_id: slot.campaignId,
                startDate: slot.startDate,
                start_date: slot.startDate,
                slotNumber,
                slot_number: slotNumber
            };
        });

        return res.json(appendBillboardDefaults(slots, billboard));
    }

    // 2. Fallback to legacy DailySchedule
    let schedule = await prisma.dailySchedule.findFirst({
      where: {
        OR: [
            { screenId: String(billboard.id) },
            { screenId: String(billboard.screen_id) }
        ],
        scheduleDate: scheduleDate
      },
      include: { slots: true }
    });

    if (!schedule || !schedule.slots.length) {

        // ... Fallback continues to activeCampaigns

        // Fallback or generate on-the-fly if we have a billboard but no schedule
        // This handles the "scheduled but no assets fetched" issue
        const campaignSearchStart = new Date(dayStart);
        const campaignSearchEnd = new Date(dayEnd);

        const activeCampaigns = await prisma.campaign.findMany({
            where: {
                status: { in: ['ACTIVE', 'LIVE', 'SCHEDULED'] },
                startDate: { lte: campaignSearchEnd },
                endDate: { gte: campaignSearchStart }
            }
        });

        // Search for campaigns that include THIS billboard
        const billboardIds = [String(billboard.id), String(billboard.screen_id)];
        const matchedCampaigns = activeCampaigns.filter(c => {
            if (!c.billboards) return false;
            const bbs = typeof c.billboards === 'string' ? JSON.parse(c.billboards) : c.billboards;
            return bbs.some(b => billboardIds.includes(String(b.id || b.billboardId || "")));
        });

        if (matchedCampaigns.length > 0) {
            // Found active campaigns! Let's generate a temporary response or a real schedule
            const assets = [];
            let rrIndex = 0;
            const defaultUrl = 'https://res.cloudinary.com/dh0ehlpkp/image/upload/v1772717423/Logo_ssxriy.png';

            for (let i = 1; i <= 8; i++) {
                const campaign = matchedCampaigns[rrIndex];
                rrIndex = (rrIndex + 1) % matchedCampaigns.length;
                
                const bbs = typeof campaign.billboards === 'string' ? JSON.parse(campaign.billboards) : campaign.billboards;
                const bb = bbs.find(b => billboardIds.includes(String(b.id || b.billboardId || "")));
                const assetUrl = (bb?.files?.[0]) || (bb?.creative) || (bb?.images?.[0]) || (billboard.images?.[0]) || defaultUrl;

                assets.push({
                    id: `${campaign.id}-${i}`,
                    url: assetUrl,
                    type: assetUrl.toLowerCase().endsWith('.mp4') ? 'video' : 'image',
                    duration: 15,
                    campaignId: campaign.id
                });
            }
            return res.json(appendBillboardDefaults(assets, billboard));
        }

        // Truly no campaigns found, return defaults
        const defaultAssets = await prisma.defaultAsset.findMany({ where: { isActive: true } });
        if (defaultAssets.length > 0) {
            return res.json(defaultAssets.map((a, index) => ({
                id: `default-${a.id}`,
                _id: `default-${a.id}`,
                url: a.assetUrl,
                asset_url: a.assetUrl,
                type: a.assetType || 'image',
                media_type: a.assetType || 'image',
                duration: a.duration || 10,
                campaignId: null,
                campaign_id: null,
                slotNumber: index + 1,
                slot_number: index + 1
            })));
        } else {
            // Very last resort
            return res.json([{
                id: 'fallback-logo',
                _id: 'fallback-logo',
                url: 'https://res.cloudinary.com/dh0ehlpkp/image/upload/v1772717423/Logo_ssxriy.png',
                asset_url: 'https://res.cloudinary.com/dh0ehlpkp/image/upload/v1772717423/Logo_ssxriy.png',
                type: 'image',
                media_type: 'image',
                duration: 10,
                campaignId: null,
                campaign_id: null,
                slotNumber: 1,
                slot_number: 1
            }]);
        }
    }

    const assets = schedule.slots.map((slot) => {
      const mediaType = slot.assetUrl.toLowerCase().endsWith('.mp4') ? 'video' : 'image';

      return {
        id: slot.id,
        _id: slot.id,
        url: slot.assetUrl,
        asset_url: slot.assetUrl,
        type: mediaType,
        media_type: mediaType,
        duration: slot.durationSec,
        campaignId: slot.campaignId,
        campaign_id: slot.campaignId,
        slotNumber: slot.slotNumber,
        slot_number: slot.slotNumber
      };
    });

    res.json(appendBillboardDefaults(assets, billboard));
  } catch (error) {
    logger.error('Fetch Assets Error:', error);
    res.status(500).json({ error: 'Failed to fetch assets' });
  }
};

// 3b. Get Billboard Details for a Screen
// GET /signage/screens/:screenId/details
exports.getScreenDetails = async (req, res) => {
  try {
    const { screenId } = req.params;

    const billboard = await prisma.billboard.findFirst({
      where: {
        OR: [
          { id: String(screenId) },
          { screen_id: String(screenId) }
        ]
      }
    });

    if (!billboard) {
      return res.status(404).json({ error: 'Billboard not found for screen' });
    }

    res.json({
      id: billboard.id,
      name: billboard.name,
      location: billboard.location,
      city: billboard.city,
      state: billboard.state,
      type: billboard.type,
      orientation: billboard.orientation,
      resolution: billboard.resolution,
      status: billboard.status,
      screenId: billboard.screen_id
    });
  } catch (error) {
    logger.error('Fetch Screen Details Error:', error);
    res.status(500).json({ error: 'Failed to fetch billboard details' });
  }
};

// 3c. Update Billboard Orientation from Player Configuration
// PUT /signage/screens/:screenId/orientation
exports.updateScreenOrientation = async (req, res) => {
  try {
    const { screenId } = req.params;
    const orientation = String(req.body?.orientation || '').trim().toLowerCase();
    const allowed = ['landscape', 'portrait', 'reverse_landscape', 'reverse_portrait'];

    if (!allowed.includes(orientation)) {
      return res.status(400).json({ error: 'Invalid orientation value' });
    }

    const billboard = await prisma.billboard.findFirst({
      where: {
        OR: [
          { id: String(screenId) },
          { screen_id: String(screenId) }
        ]
      }
    });

    if (!billboard) {
      return res.status(404).json({ error: 'Billboard not found for screen' });
    }

    const updated = await prisma.billboard.update({
      where: { id: billboard.id },
      data: { orientation }
    });

    res.json({
      id: updated.id,
      name: updated.name,
      location: updated.location,
      city: updated.city,
      state: updated.state,
      type: updated.type,
      orientation: updated.orientation,
      resolution: updated.resolution,
      status: updated.status,
      screenId: updated.screen_id
    });
  } catch (error) {
    logger.error('Update Screen Orientation Error:', error);
    res.status(500).json({ error: 'Failed to update screen orientation' });
  }
};

// 4. Analytics Upload
// POST /signage/analytics/upload
exports.uploadAnalytics = async (req, res) => {
  try {
    const { deviceId, appUsage, playbackStats } = req.body;

    if (!deviceId) return res.status(400).json({ error: 'deviceId is required' });

    try {
      // Log App Usage Sessions
      if (appUsage && Array.isArray(appUsage)) {
        for (const session of appUsage) {
          await prisma.screenUsage.create({
            data: {
              screenId: deviceId,
              sessionStart: new Date(session.sessionStart),
              sessionEnd: session.sessionEnd ? new Date(session.sessionEnd) : null,
              durationSec: parseInt(session.durationSec) || 0
            }
          });
        }
      }

      // Log Playback Stats (Impressions)
      if (playbackStats && Array.isArray(playbackStats)) {
        for (const stat of playbackStats) {
          await prisma.playbackStat.create({
            data: {
              screenId: deviceId,
              assetId: stat.assetId,
              playCount: stat.playCount,
              totalDuration: stat.totalDurationSec,
              lastPlayedAt: new Date(stat.lastPlayedAt)
            }
          });
        }
      }
    } catch (analyticsError) {
      if (analyticsError?.code === 'P2021') {
        logger.warn('[SIGNAGE] Analytics tables missing, skipping analytics upload', {
          deviceId,
          code: analyticsError.code,
          table: analyticsError.meta?.table
        });
        return res.json({ success: true, skipped: 'analytics_tables_missing' });
      }
      throw analyticsError;
    }

    res.json({ success: true, message: 'Analytics synced successfully' });
  } catch (error) {
    logger.error('Analytics Upload Error:', error);
    res.status(500).json({ error: 'Failed to upload analytics' });
  }
};

// POST /signage/analytics/sync
// Stores offline-first player sync batches for playback analytics.
exports.syncPlaybackAnalytics = async (req, res) => {
  try {
    const deviceId = String(req.body?.deviceId || '').trim();
    const screenId = String(req.body?.screenId || '').trim();
    const sentAtRaw = req.body?.sentAt;
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];

    if (!deviceId || !screenId) {
      return res.status(400).json({ error: 'deviceId and screenId are required' });
    }

    let sentAt = null;
    if (sentAtRaw) {
      const parsed = new Date(String(sentAtRaw));
      if (!Number.isNaN(parsed.getTime())) {
        sentAt = parsed;
      }
    }

    // Persist structured playback analytics into existing tables (best-effort).
    // We currently support `slot_playback` rows from the offline-first Electron player.
    try {
      const slotPlaybackRows = rows
        .filter((r) => r && r.table === 'slot_playback' && r.row)
        .map((r) => r.row)
        .filter((row) => row && row.end_time && row.start_time);

      if (slotPlaybackRows.length > 0 && prisma?.assetPlayLog?.create && prisma?.assetPlay?.upsert) {
        // Resolve asset_url for slot_id where possible (legacy slots table).
        const uniqueSlotIds = Array.from(
          new Set(
            slotPlaybackRows
              .map((row) => String(row.slot_id || row.slotId || '').trim())
              .filter(Boolean)
          )
        );

        const slotIdToAssetUrl = new Map();
        if (uniqueSlotIds.length > 0 && prisma?.slots?.findMany) {
          const slots = await prisma.slots.findMany({
            where: { id: { in: uniqueSlotIds } },
            select: { id: true, asset_url: true }
          });
          for (const s of slots || []) {
            if (s?.id && s?.asset_url) slotIdToAssetUrl.set(String(s.id), String(s.asset_url));
          }
        }

        for (const row of slotPlaybackRows) {
          const slotId = String(row.slot_id || row.slotId || '').trim();
          const campaignId = String(row.campaign_id || row.campaignId || '').trim() || null;
          const startTime = new Date(String(row.start_time || row.startTime));
          const endTime = new Date(String(row.end_time || row.endTime));
          const durationSeconds = Number(row.duration ?? null);
          const durationMs = Number.isFinite(durationSeconds) ? Math.max(0, Math.round(durationSeconds * 1000)) : null;

          if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) continue;

          const playDate = new Date(Date.UTC(startTime.getUTCFullYear(), startTime.getUTCMonth(), startTime.getUTCDate()));
          const assetUrl =
            String(row.asset_url || row.assetUrl || '').trim() ||
            (slotId ? slotIdToAssetUrl.get(slotId) : '') ||
            '';

          // If we can't resolve the asset URL, skip writing to aggregate tables.
          if (!assetUrl) continue;

          // 1) Detailed log (append-only)
          // Idempotency guard: players may retry the same batch on flaky networks.
          // Avoid inserting duplicate rows when the identifying fields match.
          const existing = await prisma.assetPlayLog.findFirst({
            where: {
              screenId,
              assetUrl,
              playedAt: endTime,
              campaignId,
              durationMs: durationMs ?? undefined
            },
            select: { id: true }
          });

          const inserted = !existing;
          if (inserted) {
            await prisma.assetPlayLog.create({
              data: {
                screenId,
                assetUrl,
                playedAt: endTime,
                campaignId,
                durationMs,
                success: true
              }
            });
          }

          // 2) Per-day aggregate (idempotent-ish by unique key)
          if (inserted) {
            await prisma.assetPlay.upsert({
              where: {
                unique_asset_play: {
                  screenId,
                  assetUrl,
                  campaignId,
                  playDate
                }
              },
              create: {
                screenId,
                assetUrl,
                playDate,
                playCount: 1,
                campaignId
              },
              update: {
                playCount: { increment: 1 }
              }
            });
          }
        }
      }
    } catch (structuredError) {
      logger.error('[SIGNAGE] Structured playback analytics persist failed (continuing)', {
        deviceId,
        screenId,
        message: structuredError?.message || String(structuredError)
      });
    }

    // Best-effort: if the model/table is not available yet, don't break the player.
    if (prisma?.playbackAnalytics?.create) {
      try {
        await prisma.playbackAnalytics.create({
          data: {
            deviceId,
            screenId,
            sentAt,
            rowCount: rows.length,
            payload: req.body
          }
        });
      } catch (dbError) {
        if (dbError?.code === 'P2021') {
          logger.warn('[SIGNAGE] PlaybackAnalytics table missing, skipping analytics sync persist', {
            deviceId,
            screenId,
            code: dbError.code,
            table: dbError.meta?.table
          });
        } else {
          logger.error('[SIGNAGE] PlaybackAnalytics persist failed, continuing', {
            deviceId,
            screenId,
            message: dbError?.message || String(dbError)
          });
        }
      }
    } else {
      logger.warn('[SIGNAGE] PlaybackAnalytics model not available, skipping analytics sync persist', { deviceId, screenId });
    }

    return res.json({ success: true, received: rows.length });
  } catch (error) {
    logger.error('Playback Analytics Sync Error:', error);
    return res.status(500).json({ error: 'Failed to sync analytics' });
  }
};
