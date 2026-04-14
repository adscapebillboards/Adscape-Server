const prisma = require('./db/db');

async function testFetch() {
    console.log("Fetching for 1772674325105 / e510408791c7475d");
    const screenId = '1772674325105';
    // const screenId = 'e510408791c7475d';
    const dateStr = '2026-04-14';
    const scheduleDate = new Date(`${dateStr}T00:00:00.000Z`);
    const dayStart = new Date(`${dateStr}T00:00:00.000Z`);
    const dayEnd = new Date(`${dateStr}T23:59:59.999Z`);

    const billboard = await prisma.billboard.findFirst({
        where: {
            OR: [
                { id: String(screenId) },
                { screen_id: String(screenId) }
            ]
        }
    });

    if (!billboard) {
        console.log("Billboard not found");
        return;
    }

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

    if (!schedule || !schedule.slots.length) {
        console.log("No schedule with slots. Checking generated slots...");
        const generatedSlots = await prisma.generatedSlot.findMany({
            where: {
                OR: [
                    { billboardId: String(billboard.id) },
                    { billboardId: String(billboard.screen_id || '') },
                    { screenId: String(billboard.id) },
                    { screenId: String(billboard.screen_id || '') }
                ],
                startDate: { lte: dayEnd },
                endDate: { gte: dayStart }
            },
            orderBy: [
                { startDate: 'asc' },
                { slotNumber: 'asc' }
            ]
        });

        if (generatedSlots.length > 0) {
            console.log("Found generated slots:", generatedSlots.length);
            console.log(JSON.stringify(generatedSlots[0]));
            return;
        } else {
            console.log("NO GENERATED SLOTS FOUND. Querying active campaigns...");
            
            const activeCampaigns = await prisma.campaign.findMany({
                where: {
                    status: { in: ['ACTIVE', 'LIVE', 'SCHEDULED'] },
                    startDate: { lte: dayEnd },
                    endDate: { gte: dayStart }
                }
            });
            console.log("Campaigns:", activeCampaigns.length);
        }
    } else {
        console.log("Found schedule slots:", schedule.slots.length);
    }
}

testFetch().catch(console.error).finally(() => prisma.$disconnect());
