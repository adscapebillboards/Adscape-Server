const express = require('express');
const router = express.Router();
const prisma = require('../db/db');
const logger = require('../config/logger');
const auth = require('../middleware/auth');
const roleAuth = require('../middleware/roleAuth');

// User billboards with role-based filtering
router.get('/userbillboards', auth, async (req, res) => {
  try {
    const user = req.user; // From auth middleware (JWT token)
    
    if (!user || !user.email) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    let whereClause = {};
    
    // Role-based filtering
    if (user.role === 'superadmin') {
      // Superadmin can see all billboards
      whereClause = {};
    } else {
      // Publishers and admins can only see their own billboards
      // Filter by userId (which stores the billboard owner's email in the user_id column)
      // Note: userId field in Prisma maps to user_id column in database
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

    console.log(`[userBillboards] Fetched billboards for ${user.role}`, {
      userEmail: user.email,
      count: billboards.length,
      whereClause: whereClause
    });
    
    logger.billboard(`User billboards fetched for ${user.role}`, `User: ${user.email}, Count: ${billboards.length}`, { role: user.role });
    res.json(billboards);
  } catch (error) {
    logger.error('Error fetching billboards:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router; 