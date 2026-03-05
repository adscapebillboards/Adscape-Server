const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const b = await prisma.billboard.findMany();
    b.forEach(x => console.log(`Name: ${x.name} | Screen: ${x.screen_id} | Images: ${x.images ? x.images.length : 0}`));
}

main().finally(() => prisma.$disconnect());
