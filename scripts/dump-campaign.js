const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDb() {
    try {
        const campaignId = 'ece5b175-be27-4d41-b4d8-5fee1ea39d8a';
        const campaign = await prisma.campaign.findUnique({
            where: { id: campaignId }
        });

        if (!campaign) {
            console.log('Campaign not found');
            return;
        }

        console.log('Campaign Status:', campaign.status);
        let bbs = campaign.billboards;
        if (typeof bbs === 'string') {
            bbs = JSON.parse(bbs);
        }

        console.log('Billboards JSON (Full):');
        console.log(JSON.stringify(bbs, null, 2));

    } catch (err) {
        console.error(err);
    } finally {
        await prisma.$disconnect();
    }
}

checkDb();
