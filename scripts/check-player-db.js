const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDb() {
    try {
        const screenId = '0449625468';
        console.log(`Checking DB for screenId: ${screenId}`);

        const billboard = await prisma.billboard.findFirst({
            where: {
                OR: [
                    { id: screenId },
                    { screen_id: screenId }
                ]
            }
        });
        console.log('Billboard found:', JSON.stringify(billboard, null, 2));

        const campaigns = await prisma.campaign.findMany({
            where: {
                status: { in: ['ACTIVE', 'LIVE', 'SCHEDULED'] }
            }
        });
        console.log(`Found ${campaigns.length} active/live/scheduled campaigns`);

        campaigns.forEach(c => {
            const bbs = typeof c.billboards === 'string' ? JSON.parse(c.billboards) : c.billboards;
            const match = bbs.find(b => String(b.id) === String(screenId) || String(b.screen_id) === String(screenId));
            if (match) {
                console.log(`MATCH found in campaign: ${c.id} (${c.campaignName})`);
                console.log('Billboard in campaign:', JSON.stringify(match, null, 2));
            }
        });

        const dailySchedules = await prisma.dailySchedule.findMany({
            where: { screenId: screenId }
        });
        console.log(`DailySchedules for this screen:`, JSON.stringify(dailySchedules, null, 2));

        if (dailySchedules.length > 0) {
            const slots = await prisma.dailySlot.findMany({
                where: { scheduleId: dailySchedules[0].id }
            });
            console.log(`Slots for schedule ${dailySchedules[0].id}:`, JSON.stringify(slots, null, 2));
        }

    } catch (err) {
        console.error(err);
    } finally {
        await prisma.$disconnect();
    }
}

checkDb();
