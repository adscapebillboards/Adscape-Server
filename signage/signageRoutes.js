const express = require('express');
const router = express.Router();
const signageController = require('./signageController');

// Device Endpoints
router.post('/devices/register', signageController.registerDevice);
router.get('/devices/pairing-status/:deviceId', signageController.checkPairingStatus);

// screen/Screen Endpoints
router.get('/screens/:screenId/assets', signageController.getAssets);

// Analytics Endpoints
router.post('/analytics/upload', signageController.uploadAnalytics);

module.exports = router;
