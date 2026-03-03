const admin = require('firebase-admin');
const path = require('path');
const logger = require('../config/logger');

try {
    const serviceAccount = require('../firebase-service-account.json');
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    logger.info('Firebase Admin SDK initialized successfully.');
} catch (error) {
    logger.error('Failed to initialize Firebase Admin SDK', { error: error.message });
}

module.exports = admin;
