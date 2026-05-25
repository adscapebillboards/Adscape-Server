const prisma = require('../db/db');
const logger = require('../config/logger');
const { cascadeScreenIdUpdate } = require('../utils/billboardCascade');

/**
 * Register or update an Adscape player
 * POST /api/adscape/register
 */
exports.registerPlayer = async (req, res) => {
    try {
        const { 
            screenId, 
            appVersion, 
            flowType, 
            deviceName, 
            screenWidth, 
            screenHeight, 
            ipAddress, 
            location, 
            osVersion, 
            appVersionCode 
        } = req.body || {};
        
        if (!screenId || !appVersion) {
            return res.status(400).json({ error: 'screenId and appVersion required' });
        }
        
        // Upsert Adscape player registration
        const player = await prisma.adscapePlayer.upsert({
            where: { screenId: String(screenId) },
            update: {
                appVersion: String(appVersion),
                // Only update flowType if provided, otherwise keep existing value
                ...(flowType !== undefined && flowType !== null ? { flowType: String(flowType) } : {}),
                deviceName: deviceName ? String(deviceName) : null,
                screenWidth: screenWidth ? Number(screenWidth) : null,
                screenHeight: screenHeight ? Number(screenHeight) : null,
                ipAddress: ipAddress ? String(ipAddress) : null,
                location: location ? String(location) : null,
                osVersion: osVersion ? String(osVersion) : null,
                appVersionCode: appVersionCode ? String(appVersionCode) : null,
                lastSeen: new Date(),
                isActive: true,
                updatedAt: new Date()
            },
            create: {
                screenId: String(screenId),
                appVersion: String(appVersion),
                flowType: flowType ? String(flowType) : null,
                deviceName: deviceName ? String(deviceName) : null,
                screenWidth: screenWidth ? Number(screenWidth) : null,
                screenHeight: screenHeight ? Number(screenHeight) : null,
                ipAddress: ipAddress ? String(ipAddress) : null,
                location: location ? String(location) : null,
                osVersion: osVersion ? String(osVersion) : null,
                appVersionCode: appVersionCode ? String(appVersionCode) : null,
                lastSeen: new Date(),
                isActive: true
            }
        });
        
        logger.info('[ADSCAPE] Player registered:', { screenId, appVersion, flowType });
        
        return res.json({ 
            ok: true, 
            player: {
                id: player.id,
                screenId: player.screenId,
                appVersion: player.appVersion,
                flowType: player.flowType,
                isActive: player.isActive
            }
        });
    } catch (e) {
        logger.error('[ADSCAPE] Registration error:', e);
        return res.status(500).json({ error: 'internal_error' });
    }
};

/**
 * Get a specific player by screenId
 * GET /api/adscape/player/:screenId
 */
exports.getPlayer = async (req, res) => {
    try {
        const { screenId } = req.params;
        
        const player = await prisma.adscapePlayer.findUnique({
            where: { screenId: String(screenId) }
        });
        
        if (!player) {
            return res.status(404).json({ error: 'Player not found' });
        }
        
        return res.json({
            ok: true,
            player: {
                screenId: player.screenId,
                appVersion: player.appVersion,
                flowType: player.flowType,
                isActive: player.isActive
            }
        });
    } catch (e) {
        logger.error('[ADSCAPE] Get player error:', e);
        return res.status(500).json({ error: 'internal_error' });
    }
};

/**
 * Get all players
 * GET /api/adscape/players
 */
exports.getAllPlayers = async (req, res) => {
    try {
        logger.info('[ADSCAPE] Getting all players');
        
        const players = await prisma.adscapePlayer.findMany({
            orderBy: { lastSeen: 'desc' }
        });
        
        res.json({ 
            success: true, 
            players 
        });
    } catch (error) {
        logger.error('[ADSCAPE] Get players error:', error);
        res.status(500).json({ error: 'Failed to get players' });
    }
};

/**
 * Update player flow type
 * PUT /api/adscape/player/:screenId/flow-type
 */
exports.updateFlowType = async (req, res) => {
    try {
        const { screenId } = req.params;
        const { flowType } = req.body;
        
        logger.info('[ADSCAPE] Updating flow type for player:', screenId, 'to:', flowType);
        
        const player = await prisma.adscapePlayer.update({
            where: { screenId },
            data: { flowType }
        });
        
        res.json({ 
            success: true, 
            player 
        });
    } catch (error) {
        logger.error('[ADSCAPE] Update flow type error:', error);
        res.status(500).json({ error: 'Failed to update flow type' });
    }
};

/**
 * Delete a player and all its associated data
 * DELETE /api/adscape/player/:screenId
 */
exports.deletePlayer = async (req, res) => {
    try {
        const { screenId } = req.params;
        logger.info('[ADSCAPE] Performing full data purge for player:', screenId);
        
        // Perform cleanup while PRESERVING analytics and playback history
        await prisma.$transaction(async (tx) => {
            // Find billboards linked to this screen first
            const billboards = await tx.billboard.findMany({
                where: { screen_id: screenId },
                select: { id: true }
            });

            // 1. Unlink from any Billboards
            await tx.billboard.updateMany({
                where: { screen_id: screenId },
                data: { screen_id: null }
            });

            // 2. Cascade clearing to GeneratedSlot (screenId array will now have empty string at that index)
            for (const bb of billboards) {
                await cascadeScreenIdUpdate(bb.id, screenId, null, tx);
            }

            // 3. Clear Daily Schedules (DailySlots will cascade delete)
            await tx.dailySchedule.deleteMany({
                where: { screenId }
            });

            // 4. Clear the legacy PlayerScreen record if it exists
            await tx.playerScreen.deleteMany({
                where: { screenId }
            });

            // 5. Finally, remove the AdscapePlayer registration
            await tx.adscapePlayer.deleteMany({
                where: { screenId }
            });
        });
        
        logger.info('[ADSCAPE] Player registration and schedules cleared. Analytics preserved for:', screenId);
        
        res.json({ 
            success: true, 
            message: 'Player and all associated analytics/schedule data deleted successfully' 
        });
    } catch (error) {
        logger.error('[ADSCAPE] Comprehensive delete player error:', error);
        res.status(500).json({ error: 'Failed to completely purge player data' });
    }
};

