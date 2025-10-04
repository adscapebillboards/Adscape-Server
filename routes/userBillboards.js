const express = require('express');
const router = express.Router();
const prisma = require('../db/db');
const logger = require('../config/logger');
const auth = require('../middleware/auth');
const roleAuth = require('../middleware/roleAuth');

// User billboards with role-based filtering
router.get('/userbillboards', auth, async (req, res) => {
  try {
    const user = req.user; // From getUserInfo middleware
    
    let whereClause = {};
    
    // Role-based filtering
    if (user.role === 'superadmin') {
      // Superadmin can see all billboards
      whereClause = {};
    } else {
      // Publishers and users can only see their own billboards
      whereClause = {
        userId: user.email
      };
    }

    const billboards = await prisma.billboard.findMany({
      where: whereClause,
      orderBy: {
        id: 'desc'
      }
    });

    logger.billboard(`User billboards fetched for ${user.role}`, `User: ${user.email}, Count: ${billboards.length}`, { role: user.role });
    res.json(billboards);
  } catch (error) {
    logger.error('Error fetching billboards:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router; 