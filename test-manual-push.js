/**
 * Quick script to manually send a push notification to all subscribed admins.
 * Run me with: node test-manual-push.js
 */
require('dotenv').config(); // Load .env file
const pushService = require('./services/pushNotificationService');
const prisma = require('./db/db');

async function testPush() {
    console.log('Testing Admin Push Notification...', {
        hasVapidPublic: !!process.env.VAPID_PUBLIC_KEY,
        hasVapidPrivate: !!process.env.VAPID_PRIVATE_KEY
    });

    try {
        // Create a test campaign purely for context, or just send a dummy notification
        const testTitle = 'Test Alert: Push Working!';
        const testBody = `This is a test push notification sent at ${new Date().toLocaleTimeString()}`;
        const targetUrl = '/#/admin'; // Where to click 

        // Send to all stored admin subscriptions
        await pushService.notifyAdmin(testTitle, testBody, targetUrl);

        console.log('Test push trigger complete. Check your browser!');
    } catch (error) {
        console.error('Error in test script:', error);
    } finally {
        await prisma.$disconnect();
        process.exit(0);
    }
}

testPush();
