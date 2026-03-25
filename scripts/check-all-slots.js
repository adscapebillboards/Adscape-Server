const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkSlots() {
    try {
        const screenId = '0449625468';
        const schedules = await prisma.dailySchedule.findMany({
            where: { screenId: screenId }
        });

        console.log(`Found ${schedules.length} schedules for this screen`);

        for (const s of schedules) {
            const slots = await prisma.dailySlot.findMany({
                where: { scheduleId: s.id }
            });
            console.log(`Schedule id=${s.id} date=${s.scheduleDate.toISOString()} has ${slots.length} slots`);
            if (slots.length > 0) {
                console.log('  Slots sample (assetUrls):', slots.map(sl => sl.assetUrl).slice(0, 3));
            }
        }

    } catch (err) {
        console.error(err);
    } finally {
        await prisma.$disconnect();
    }
}

checkSlots();
