const prisma = require('./db/db');

async function testFetch() {
    const screenId = '1772674325105';
    const dateStr = '2026-04-14';
    const scheduleDate = new Date(`${dateStr}T00:00:00.000Z`);

    const billboard = await prisma.billboard.findFirst({
        where: {
            OR: [
                { id: String(screenId) },
                { screen_id: String(screenId) }
            ]
        }
    });

    let schedule = await prisma.dailySchedule.findFirst({
        where: {
            OR: [
                { screenId: String(billboard.id) },
                { screenId: String(billboard.screen_id) }
            ],
            scheduleDate: scheduleDate
        },
        include: { slots: true }
    });

    if (schedule && schedule.slots.length > 0) {
        console.log("SCHEDULE SLOTS:", JSON.stringify(schedule.slots, null, 2));
    }
}

testFetch().catch(console.error).finally(() => prisma.$disconnect());
