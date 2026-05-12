const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/auth');
const roleAuth = require('../middleware/roleAuth');
const prisma = require('../db/db');
const { execSync } = require('child_process');
const logger = require('../config/logger');

router.get('/dev/status', authenticateToken, roleAuth(['superadmin', 'developer']), async (req, res) => {
  try {
    // 1. Screen Status
    // Count screens active in the last 5 minutes
    let liveScreens = 0;
    try {
      const activeThreshold = new Date(Date.now() - 5 * 60 * 1000);
      const activePlayers = await prisma.$queryRawUnsafe(
        'SELECT COUNT(*) as count FROM "PlayerScreen" WHERE "lastActive" > $1 AND "statinfo" = \'active\'',
        activeThreshold
      );
      liveScreens = Number(activePlayers[0]?.count || 0);
    } catch (e) {
      logger.error('Error counting live screens:', e);
    }

    const totalScreens = await prisma.$queryRawUnsafe('SELECT COUNT(*) as count FROM "PlayerScreen"')
      .then(r => Number(r[0]?.count || 0))
      .catch(() => 0);

    // 2. Deployment Info
    const branch = process.env.VERCEL_GIT_COMMIT_REF || process.env.GIT_BRANCH;
    const commitSha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_SHA;
    const commitMsg = process.env.VERCEL_GIT_COMMIT_MESSAGE;
    
    let displayBranch = branch || 'unknown';
    let lastCommitTime = 'unknown';
    
    if (!branch) {
      try {
        displayBranch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
        lastCommitTime = execSync('git log -1 --format=%cd').toString().trim();
      } catch (e) {
        displayBranch = 'main (fallback)';
      }
    } else {
        // If we have Vercel env vars, use current time as deployment time or similar
        lastCommitTime = new Date().toISOString();
    }

    // 3. Socket info if available
    const io = req.app.get('io');
    let socketConnections = 0;
    if (io && io.sockets) {
        socketConnections = io.sockets.sockets.size || 0;
    }

    res.json({
      screens: {
        online: liveScreens,
        total: totalScreens,
        socketConnections
      },
      server: {
        uptime: process.uptime(),
        branch: displayBranch,
        commit: commitSha ? commitSha.substring(0, 7) : 'N/A',
        commitMessage: commitMsg || 'Manual deployment',
        lastDeployment: lastCommitTime,
        status: 'stable',
        environment: process.env.NODE_ENV || 'development',
        isServerless: !!process.env.VERCEL
      }
    });
  } catch (error) {
    logger.error('Failed to fetch system status:', error);
    res.status(500).json({ error: 'Failed to fetch system status' });
  }
});

module.exports = router;
