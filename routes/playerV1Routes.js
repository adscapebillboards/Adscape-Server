const express = require('express');
const router = express.Router();
const playerV1Controller = require('../controllers/playerV1Controller');
const jwt = require('jsonwebtoken');

// Simple JWT Auth Middleware
const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader) {
        const token = authHeader.split(' ')[1];
        jwt.verify(token, process.env.JWT_SECRET || 'adscape_secret_key_123', (err, user) => {
            if (err) return res.sendStatus(403);
            req.user = user;
            next();
        });
    } else {
        res.sendStatus(401);
    }
};

router.post('/players/register', playerV1Controller.register);
router.post('/players/pair', playerV1Controller.pair);

// Protected routes
router.get('/schedules/:screenId', authMiddleware, playerV1Controller.getSchedule);
router.post('/telemetry', authMiddleware, playerV1Controller.telemetry);
router.get('/health', playerV1Controller.health);

module.exports = router;
