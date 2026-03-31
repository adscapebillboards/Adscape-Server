/**
 * Browser Push Notification service for admin app.
 * Sends push notifications using Firebase Cloud Messaging.
 * Also supports Expo push tokens (React Native).
 */
const admin = require('./firebaseAdmin');
const logger = require('../config/logger');
const prisma = require('../db/db');


/**
 * Add an admin push subscription (FCM token).
 * @param {object} subscription - Object containing fcm token (e.g., {token: '...'} or {endpoint: '...'})
 * @param {string} [adminEmail] - Optional admin email
 */
async function addSubscription(subscription, adminEmail) {
  const token = subscription?.token || subscription?.endpoint;
  if (!token) {
    logger.warn('Push: addSubscription skipped, no token provided', { subscription });
    return;
  }

  try {
    await prisma.pushSubscription.upsert({
      where: { endpoint: token },
      update: {
        keys: { platform: 'web', type: 'fcm' },
        adminEmail: adminEmail || null,
        createdAt: new Date()
      },
      create: {
        endpoint: token,
        keys: { platform: 'web', type: 'fcm' },
        adminEmail: adminEmail || null
      }
    });

    logger.info('Push: admin subscription saved to DB', {
      tokenPreview: token.slice(0, 50) + '...',
      adminEmail
    });
  } catch (err) {
    logger.error('Push: failed to save subscription to DB', { error: err.message });
  }
}

/**
 * Remove a subscription.
 */
async function removeSubscription(token) {
  if (!token) return;
  try {
    await prisma.pushSubscription.deleteMany({
      where: { endpoint: token }
    });
    logger.info('Push: removed stale subscription from DB', {
      tokenPreview: token.slice(0, 50) + '...'
    });
  } catch (err) {
    logger.error('Push: failed to remove stale subscription from DB', { error: err.message });
  }
}

/**
 * Add Expo push token (React Native).
 */
async function addExpoToken(token, email, platform) {
  if (!token) return;
  try {
    await prisma.pushSubscription.upsert({
      where: { endpoint: token },
      update: {
        keys: { platform: platform || 'android', type: 'expo' },
        adminEmail: email || null,
        createdAt: new Date()
      },
      create: {
        endpoint: token,
        keys: { platform: platform || 'android', type: 'expo' },
        adminEmail: email || null
      }
    });
    logger.info('Push: Expo token saved to DB', { tokenPreview: token.slice(0, 30), email });
  } catch (err) {
    logger.error('Push: failed to save Expo token to DB', { error: err.message });
  }
}

/**
 * Send push via Expo Push API.
 */
async function sendExpoPush(tokens, title, body, data) {
  if (!tokens || !tokens.length) return;
  const messages = tokens.map((t) => ({
    to: t,
    sound: 'default',
    title: title || 'BillboardHub Admin',
    body: body || '',
    data: data || {},
  }));
  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });
    const result = await res.json();
    if (result.data) {
      result.data.forEach((r, i) => {
        if (r.status === 'error' && r.details?.error === 'DeviceNotRegistered') {
          removeSubscription(tokens[i]);
        }
      });
    }
  } catch (e) {
    logger.warn('Push: Expo send failed', { message: e.message });
  }
}

/**
 * Send push notification to all admin subscribers.
 */
async function notifyAdmin(title, body, url) {
  logger.info('Push: notifyAdmin called', { title, body: (body || '').slice(0, 80), url });

  let subs = [];
  try {
    subs = await prisma.pushSubscription.findMany();
  } catch (err) {
    logger.error('Push: failed to fetch admin subscriptions from DB', { error: err.message });
    return;
  }

  const fcmTokens = [];
  const expoTokensList = [];

  subs.forEach(sub => {
    const token = sub.endpoint;
    if (!token) return;
    if (token.startsWith('ExponentPushToken') || token.startsWith('ExpoPushToken')) {
      expoTokensList.push(token);
    } else {
      fcmTokens.push(token);
    }
  });

  if (fcmTokens.length > 0) {
    const message = {
      notification: {
        title: String(title || 'BillboardHub Admin'),
        body: String(body || '')
      },
      data: {
        title: String(title || 'BillboardHub Admin'),
        body: String(body || ''),
        url: String(url || '/#/admin'),
        tag: 'adscape-push'
      },
      android: { priority: 'high' },
      webpush: { headers: { Urgency: 'high' } },
      tokens: fcmTokens
    };

    try {
      if (admin && admin.messaging) {
        const response = await admin.messaging().sendEachForMulticast(message);
        logger.info('Push: FCM Multicast sent', {
          successCount: response.successCount,
          failureCount: response.failureCount
        });

        if (response.failureCount > 0) {
          const failedTokens = [];
          response.responses.forEach((resp, idx) => {
            if (!resp.success) {
              const errorCode = resp.error?.code;
              const errorMessage = resp.error?.message;

              logger.warn('Push: Token rejected by Firebase details', {
                index: idx,
                errorCode,
                errorMessage,
                tokenPreview: fcmTokens[idx].slice(0, 30)
              });

              if (
                errorCode === 'messaging/invalid-registration-token' ||
                errorCode === 'messaging/registration-token-not-registered' ||
                errorCode === 'messaging/invalid-argument' ||
                errorCode === 'messaging/mismatched-credential'
              ) {
                failedTokens.push(fcmTokens[idx]);
              }
            }
          });

          for (const staleToken of failedTokens) {
            await removeSubscription(staleToken);
          }
        }
      } else {
        logger.warn('Push: Firebase Admin SDK not properly initialized.');
      }
    } catch (err) {
      logger.error('Push: FCM Multicast failed', { error: err.message });
    }
  } else {
    logger.info('Push: no admin FCM subscriptions to notify');
  }

  // Handle Expo tokens
  if (expoTokensList.length > 0) {
    await sendExpoPush(expoTokensList, title, body, { url: url || '' });
    logger.info('Push: sent to Expo devices', { count: expoTokensList.length });
  }
}

// Dummy backward compatible exports
function getPublicKey() { return null; }
function getVapidKeys() { return null; }

module.exports = {
  getPublicKey,
  addSubscription,
  removeSubscription,
  addExpoToken,
  notifyAdmin,
  getVapidKeys
};
