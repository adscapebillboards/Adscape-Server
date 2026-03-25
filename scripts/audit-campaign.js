const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function audit() {
    try {
        const campaigns = await prisma.campaign.findMany({
            where: { id: 'ece5b175-be27-4d41-b4d8-5fee1ea39d8a' }
        });
        console.log(JSON.stringify(campaigns, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await prisma.$disconnect();
    }
}

audit();
