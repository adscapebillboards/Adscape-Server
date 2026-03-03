const admin = require('firebase-admin');
const logger = require('../config/logger');

// Support two methods of loading credentials:
// 1. FIREBASE_SERVICE_ACCOUNT_JSON env var (recommended for Vercel/serverless deployments)
//    Set this to the full JSON string of your service account file.
// 2. Local firebase-service-account.json file (for local development)
try {
    let serviceAccount;

    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        // Vercel / production: credentials stored as an env var
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
        logger.info('Firebase Admin: loading credentials from FIREBASE_SERVICE_ACCOUNT_JSON env var');
    } else {
        // Local development: load from file
        serviceAccount = require('../firebase-service-account.json');
        logger.info('Firebase Admin: loading credentials from firebase-service-account.json file');
    }

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    logger.info('Firebase Admin SDK initialized successfully.');
} catch (error) {
    logger.error('Failed to initialize Firebase Admin SDK', { error: error.message });
    logger.error('Push notifications will NOT work until Firebase Admin is configured.');
    logger.error('Set FIREBASE_SERVICE_ACCOUNT_JSON env var on Vercel with the service account JSON string.');
}

module.exports = admin;
