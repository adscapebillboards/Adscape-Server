const prisma = require('../db/db');
const logger = require('../config/logger');

/**
 * Controller for modern Android Signage (v3) API.
 * Handles device registration, asset delivery, and analytics.
 */

// 1. Device Registration (First Launch)
// POST /signage/devices/register
exports.registerDevice = async (req, res) => {
  try {
    const { deviceId, model, manufacturer, osVersion, screenResolution, appVersion } = req.body;

    if (!deviceId) return res.status(400).json({ error: 'deviceId is required' });

    // Generate a unique 10-digit pairing code if not already paired
    // For simplicity, we use a random numeric string
    const connectionCode = Math.floor(1000000000 + Math.random() * 9000000000).toString();

    const device = await prisma.adscapePlayer.upsert({
      where: { screenId: deviceId },
      update: {
        deviceName: `${manufacturer} ${model}`,
        osVersion: osVersion,
        appVersion: "F3", // We've refactored to F3
        appVersionCode: appVersion,
        updatedAt: new Date(),
        lastSeen: new Date()
      },
      create: {
        screenId: deviceId,
        deviceName: `${manufacturer} ${model}`,
        osVersion: osVersion,
        appVersion: "F3",
        appVersionCode: appVersion,
        isActive: true
      }
    });

    // Also update legacy PlayerScreen table for compatibility if needed
    try {
        await prisma.playerScreen.upsert({
            where: { machineId: deviceId },
            update: { resolution: screenResolution, updatedAt: new Date() },
            create: { machineId: deviceId, screenId: deviceId, resolution: screenResolution }
        });
    } catch(e) { /* ignore legacy check */ }

    res.json({
      success: true,
      connectionCode, // Machine shows this to user for pairing
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

    // A device is "paired" if it has been assigned to a Billboard in our system.
    // In this schema, Billboards have a screen_id field.
    const billboard = await prisma.billboard.findFirst({
      where: { screen_id: deviceId }
    });

    if (billboard) {
      res.json({
        isPaired: true,
        screenId: billboard.id, // The billboard ID becomes the logical screenId
        location: billboard.location
      });
    } else {
      res.json({ isPaired: false });
    }
  } catch (error) {
    res.status(500).json({ error: 'Pairing check failed' });
  }
};

// 3. Get Assets for Screen
// GET /signage/screens/:screenId/assets?date=YYYY-MM-DD
exports.getAssets = async (req, res) => {
  try {
    const { screenId } = req.params;
    const dateStr = req.query.date || new Date().toISOString().split('T')[0];

    // Find the schedule for this screen on this date
    const schedule = await prisma.dailySchedule.findUnique({
      where: {
        screenId_scheduleDate: {
          screenId: screenId,
          scheduleDate: new Date(dateStr)
        }
      },
      include: { slots: true }
    });

    if (!schedule || !schedule.slots.length) {
      // Fallback: return default branding assets if no specific schedule exists
      const defaultAssets = await prisma.defaultAsset.findMany({ where: { isActive: true } });
      return res.json(defaultAssets.map(a => ({
        id: `default-${a.id}`,
        url: a.assetUrl,
        type: a.assetType || 'image',
        duration: a.duration || 10,
        checksum: null
      })));
    }

    const assets = schedule.slots.map(slot => ({
      id: slot.id,
      url: slot.assetUrl,
      type: slot.assetUrl.toLowerCase().endsWith('.mp4') ? 'video' : 'image',
      duration: slot.durationSec,
      campaignId: slot.campaignId
    }));

    res.json(assets);
  } catch (error) {
    logger.error('Fetch Assets Error:', error);
    res.status(500).json({ error: 'Failed to fetch assets' });
  }
};

// 4. Analytics Upload
// POST /signage/analytics/upload
exports.uploadAnalytics = async (req, res) => {
  try {
    const { deviceId, appUsage, playbackStats } = req.body;

    if (!deviceId) return res.status(400).json({ error: 'deviceId is required' });

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

    res.json({ success: true, message: 'Analytics synced successfully' });
  } catch (error) {
    logger.error('Analytics Upload Error:', error);
    res.status(500).json({ error: 'Failed to upload analytics' });
  }
};
