const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function audit() {
    try {
        const campaigns = await prisma.campaign.findMany({
            where: {
                status: { in: ['ACTIVE', 'LIVE', 'SCHEDULED'] }
            }
        });
        console.log(`Found ${campaigns.length} campaigns`);
        campaigns.forEach(c => {
            console.log(`ID: ${c.id}, Name: ${c.campaignName}, Status: ${c.status}, Start: ${c.startDate.toISOString()}, End: ${c.endDate.toISOString()}`);
        });
    } catch (err) {
        console.error(err);
    } finally {
        await prisma.$disconnect();
    }
}

audit();
