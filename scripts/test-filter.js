const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const getStartOfDayIST = (dateStr) => {
    const d = new Date(`${dateStr}T00:00:00+05:30`);
    return d;
};

async function testFilter() {
    try {
        const todayIST = '2026-03-06';
        const dayStart = getStartOfDayIST(todayIST);
        const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

        console.log('dayStart:', dayStart.toISOString());
        console.log('dayEnd:', dayEnd.toISOString());

        const campaigns = await prisma.campaign.findMany({
            where: {
                status: { in: ['ACTIVE', 'LIVE', 'SCHEDULED'] }
            }
        });

        console.log(`Found ${campaigns.length} total campaigns (any date)`);

        campaigns.forEach(c => {
            const matches = (c.startDate <= dayEnd && c.endDate >= dayStart);
            console.log(`Campaign ${c.id}: status=${c.status}, start=${c.startDate.toISOString()}, end=${c.endDate.toISOString()}, matches=${matches}`);
        });

    } catch (err) {
        console.error(err);
    } finally {
        await prisma.$disconnect();
    }
}

testFilter();
