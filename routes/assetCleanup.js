const express = require('express');
const router = express.Router();
const assetCleanupScheduler = require('../utils/assetCleanupScheduler');
const logger = require('../config/logger');

/**
 * GET /asset-cleanup/stats
 * Get cleanup statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await assetCleanupScheduler.getCleanupStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Error getting cleanup stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get cleanup statistics'
    });
  }
});

/**
 * POST /asset-cleanup/manual
 * Manually trigger asset cleanup
 */
router.post('/manual', async (req, res) => {
  try {
    logger.info('Manual asset cleanup triggered via API');
    await assetCleanupScheduler.manualCleanup();
    
    res.json({
      success: true,
      message: 'Manual cleanup completed'
    });
  } catch (error) {
    logger.error('Error during manual cleanup:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to perform manual cleanup'
    });
  }
});

/**
 * POST /asset-cleanup/start
 * Start the cleanup scheduler
 */
router.post('/start', (req, res) => {
  try {
    assetCleanupScheduler.start();
    res.json({
      success: true,
      message: 'Asset cleanup scheduler started'
    });
  } catch (error) {
    logger.error('Error starting cleanup scheduler:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start cleanup scheduler'
    });
  }
});

/**
 * POST /asset-cleanup/stop
 * Stop the cleanup scheduler
 */
router.post('/stop', (req, res) => {
  try {
    assetCleanupScheduler.stop();
    res.json({
      success: true,
      message: 'Asset cleanup scheduler stopped'
    });
  } catch (error) {
    logger.error('Error stopping cleanup scheduler:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to stop cleanup scheduler'
    });
  }
});

module.exports = router;






