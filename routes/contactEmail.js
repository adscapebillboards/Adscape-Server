const express = require('express');
const router = express.Router();
const { sendEmail } = require('../controllers/emailController');

// Email sending
router.post('/send-email', sendEmail);

module.exports = router; 