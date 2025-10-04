const express = require('express');
const router = express.Router();
const { registerPlayer, updatePlayerStatus, getPlayerStatus, getAllPlayersStatus, getPlayerScreenByBillboardId } = require('../controllers/playerController');
const { getDefaultAsset, createDefaultAsset, updateDefaultAsset, deleteDefaultAsset, checkDefaultAssetUpdate } = require('../controllers/defaultAssetController');

// Player routes
router.post('/players/register', registerPlayer);
router.post('/players/update-status', updatePlayerStatus);
router.get('/players/status/:machineId', getPlayerStatus);
router.get('/players/status', getAllPlayersStatus);
router.get('/players/screen/:billboardId', getPlayerScreenByBillboardId);

// Default asset routes
router.get('/default-asset', getDefaultAsset);
router.get('/default-asset/check-update', checkDefaultAssetUpdate);
router.post('/default-asset', createDefaultAsset);
router.put('/default-asset/:id', updateDefaultAsset);
router.delete('/default-asset/:id', deleteDefaultAsset);

module.exports = router;




