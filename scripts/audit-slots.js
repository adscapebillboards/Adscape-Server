const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkSlots() {
    try {
        const campaignId = 'ece5b175-be27-4d41-b4d8-5fee1ea39d8a';

        const genSlots = await prisma.generatedSlot.findMany({
            where: { campaignId: campaignId }
        });
        console.log(`GeneratedSlots count: ${genSlots.length}`);
        if (genSlots.length > 0) {
            console.log('Sample GeneratedSlot assetUrl:', genSlots[0].assetUrl);
        }

        const dailySlots = await prisma.dailySlot.findMany({
            where: { campaignId: campaignId }
        });
        console.log(`DailySlots count: ${dailySlots.length}`);
        if (dailySlots.length > 0) {
            console.log('Sample DailySlot assetUrl:', dailySlots[0].assetUrl);
        }

    } catch (err) {
        console.error(err);
    } finally {
        await prisma.$disconnect();
    }
}

checkSlots();
