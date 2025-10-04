const express = require('express');
const router = express.Router();
const logger = require('../config/logger');

// Basic API endpoints
router.get('/data', (req, res) => {
  let counter = 0;
  counter++;
  logger.api('GET', '/api/data', 'Counter:', counter);
  res.json({ message: 'Here is some data', counter });
});

router.post('/update', (req, res) => {
  const payload = req.body;
  logger.api('POST', '/api/update', 'Received data:', payload);
  res.json({ status: 'success', received: payload });
});

module.exports = router; 