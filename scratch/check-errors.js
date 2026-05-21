const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  try {
    console.log('Querying the 10 most recent unhandled server errors...');
    const errors = await prisma.errorLog.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' }
    });

    console.log(`Found ${errors.length} error logs.`);
    for (const err of errors) {
      console.log('==================================================');
      console.log(`Time: ${err.createdAt}`);
      console.log(`Method/Path: ${err.method} ${err.path}`);
      console.log(`Status: ${err.statusCode}`);
      console.log(`Message: ${err.message}`);
      if (err.stack) {
        console.log(`Stack:\n${err.stack.slice(0, 300)}...`);
      }
    }
  } catch (err) {
    console.error('Failed to query error logs:', err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
