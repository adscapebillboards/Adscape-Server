const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function audit() {
    try {
        const billboard = await prisma.billboard.findFirst({
            where: { screen_id: '0449625468' }
        });

        console.log('Billboard found:', billboard ? { id: billboard.id, screen_id: billboard.screen_id } : 'None');

        const possibleIds = ['0449625468'];
        if (billboard) {
            possibleIds.push(String(billboard.id));
            if (billboard.screen_id) possibleIds.push(String(billboard.screen_id));
        }

        const uniqueIds = [...new Set(possibleIds)];
        console.log('Audit uniqueIds:', uniqueIds);

        const schedules = await prisma.dailySchedule.findMany({
            where: { screenId: { in: uniqueIds } },
            include: { _count: { select: { slots: true } } }
        });

        console.log(`Found ${schedules.length} schedules across these IDs`);
        for (const s of schedules) {
            const campaignSlots = await prisma.dailySlot.count({
                where: { scheduleId: s.id, campaignId: { not: null } }
            });
            console.log(`- Schedule ID: ${s.id}, screenId: ${s.screenId}, date: ${s.scheduleDate.toISOString()}, Total Slots: ${s._count.slots}, Campaign Slots: ${campaignSlots}`);
        }

    } catch (err) {
        console.error(err);
    } finally {
        await prisma.$disconnect();
    }
}

audit();
