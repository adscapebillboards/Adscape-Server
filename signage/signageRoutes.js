const express = require('express');
const router = express.Router();
const signageController = require('./signageController');

// Device Endpoints
router.post('/devices/register', signageController.registerDevice);
router.get('/devices/pairing-status/:deviceId', signageController.checkPairingStatus);
router.delete('/devices/:deviceId', signageController.deregisterDevice);

// screen/Screen Endpoints
router.get('/screens/:screenId/assets', signageController.getAssets);
router.get('/screens/:screenId/details', signageController.getScreenDetails);
router.put('/screens/:screenId/orientation', signageController.updateScreenOrientation);

// Analytics Endpoints
router.post('/analytics/upload', signageController.uploadAnalytics);

module.exports = router;
