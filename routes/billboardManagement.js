const express = require('express');
const router = express.Router();
const prisma = require('../db/db');
const logger = require('../config/logger');

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
    const normalizedScreenId = screen_id.trim();

    await prisma.billboard.updateMany({
      where: {
        screen_id: normalizedScreenId,
        NOT: { id }
      },
      data: { screen_id: null }
    });

    const billboard = await prisma.billboard.update({
      where: { id },
      data: { screen_id: normalizedScreenId }
    });

    logger.billboard('Screen connected', `Billboard ID: ${id}, Screen ID: ${normalizedScreenId}`);
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
    const billboard = await prisma.billboard.update({
      where: { id },
      data: { screen_id: null }
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
