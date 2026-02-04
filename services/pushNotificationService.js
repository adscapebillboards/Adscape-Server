/**
 * Browser Push Notification service for admin app.
 * Sends push notifications on new campaign, campaign approval, billboard approval, and other admin actions.
 * Also supports Expo push tokens (React Native).
 */
const webpush = require('web-push');
const logger = require('../config/logger');

// In-memory store for admin push subscriptions (per browser/device).
const adminSubscriptions = new Set();
// Expo push tokens (React Native): { token, email, platform }
const expoTokens = new Map();

let vapidKeys = null;

function getVapidKeys() {
  if (vapidKeys) {
    logger.info('Push: Using cached VAPID keys', { source: vapidKeys._source || 'cached' });
    return vapidKeys;
  }
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (publicKey && privateKey) {
    vapidKeys = { publicKey, privateKey, _source: 'env' };
    webpush.setVapidDetails(
      'mailto:admin@billboardhub.com',
      publicKey,
      privateKey
    );
    logger.info('Push: VAPID keys loaded from env', { publicKeyLength: publicKey.length });
    return vapidKeys;
  }
  vapidKeys = webpush.generateVAPIDKeys();
  vapidKeys._source = 'auto-generated';
  webpush.setVapidDetails(
    'mailto:admin@billboardhub.com',
    vapidKeys.publicKey,
    vapidKeys.privateKey
  );
  logger.info('Push: VAPID keys auto-generated. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in production.');
  return vapidKeys;
}

/**
 * Get public VAPID key for client subscription.
 */
function getPublicKey() {
  return getVapidKeys().publicKey;
}

/**
 * Add an admin push subscription (from POST body).
 * @param {object} subscription - PushSubscription JSON object (endpoint, keys)
 */
function addSubscription(subscription) {
  if (!subscription || !subscription.endpoint) {
    logger.warn('Push: addSubscription skipped', { hasSubscription: !!subscription, hasEndpoint: !!subscription?.endpoint });
    return;
  }
  adminSubscriptions.add(JSON.stringify(subscription));
  logger.info('Push: admin subscription added', {
    total: adminSubscriptions.size,
    endpointPreview: subscription.endpoint.slice(0, 50) + '...',
  });
}

/**
 * Remove a subscription (e.g. on 410/404 from webpush).
 */
function removeSubscription(subscription) {
  if (!subscription || !subscription.endpoint) return;
  try {
    const target = subscription.endpoint;
    for (const str of adminSubscriptions) {
      try {
        const parsed = JSON.parse(str);
        if (parsed.endpoint === target) {
          adminSubscriptions.delete(str);
          return;
        }
      } catch (e) { /* skip */ }
    }
  } catch (e) {
    // ignore
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
 * Send push notification to all admin subscribers.
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {string} [url] - Optional URL to open on click (e.g. /#/admin or /#/bookings)
 */
async function notifyAdmin(title, body, url) {
  logger.info('Push: notifyAdmin called', { title, body: (body || '').slice(0, 80), url });
  getVapidKeys();
  const payload = JSON.stringify({
    title: title || 'BillboardHub Admin',
    body: body || '',
    url: url || '/#/admin',
    icon: '/icon-192.png'
  });

  const subs = Array.from(adminSubscriptions).map((s) => {
    try {
      return JSON.parse(s);
    } catch (e) {
      logger.warn('Push: failed to parse stored subscription', { error: e.message });
      return null;
    }
  }).filter(Boolean);

  if (subs.length === 0) {
    logger.info('Push: no admin subscriptions to notify (admins must enable notifications on /#/admin)');
    return;
  }

  logger.info('Push: sending to subscribers', { count: subs.length, title });

  const options = {
    TTL: 60 * 60 * 24,
    contentEncoding: 'aes128gcm'
  };

  const results = await Promise.allSettled(
    subs.map(async (sub, index) => {
      try {
        await webpush.sendNotification(sub, payload, options);
        logger.info('Push: sent OK', { index, endpointPreview: sub.endpoint?.slice(0, 40) + '...' });
        return { ok: true };
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          removeSubscription(sub);
          logger.warn('Push: subscription removed (stale)', { statusCode: err.statusCode, index });
        } else {
          logger.warn('Push send failed', {
            index,
            statusCode: err.statusCode,
            message: err.message,
            body: err.body,
          });
        }
        throw err;
      }
    })
  );

  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed > 0) {
    logger.info('Push: notifyAdmin done', { total: subs.length, success: subs.length - failed, failed });
  } else {
    logger.info('Push: notified all admins', { count: subs.length });
  }

  // Also send to Expo (React Native) tokens
  const expoTokenList = Array.from(expoTokens.keys());
  if (expoTokenList.length > 0) {
    await sendExpoPush(expoTokenList, title, body, { url: url || '' });
    logger.info('Push: sent to Expo devices', { count: expoTokenList.length });
  }
}

module.exports = {
  getPublicKey,
  addSubscription,
  removeSubscription,
  addExpoToken,
  notifyAdmin,
  getVapidKeys
};
