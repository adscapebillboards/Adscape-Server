const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function forceUpdate() {
    try {
        const campaignId = 'ece5b175-be27-4d41-b4d8-5fee1ea39d8a';
        const today = new Date('2026-03-05T00:00:00.000Z');

        console.log(`Forcing update for campaign ${campaignId} to start ${today.toISOString()} with status LIVE...`);

        const res = await prisma.campaign.update({
            where: { id: campaignId },
            data: {
                startDate: today,
                status: 'LIVE' // Try LIVE to ensure it bypasses any SCHEDULED logic
            }
        });

        console.log('UPDATE SUCCESS:', JSON.stringify(res, null, 2));

        // Clear schedules again just in case
        await prisma.dailySlot.deleteMany({
            where: { schedule: { screenId: { in: ['0449625468', '1772674325105'] } } }
        });
        await prisma.dailySchedule.deleteMany({
            where: { screenId: { in: ['0449625468', '1772674325105'] } }
        });
        console.log('Cleared schedules for regeneration.');

    } catch (e) {
        console.error('UPDATE ERROR:', e);
    } finally {
        await prisma.$disconnect();
    }
}

forceUpdate();
