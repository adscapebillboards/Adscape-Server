const express = require('express');
const router = express.Router();

// Email routes
router.post('/send', (req, res) => {
  res.json({ message: 'Email endpoint' });
});

module.exports = router;