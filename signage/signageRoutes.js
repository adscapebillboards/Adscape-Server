const express = require('express');
const router = express.Router();
const signageController = require('./signageController');

// Device Endpoints
router.post('/devices/register', signageController.registerDevice);
router.get('/devices/pairing-status/:deviceId', signageController.checkPairingStatus);
router.get('/devices/pairing-info/:deviceId', signageController.getPairingInfo);
router.get('/devices/pairing-qr/:deviceId', signageController.getPairingQr);
router.delete('/devices/:deviceId', signageController.deregisterDevice);

// screen/Screen Endpoints
router.get('/screens/:screenId/assets', signageController.getAssets);
router.get('/screens/:screenId/priority-assets', signageController.getPriorityAssets);
router.get('/screens/:screenId/details', signageController.getScreenDetails);
router.put('/screens/:screenId/orientation', signageController.updateScreenOrientation);

// Analytics Endpoints
router.post('/analytics/upload', signageController.uploadAnalytics);
router.post('/analytics/sync', signageController.syncPlaybackAnalytics);

module.exports = router;
