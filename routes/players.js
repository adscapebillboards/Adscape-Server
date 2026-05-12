const express = require('express');
const router = express.Router();
const { registerPlayer, updatePlayerStatus, getPlayerStatus, getAllPlayersStatus, getPlayerScreenByBillboardId } = require('../controllers/playerController');
const { getDefaultAsset, createDefaultAsset, updateDefaultAsset, deleteDefaultAsset, checkDefaultAssetUpdate } = require('../controllers/defaultAssetController');
const { getPlaylistForScreen } = require('../utils/socketHelpers');

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
router.put('/default-asset/:id', updateDefaultAsset);
router.delete('/default-asset/:id', deleteDefaultAsset);

/**
 * GET /api/screens/:screenId/player-online
 * Returns whether the Android player for this screen currently has an active socket connection.
 * Used by the client to show "Player is offline" immediately rather than waiting for a timeout.
 */
router.get('/screens/:screenId/player-online', (req, res) => {
    try {
        const { screenId } = req.params;
        const io = req.app.get('io');
        if (!io) return res.json({ online: false, reason: 'io_unavailable' });

        // Check if any socket is in the screen room
        const room = io.sockets.adapter.rooms.get(`screen:${screenId}`);
        const online = !!(room && room.size > 0);
        res.json({ screenId, online, sockets: room ? room.size : 0 });
    } catch (err) {
        res.status(500).json({ online: false, error: err.message });
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

        const isVideo = /\\.mp4$/i.test(currentSlot.assetUrl || '');
        res.json({
            screenId,
            asset: {
                url: currentSlot.assetUrl,
                type: isVideo ? 'video' : 'image',
                slotNumber: currentSlot.slot,
                campaignId: currentSlot.campaignId,
                durationSec: currentSlot.durationSec,
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
