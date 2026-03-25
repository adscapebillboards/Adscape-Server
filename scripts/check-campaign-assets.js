const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDb() {
    try {
        const screenId = '0449625468';
        console.log(`Checking DB for screenId: ${screenId}`);

        const billboard = await prisma.billboard.findFirst({
            where: {
                OR: [
                    { id: String(screenId) },
                    { screen_id: String(screenId) }
                ]
            }
        });
        if (billboard) {
            console.log('Billboard found in DB:', JSON.stringify({
                id: billboard.id,
                screen_id: billboard.screen_id,
                name: billboard.name,
                files: billboard.files,
                images: billboard.images
            }, null, 2));
        }

        const campaigns = await prisma.campaign.findMany({
            where: { status: 'SCHEDULED' } // We know it is scheduled
        });

        campaigns.forEach(c => {
            let bbs = c.billboards;
            if (typeof bbs === 'string') {
                try { bbs = JSON.parse(bbs); } catch (e) { bbs = []; }
            }
            if (!Array.isArray(bbs)) bbs = [];

            console.log(`Campaign ${c.id} status: ${c.status}`);

            bbs.forEach(b => {
                console.log(`  - Billboard in JSON:`, JSON.stringify(b, null, 2));
            });
        });

    } catch (err) {
        console.error(err);
    } finally {
        await prisma.$disconnect();
    }
}

checkDb();
