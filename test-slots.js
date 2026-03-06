const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const slots = await prisma.generatedSlot.findMany({
        orderBy: { updated_at: 'desc' },
        select: { screenId: true, startDate: true, assetUrl: true },
        take: 10
    });
    console.log("Recent slots:");
    console.log(slots);
}
main().finally(() => prisma.$disconnect());
