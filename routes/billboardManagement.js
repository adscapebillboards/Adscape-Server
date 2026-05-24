const express = require('express');
const router = express.Router();
const prisma = require('../db/db');
const logger = require('../config/logger');
const { cascadeScreenIdUpdate } = require('../utils/billboardCascade');

// Delete billboard
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const billboard = await prisma.billboard.delete({
      where: { id }
    });

    logger.billboard('Billboard deleted', `ID: ${id}`);
    res.status(200).json({ message: 'Billboard deleted successfully' });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Billboard not found' });
    }
    logger.error('Error deleting billboard:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update billboard status
router.patch('/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['online', 'offline'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status. Use "online" or "offline".' });
  }

  try {
    const billboard = await prisma.billboard.update({
      where: { id },
      data: { status }
    });

    logger.billboard('Status updated', `ID: ${id}, Status: ${status}`);
    res.json({ message: 'Status updated', billboard });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Billboard not found' });
    }
    logger.error('PATCH status error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Connect screen_id to billboard
router.patch('/:id/connect', async (req, res) => {
  const { id } = req.params;
  const { screen_id } = req.body;

  if (!screen_id || typeof screen_id !== 'string') {
    return res.status(400).json({ error: 'screen_id is required and must be a string' });
  }

  try {
    const normalizedCode = screen_id.trim();

    // Check if the user entered a pairing code instead of a direct screenId
    const player = await prisma.adscapePlayer.findFirst({
        where: { connectionCode: normalizedCode }
    });
    
    // Resolve logical hardware screenId
    const targetScreenId = player ? player.screenId : normalizedCode;

    let billboard;
    await prisma.$transaction(async (tx) => {
      const oldBillboard = await tx.billboard.findUnique({
        where: { id },
        select: { screen_id: true }
      });

      await tx.billboard.updateMany({
        where: {
          screen_id: targetScreenId,
          NOT: { id }
        },
        data: { screen_id: null }
      });

      billboard = await tx.billboard.update({
        where: { id },
        data: { screen_id: targetScreenId }
      });

      // Cascade the update to generated slots and schedules
      await cascadeScreenIdUpdate(id, oldBillboard?.screen_id, targetScreenId, tx);
    });

    logger.billboard('Screen connected', `Billboard ID: ${id}, Screen ID: ${targetScreenId}`);

    // Emit live pairing details and initial playlist to the player instantly via Socket.IO
    const io = req.app.get('io');
    if (io) {
      try {
        const globalDefault = await prisma.defaultAsset.findFirst({
          where: { isActive: true },
          orderBy: { updatedAt: 'desc' }
        });
        const globalUrl = globalDefault ? globalDefault.assetUrl : 'https://res.cloudinary.com/dh0ehlpkp/image/upload/v1772717423/Logo_ssxriy.png';
        const defaultAssetUrl = billboard.defaultAssetUrl || globalUrl;

        const payload = {
          screenId: billboard.id,
          name: billboard.name,
          location: billboard.location,
          city: billboard.city,
          defaultImage: defaultAssetUrl
        };

        // Emit to the old hardware ID room so the player showing the pairing screen gets it instantly
        io.to(`player-${targetScreenId}`).emit('billboard-details', payload);
        io.to(`screen:${targetScreenId}`).emit('billboard-details', payload);

        // If the user used a connectionCode, also emit to the connectionCode room to be safe
        if (player && player.connectionCode) {
          io.to(`player-${player.connectionCode}`).emit('billboard-details', payload);
          io.to(`screen:${player.connectionCode}`).emit('billboard-details', payload);
        }

        // Also fetch and emit playlist instantly so player caches it
        const { getPlaylistForScreen } = require('../utils/socketHelpers');
        const { playlist, assets, date } = await getPlaylistForScreen(billboard.id);
        
        // Emit playlist and assets to all aliases
        const aliases = [
          `player-${targetScreenId}`,
          `screen:${targetScreenId}`,
          `player-${billboard.id}`,
          `screen:${billboard.id}`
        ];
        if (player && player.connectionCode) {
          aliases.push(`player-${player.connectionCode}`);
          aliases.push(`screen:${player.connectionCode}`);
        }

        for (const alias of aliases) {
          io.to(alias).emit('playlist', { screenId: billboard.id, playlist, date });
          io.to(alias).emit('assets', { screenId: billboard.id, assets });
        }
        
        logger.info(`[SOCKET] Broadcasted billboard-details and playlist to paired player: ${targetScreenId}`);
      } catch (socketErr) {
        logger.error('Error emitting pairing socket events:', socketErr);
      }
    }

    res.json({ message: 'Billboard connected successfully', billboard });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Billboard not found' });
    }
    logger.error('Error connecting screen_id:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Disconnect screen_id from billboard
router.patch('/:id/disconnect', async (req, res) => {
  const { id } = req.params;

  try {
    let billboard;
    await prisma.$transaction(async (tx) => {
      const oldBillboard = await tx.billboard.findUnique({
        where: { id },
        select: { screen_id: true }
      });

      billboard = await tx.billboard.update({
        where: { id },
        data: { screen_id: null }
      });

      // Cascade the update to generated slots and schedules (new screen ID is null)
      await cascadeScreenIdUpdate(id, oldBillboard?.screen_id, null, tx);
    });

    logger.billboard('Screen disconnected', `Billboard ID: ${id}`);
    res.json({ message: 'Screen disconnected successfully', billboard });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Billboard not found' });
    }
    logger.error('Error disconnecting screen_id:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
