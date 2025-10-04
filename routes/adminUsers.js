const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const prisma = require('../db/db');
const logger = require('../config/logger');

// Create admin user
router.post("/users", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ error: "Email and password are required" });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const adminUser = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        fullName: 'Admin User',
        status: 'admin'
      }
    });
    logger.user('Admin user created', email);
    res.status(201).json(adminUser);
  } catch (err) {
    logger.error("Error adding user:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router; 