/**
 * Check if screen ID is assigned to a billboard
 * GET /api/adscape/check-assignment/:screenId
 */
exports.checkScreenAssignment = async (req, res) => {
    try {
        const { screenId } = req.params;
        
        logger.info('[ADSCAPE] Checking assignment for screenId:', screenId);
        
        // Check if any billboard has this screen_id
        const billboard = await prisma.billboard.findFirst({
            where: {
                screen_id: String(screenId)
            },
            select: {
                id: true,
                name: true,
                screen_id: true,
                status: true,
                available: true
            }
        });
        
        if (billboard) {
            logger.info('[ADSCAPE] Screen ID assigned to billboard:', billboard.id);
            return res.json({
                assigned: true,
                billboard: {
                    id: billboard.id,
                    name: billboard.name,
                    status: billboard.status,
                    available: billboard.available
                }
            });
        }
        
        logger.info('[ADSCAPE] Screen ID not assigned to any billboard');
        return res.json({
            assigned: false,
            billboard: null
        });
    } catch (error) {
        logger.error('[ADSCAPE] Check assignment error:', error);
        return res.status(500).json({ 
            assigned: false,
            error: 'Failed to check assignment' 
        });
    }
};

/**
 * Get detailed player analytics
 * GET /api/adscape/player/:screenId/analytics
 */
exports.getPlayerAnalytics = async (req, res) => {
    try {
        const { screenId } = req.params;
        
        const player = await prisma.adscapePlayer.findUnique({
            where: { screenId: String(screenId) }
        });
        
        if (!player) {
            return res.status(404).json({ error: 'Player not found' });
        }
        
        // Fetch screen usage logs and play logs across all possible paired screen identifiers
        const searchIds = [String(screenId)];
        if (player.connectionCode) {
            searchIds.push(String(player.connectionCode));
        }
        
        const billboards = await prisma.billboard.findMany({
            where: {
                OR: [
                    { screen_id: String(screenId) },
                    ...(player.connectionCode ? [{ screen_id: String(player.connectionCode) }] : [])
                ]
            },
            select: { screen_id: true, id: true }
        });
        
        for (const b of billboards) {
            if (b.screen_id) searchIds.push(String(b.screen_id));
            if (b.id) searchIds.push(String(b.id));
        }
        
        const uniqueSearchIds = Array.from(new Set(searchIds.filter(Boolean)));
        
        // Fetch raw playback analytics sync batches from PlaybackAnalytics model
        const batches = await prisma.playbackAnalytics.findMany({
            where: {
                OR: [
                    { deviceId: { in: uniqueSearchIds } },
                    { screenId: { in: uniqueSearchIds } }
                ]
            },
            orderBy: { receivedAt: 'desc' },
            take: 100
        });

        const detailedPlayLogs = [];
        const statMap = new Map();
        const usageLogs = [];
        const uniqueDates = new Set();

        for (const batch of batches) {
            const payload = batch.payload || {};
            const rows = Array.isArray(payload.rows) ? payload.rows : [];
            
            // Extract detailed play logs from each batch payload
            for (const r of rows) {
                if (r && r.table === 'slot_playback' && r.row) {
                    const row = r.row;
                    const playedAtTime = new Date(row.end_time || batch.receivedAt);
                    const log = {
                        id: detailedPlayLogs.length + 1,
                        playedAt: playedAtTime,
                        assetUrl: row.asset_url || '',
                        campaignId: row.campaign_id || null,
                        durationMs: Number.isFinite(row.duration) ? Math.round(row.duration * 1000) : 15000,
                        success: true
                    };
                    detailedPlayLogs.push(log);

                    // Aggregate playback stats on-the-fly
                    const assetKey = log.assetUrl;
                    const durSec = Number.isFinite(row.duration) ? row.duration : 15;
                    if (!statMap.has(assetKey)) {
                        statMap.set(assetKey, {
                            id: statMap.size + 1,
                            assetId: assetKey,
                            playCount: 0,
                            totalDuration: 0,
                            lastPlayedAt: playedAtTime
                        });
                    }
                    const stat = statMap.get(assetKey);
                    stat.playCount += 1;
                    stat.totalDuration += durSec;
                    if (playedAtTime > new Date(stat.lastPlayedAt)) {
                        stat.lastPlayedAt = playedAtTime;
                    }
                }
            }

            // Synthesize screen usage logs from the batch checkpoints
            const dateStr = new Date(batch.receivedAt).toDateString();
            if (!uniqueDates.has(dateStr)) {
                uniqueDates.add(dateStr);
                usageLogs.push({
                    id: usageLogs.length + 1,
                    sessionStart: batch.receivedAt,
                    durationSec: Math.max(60, batch.rowCount * 15)
                });
            }
        }

        const playbackStats = Array.from(statMap.values());
        
        return res.json({
            success: true,
            player,
            usageLogs,
            playbackStats,
            detailedPlayLogs
        });
    } catch (e) {
        logger.error('[ADSCAPE] Get player analytics error:', e);
        return res.status(500).json({ error: 'Failed to retrieve player analytics' });
    }
};
