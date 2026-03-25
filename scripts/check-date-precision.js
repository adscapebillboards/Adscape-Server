const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDates() {
    try {
        const c = await prisma.campaign.findUnique({
            where: { id: 'ece5b175-be27-4d41-b4d8-5fee1ea39d8a' }
        });

        console.log('Campaign ID:', c.id);
        console.log('Start Date:', c.startDate.toISOString(), 'ms:', c.startDate.getTime());
        console.log('End Date:', c.endDate.toISOString(), 'ms:', c.endDate.getTime());

        const todayIST = '2026-03-06';
        const dstart = new Date(`${todayIST}T00:00:00+05:30`);
        const dend = new Date(dstart.getTime() + 24 * 60 * 60 * 1000);

        console.log('dayStart:', dstart.toISOString(), 'ms:', dstart.getTime());
        console.log('dayEnd:', dend.toISOString(), 'ms:', dend.getTime());

        console.log('Matches Start (c.startDate <= dend):', c.startDate.getTime() <= dend.getTime());
        console.log('Matches End (c.endDate >= dstart):', c.endDate.getTime() >= dstart.getTime());

    } catch (err) {
        console.error(err);
    } finally {
        await prisma.$disconnect();
    }
}

checkDates();
