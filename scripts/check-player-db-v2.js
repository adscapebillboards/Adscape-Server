const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDb() {
    try {
        const screenId = '0449625468';
        console.log(`Checking DB for screenId: ${screenId}`);

        const billboard = await prisma.billboard.findFirst({
            where: {
                OR: [
                    { id: screenId },
                    { screen_id: screenId }
                ]
            }
        });
        if (billboard) {
            console.log('Billboard found:', JSON.stringify({ id: billboard.id, screen_id: billboard.screen_id, name: billboard.name }, null, 2));
        } else {
            console.log('No billboard found for screenId');
        }

        const campaigns = await prisma.campaign.findMany({
            // Let's look at ALL campaigns to see what's going on
        });
        console.log(`Found ${campaigns.length} total campaigns`);

        campaigns.forEach(c => {
            let bbs = c.billboards;
            if (typeof bbs === 'string') {
                try { bbs = JSON.parse(bbs); } catch (e) { bbs = []; }
            }
            if (!Array.isArray(bbs)) bbs = [];

            console.log(`Campaign ${c.id} (${c.campaignName}) has status: ${c.status}. Billboards count: ${bbs.length}`);

            bbs.forEach(b => {
                const bId = b.id || b.billboardId;
                const bScreenId = b.screen_id || b.screenId;
                console.log(`  - Billboard in campaign JSON: id=${bId}, screen_id=${bScreenId}`);
                if (String(bId) === String(screenId) || String(bScreenId) === String(screenId)) {
                    console.log(`    >>> MATCHED!`);
                }
            });
        });

    } catch (err) {
        console.error(err);
    } finally {
        await prisma.$disconnect();
    }
}

checkDb();
