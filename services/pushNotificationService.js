/**
 * Browser Push Notification service for admin app.
 * Sends push notifications using Firebase Cloud Messaging.
 * Also supports Expo push tokens (React Native).
 */
const admin = require('./firebaseAdmin');
const logger = require('../config/logger');
const prisma = require('../db/db');

// Expo push tokens (React Native): { token, email, platform }
const expoTokens = new Map();

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
        keys: {}, // empty json to satisfy schema
        adminEmail: adminEmail || null,
        createdAt: new Date()
      },
      create: {
        endpoint: token,
        keys: {},
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
function addExpoToken(token, email, platform) {
  if (!token) return;
  expoTokens.set(token, { email: email || '', platform: platform || 'android', addedAt: Date.now() });
  logger.info('Push: Expo token added', { total: expoTokens.size, email });
}

/**
 * Send push via Expo Push API.
 */
async function sendExpoPush(tokens, title, body, data) {
  if (!tokens.length) return;
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
          expoTokens.delete(tokens[i]);
        }
      });
    }
  } catch (e) {
    logger.warn('Push: Expo send failed', { message: e.message });
  }
}

/**
 * Send push notification to all admin subscribers via FCM.
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

  if (subs.length > 0) {
    const tokens = subs.map(sub => sub.endpoint).filter(Boolean);
    if (tokens.length > 0) {
      const message = {
        notification: {
          title: title || 'BillboardHub Admin',
          body: body || ''
        },
        data: {
          // Firebase strictly expects string values in data payload
          url: url || '/#/admin'
        },
        tokens: tokens
      };

      try {
        const response = await admin.messaging().sendEachForMulticast(message);
        logger.info('Push: FCM Multicast sent', {
          successCount: response.successCount,
          failureCount: response.failureCount
        });

        // Cleanup stale tokens and log details
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
                tokenPreview: tokens[idx].slice(0, 30)
              });

              // Remove tokens that are no longer valid
              if (
                errorCode === 'messaging/invalid-registration-token' ||
                errorCode === 'messaging/registration-token-not-registered' ||
                errorCode === 'messaging/invalid-argument'
              ) {
                failedTokens.push(tokens[idx]);
              }
            }
          });

          for (const staleToken of failedTokens) {
            await removeSubscription(staleToken);
          }
        }
      } catch (err) {
        logger.error('Push: FCM Multicast failed', { error: err.message });
      }
    }
  } else {
    logger.info('Push: no admin FCM subscriptions to notify');
  }

  // Also send to Expo (React Native) tokens
  const expoTokenList = Array.from(expoTokens.keys());
  if (expoTokenList.length > 0) {
    await sendExpoPush(expoTokenList, title, body, { url: url || '' });
    logger.info('Push: sent to Expo devices', { count: expoTokenList.length });
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
