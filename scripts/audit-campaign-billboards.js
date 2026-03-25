const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function audit() {
    try {
        const campaignId = 'ece5b175-be27-4d41-b4d8-5fee1ea39d8a';
        const c = await prisma.campaign.findUnique({
            where: { id: campaignId }
        });

        console.log(`Campaign: ${c.campaignName}`);
        console.log(`Status: ${c.status}`);
        console.log(`Start: ${c.startDate.toISOString()}`);
        console.log('Billboards Field Content:');
        console.log(JSON.stringify(c.billboards, null, 2));

        const billboardIds = ['0449625468', '1772674325105'];
        const bbs = typeof c.billboards === 'string' ? JSON.parse(c.billboards) : c.billboards;

        const matched = bbs.some(b => {
            const bId = String(b.id || b.billboardId || "");
            const bSid = String(b.screen_id || b.screenId || "");
            const match = billboardIds.includes(bId) || billboardIds.includes(bSid);
            console.log(`Checking billboard: ID=${bId}, SID=${bSid} -> Match: ${match}`);
            return match;
        });

        console.log(`FINAL MATCH RESULT: ${matched}`);

    } catch (err) {
        console.error(err);
    } finally {
        await prisma.$disconnect();
    }
}

audit();
