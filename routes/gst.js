const cloudinary = require('./../config/cloudinary'); // Import cloudinary config
const prisma = require('../db/db'); // Prisma client
const express = require('express');
const router = express.Router(); // Initialize the router

// Business Profile update with document upload to Cloudinary
router.post('/upload', (req, res) => {
  res.json({ message: 'GST upload endpoint' });
});

module.exports = router;
