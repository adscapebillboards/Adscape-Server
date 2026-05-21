const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  try {
    const startDate = '2026-04-30';
    const endDate = '2026-05-20';

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    console.log('Start Date:', start.toISOString());
    console.log('End Date:', end.toISOString());

    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    console.log('diffDays:', diffDays);

    const byDay = new Map();
    for (let i = 0; i <= diffDays; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      byDay.set(key, 0);
    }
    console.log('byDay keys:', Array.from(byDay.keys()));
    console.log('Successfully completed date manipulation test!');
  } catch (error) {
    console.error('Test failed with error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

test();
