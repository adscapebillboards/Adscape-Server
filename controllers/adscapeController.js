const prisma = require('../db/db');
const logger = require('../config/logger');

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
 * Delete a player
 * DELETE /api/adscape/player/:screenId
 */
exports.deletePlayer = async (req, res) => {
    try {
        const { screenId } = req.params;
        logger.info('[ADSCAPE] Deleting player:', screenId);
        
        await prisma.adscapePlayer.delete({
            where: { screenId }
        });
        
        res.json({ 
            success: true, 
            message: 'Player deleted successfully' 
        });
    } catch (error) {
        logger.error('[ADSCAPE] Delete player error:', error);
        res.status(500).json({ error: 'Failed to delete player' });
    }
};
