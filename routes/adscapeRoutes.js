const express = require('express');
const router = express.Router();
const adscapeController = require('../controllers/adscapeController');

// Register or update an Adscape player
router.post('/adscape/register', adscapeController.registerPlayer);

// Get a specific player by screenId
router.get('/adscape/player/:screenId', adscapeController.getPlayer);

// Get all players
router.get('/adscape/players', adscapeController.getAllPlayers);

// Update player flow type
router.put('/adscape/player/:screenId/flow-type', adscapeController.updateFlowType);

// Delete a player
router.delete('/adscape/player/:screenId', adscapeController.deletePlayer);

module.exports = router;
