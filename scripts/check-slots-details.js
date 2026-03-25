const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkSlotsData() {
    try {
        const scheduleId = 'ca522931-8105-40eb-9ff5-27ad312fa5eb';
        const slots = await prisma.dailySlot.findMany({
            where: { scheduleId: scheduleId }
        });

        console.log(`Checking ${slots.length} slots for schedule ${scheduleId}`);
        const campaignsInSlots = [...new Set(slots.map(s => s.campaignId))];
        console.log('Unique campaignIds in slots:', campaignsInSlots);

        const targetCampaignId = 'ece5b175-be27-4d41-b4d8-5fee1ea39d8a';
        const matchCount = slots.filter(s => s.campaignId === targetCampaignId).length;
        console.log(`Slots matching target campaign ${targetCampaignId}: ${matchCount}`);

    } catch (err) {
        console.error(err);
    } finally {
        await prisma.$disconnect();
    }
}

checkSlotsData();
