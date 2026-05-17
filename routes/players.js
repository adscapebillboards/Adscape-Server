const express = require('express');
const router = express.Router();
const { registerPlayer, updatePlayerStatus, getPlayerStatus, getAllPlayersStatus, getPlayerScreenByBillboardId } = require('../controllers/playerController');
const { getDefaultAsset, createDefaultAsset, updateDefaultAsset, deleteDefaultAsset, checkDefaultAssetUpdate, overwriteAllBillboardsWithGlobalDefault } = require('../controllers/defaultAssetController');
const { getPlaylistForScreen } = require('../utils/socketHelpers');
const { resolveScreenContext, isPlayerOnlineInRooms, countViewersInRooms } = require('../utils/screenIdResolver');
const playerRegistry = require('../services/playerConnectionRegistry');

// Player routes
router.post('/players/register', registerPlayer);
router.post('/players/update-status', updatePlayerStatus);
router.get('/players/status/:machineId', getPlayerStatus);
router.get('/players/status', getAllPlayersStatus);
router.get('/players/screen/:billboardId', getPlayerScreenByBillboardId);

// Default asset routes
router.get('/default-asset', getDefaultAsset);
router.get('/default-asset/check-update', checkDefaultAssetUpdate);
router.post('/default-asset', createDefaultAsset);
router.post('/default-asset/overwrite-all', overwriteAllBillboardsWithGlobalDefault);
router.put('/default-asset/:id', updateDefaultAsset);
router.delete('/default-asset/:id', deleteDefaultAsset);

/**
 * GET /api/screens/:screenId/player-online
 * Returns whether the Android player for this screen currently has an active socket connection.
 * Used by the client to show "Player is offline" immediately rather than waiting for a timeout.
 */
router.get('/screens/:screenId/player-online', async (req, res) => {
    try {
        const { screenId } = req.params;
        const io = req.app.get('io');
        if (!io) return res.json({ online: false, reason: 'io_unavailable' });

        const { aliases, canonicalScreenId } = await resolveScreenContext(screenId);
        const onlineInRooms = isPlayerOnlineInRooms(io, aliases);
        const onlineInRegistry = playerRegistry.isOnline(aliases);
        const online = onlineInRooms || onlineInRegistry;
        let sockets = playerRegistry.countSockets(aliases);
        if (sockets === 0) {
            for (const id of aliases) {
                const room = io.sockets.adapter.rooms.get(`screen:${id}`);
                if (room) sockets += room.size;
            }
        }
        res.json({
            screenId,
            canonicalScreenId,
            aliases,
            online,
            sockets,
            onlineInRooms,
            onlineInRegistry,
        });
    } catch (err) {
        res.status(500).json({ online: false, error: err.message });
    }
});

/**
 * GET /api/screens/:screenId/resolve
 * Maps billboard.id / screen_id / connection code to canonical player socket id.
 */
router.get('/screens/:screenId/resolve', async (req, res) => {
    try {
        const { screenId } = req.params;
        const io = req.app.get('io');
        const { aliases, canonicalScreenId, billboard } = await resolveScreenContext(screenId);
        const online = io
            ? isPlayerOnlineInRooms(io, aliases) || playerRegistry.isOnline(aliases)
            : playerRegistry.isOnline(aliases);
        res.json({
            screenId,
            canonicalScreenId,
            aliases,
            playerOnline: online,
            billboard: billboard
                ? { id: billboard.id, screen_id: billboard.screen_id, name: billboard.name }
                : null,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/screens/:screenId/live-feed-status
 * Debug helper: returns socket membership for both player and viewer rooms.
 */
router.get('/screens/:screenId/live-feed-status', async (req, res) => {
    try {
        const { screenId } = req.params;
        const io = req.app.get('io');
        if (!io) return res.json({ screenId, playerOnline: false, viewers: 0, reason: 'io_unavailable' });

        const { aliases, canonicalScreenId } = await resolveScreenContext(screenId);
        const playerOnline =
            isPlayerOnlineInRooms(io, aliases) || playerRegistry.isOnline(aliases);
        let playerSockets = playerRegistry.countSockets(aliases);
        if (playerSockets === 0) {
            for (const id of aliases) {
                const room = io.sockets.adapter.rooms.get(`screen:${id}`);
                if (room) playerSockets += room.size;
            }
        }

        res.json({
            screenId,
            canonicalScreenId,
            aliases,
            playerOnline,
            playerSockets,
            viewers: countViewersInRooms(io, aliases),
            connectedPlayers: playerRegistry.listPlayers(),
        });
    } catch (err) {
        res.status(500).json({ screenId: req.params.screenId, error: err.message });
    }
});

/**
 * GET /api/screens/online-map
 * Returns a map of screenId -> online socket presence (realtime).
 * Intended for admin dashboards to avoid N+1 calls.
 */
router.get('/screens/online-map', (req, res) => {
    try {
        const io = req.app.get('io');
        if (!io) return res.json({ screens: {}, reason: 'io_unavailable' });

        const rooms = io.sockets.adapter.rooms;
        const screens = {};

        // Rooms are like: `screen:<screenId>`; each contains player sockets.
        for (const [roomName, members] of rooms.entries()) {
            if (!roomName || typeof roomName !== 'string') continue;
            if (!roomName.startsWith('screen:')) continue;
            const screenId = roomName.slice('screen:'.length);
            if (!screenId) continue;
            screens[screenId] = { online: members && members.size > 0, sockets: members ? members.size : 0 };
        }

        res.json({ screens });
    } catch (err) {
        res.status(500).json({ screens: {}, error: err.message });
    }
});

/**
 * GET /api/screens/:screenId/current-asset
 * Returns the currently-scheduled asset for a screen based on today's playlist.
 * Client uses this as a REST fallback when the socket live-feed is unavailable.
 */
router.get('/screens/:screenId/current-asset', async (req, res) => {
    try {
        const { screenId } = req.params;
        const { playlist } = await getPlaylistForScreen(screenId);

        if (!playlist || playlist.length === 0) {
            return res.json({ screenId, asset: null, totalSlots: 0 });
        }

        // Determine which slot is active right now based on time-of-day round-robin
        // Each slot plays for durationSec seconds, cycling through all slots.
        const totalDuration = playlist.reduce((sum, s) => sum + (s.durationSec || 15), 0);
        const nowSec = Math.floor(Date.now() / 1000);
        const posInCycle = nowSec % totalDuration;

        let accumulated = 0;
        let currentSlot = playlist[0];
        for (const slot of playlist) {
            accumulated += (slot.durationSec || 15);
            if (posInCycle < accumulated) {
                currentSlot = slot;
                break;
            }
        }

        const slotDuration = currentSlot.durationSec || 15;
        const slotStartInCycle = accumulated - slotDuration;
        const startedAtMs = Date.now() - (posInCycle - slotStartInCycle) * 1000;

        const isVideo = /\.mp4$/i.test(currentSlot.assetUrl || '');
        res.json({
            screenId,
            asset: {
                url: currentSlot.assetUrl,
                type: isVideo ? 'video' : 'image',
                slotNumber: currentSlot.slot,
                campaignId: currentSlot.campaignId,
                durationSec: slotDuration,
                startedAtMs,
            },
            totalSlots: playlist.length,
            cyclePositionSec: posInCycle,
        });
    } catch (err) {
        console.error('[current-asset]', err);
        res.status(500).json({ asset: null, error: err.message });
    }
});

module.exports = router;
