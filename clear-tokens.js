const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    await prisma.pushSubscription.deleteMany();
    console.log('Cleared all old push subscriptions!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
