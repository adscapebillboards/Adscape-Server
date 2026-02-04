const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const roleAuth = require('../middleware/roleAuth');
const pushService = require('../services/pushNotificationService');
const logger = require('../config/logger');

// Public: get VAPID public key (needed for client to subscribe)
router.get('/push/vapid-public', (req, res) => {
  try {
    logger.info('Push: GET /api/push/vapid-public', { origin: req.get('origin') });
    const publicKey = pushService.getPublicKey();
    res.json({ publicKey });
  } catch (err) {
    logger.error('Push: Error getting VAPID public key', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Failed to get push config' });
  }
});

// Admin only: save push subscription for this browser
router.post('/push/subscribe', auth, roleAuth(['superadmin']), (req, res) => {
  try {
    const subscription = req.body;
    const user = req.user;
    logger.info('Push: POST /api/push/subscribe', {
      userEmail: user?.email,
      role: user?.role,
      hasEndpoint: !!subscription?.endpoint,
      endpointPreview: subscription?.endpoint ? subscription.endpoint.slice(0, 60) + '...' : null,
    });
    if (!subscription || !subscription.endpoint) {
      logger.warn('Push: Invalid subscription body', { keys: subscription ? Object.keys(subscription) : [] });
      return res.status(400).json({ error: 'Invalid subscription: endpoint required' });
    }
    pushService.addSubscription(subscription);
    logger.info('Push: Subscription saved successfully');
    res.json({ success: true, message: 'Subscription saved' });
  } catch (err) {
    logger.error('Push: Error saving push subscription', {
      error: err.message,
      stack: err.stack,
      userEmail: req.user?.email,
    });
    res.status(500).json({ error: 'Failed to save subscription' });
  }
});

// Admin only: save Expo push token (React Native app)
router.post('/push/subscribe-expo', auth, roleAuth(['superadmin']), (req, res) => {
  try {
    const { token, platform } = req.body;
    const user = req.user;
    logger.info('Push: POST /api/push/subscribe-expo', { userEmail: user?.email, hasToken: !!token, platform });
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Invalid subscription: token required' });
    }
    pushService.addExpoToken(token, user?.email, platform);
    res.json({ success: true, message: 'Expo token saved' });
  } catch (err) {
    logger.error('Push: Error saving Expo token', { error: err.message, userEmail: req.user?.email });
    res.status(500).json({ error: 'Failed to save token' });
  }
});

module.exports = router;
