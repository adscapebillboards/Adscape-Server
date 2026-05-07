const express = require('express');
const prisma = require('../db/db');
const authenticateToken = require('../middleware/auth');
const roleAuth = require('../middleware/roleAuth');
const logger = require('../config/logger');
const fallbackErrorLogStore = require('../services/fallbackErrorLogStore');

const router = express.Router();

// Developer/Superadmin: fetch latest server error logs
router.get('/server-logs/errors', authenticateToken, roleAuth(['superadmin']), async (req, res) => {
  try {
    const limitRaw = parseInt(String(req.query.limit || '100'), 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 100;
    const beforeIdRaw = req.query.beforeId;
    const beforeId = beforeIdRaw ? parseInt(String(beforeIdRaw), 10) : null;

    const where = beforeId ? { id: { lt: beforeId } } : undefined;

    try {
      const rows = await prisma.errorLog.findMany({
        where,
        orderBy: [{ id: 'desc' }],
        take: limit,
      });

      const nextBeforeId = rows.length > 0 ? rows[rows.length - 1].id : null;
      res.json({
        items: rows,
        nextBeforeId,
        source: 'db',
      });
    } catch (dbErr) {
      logger.warn('DB errorLog query failed; using fallback store:', dbErr?.code || dbErr?.message || dbErr);
      const items = await fallbackErrorLogStore.readLatest(limit);
      res.json({
        items,
        nextBeforeId: null,
        source: 'file',
      });
    }
  } catch (error) {
    logger.error('Failed to fetch error logs:', error);
    res.status(500).json({ error: 'Failed to fetch error logs' });
  }
});

module.exports = router;
