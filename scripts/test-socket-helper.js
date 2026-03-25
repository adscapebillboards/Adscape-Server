const { getPlaylistForScreen } = require('../utils/socketHelpers');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
    try {
        const screenId = '0449625468';
        console.log(`Testing getPlaylistForScreen for ${screenId}`);
        const result = await getPlaylistForScreen(screenId);
        console.log('Result:', JSON.stringify(result, null, 2));
    } catch (err) {
        console.error('Test Error:', err);
    } finally {
        await prisma.$disconnect();
    }
}

test();
