const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const roleAuth = require('../middleware/roleAuth');
const pushService = require('../services/pushNotificationService');
const logger = require('../config/logger');

// Public: get VAPID public key (stubbed now that we use FCM)
router.get('/push/vapid-public', (req, res) => {
  res.json({ publicKey: 'fcm-enabled' });
});

// Admin: save push subscription for this browser (any authenticated admin user)
router.post('/push/subscribe', auth, async (req, res) => {
  try {
    const subscription = req.body;
    const user = req.user;
    const token = subscription?.token || subscription?.endpoint;

    logger.info('Push: POST /api/push/subscribe', {
      userEmail: user?.email,
      role: user?.role,
      hasToken: !!token,
      tokenPreview: token ? token.slice(0, 60) + '...' : null,
    });

    if (!token) {
      logger.warn('Push: Invalid subscription body, missing token');
      return res.status(400).json({ error: 'Invalid subscription: token required' });
    }
    await pushService.addSubscription(subscription, user?.email);
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

// Admin only: test push notifications
router.get('/push/test', auth, roleAuth(['superadmin']), async (req, res) => {
  try {
    const user = req.user;
    logger.info('Push: GET /api/push/test', { userEmail: user?.email });

    await pushService.notifyAdmin(
      'Test Alert: Push Working!',
      `This is a test push notification sent at ${new Date().toLocaleTimeString()} by ${user?.email}`,
      '/#/admin'
    );

    res.json({ success: true, message: 'Test notification triggered' });
  } catch (err) {
    logger.error('Push: Error triggering test notification', { error: err.message, userEmail: req.user?.email });
    res.status(500).json({ error: 'Failed to trigger test notification' });
  }
});

module.exports = router;
