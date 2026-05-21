const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  try {
    const publisherEmail = 'adscape.co.in@gmail.com'; // Let's check a standard publisher email
    
    // Let's find a real publisher first to get a valid email
    const pub = await prisma.publisher.findFirst();
    if (!pub) {
      console.log('No publishers found in the database!');
      return;
    }
    console.log('Testing with publisher:', pub.email);
    const email = pub.email;

    const publisherBillboards = await prisma.billboard.findMany({
      where: { userId: email },
      select: { id: true }
    });
    const billboardIds = publisherBillboards.map(bb => bb.id);
    console.log('Billboard IDs:', billboardIds);

    const startDate = '2026-04-30';
    const endDate = '2026-05-20';

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const campaigns = await prisma.campaign.findMany({
      where: {
        createdAt: {
          gte: start,
          lte: end,
        },
      },
      select: { createdAt: true, totalAmount: true, billboards: true },
      orderBy: { createdAt: 'asc' },
    });

    console.log(`Found ${campaigns.length} campaigns in this range.`);
    
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

    for (const c of campaigns) {
      let billboards = c.billboards;
      if (typeof billboards === 'string') {
        try {
          billboards = JSON.parse(billboards);
        } catch (e) {
          console.log('Failed parsing billboards:', c.billboards);
          continue;
        }
      }

      if (Array.isArray(billboards)) {
        for (const billboard of billboards) {
          if (billboardIds.includes(billboard.id)) {
            const key = (c.createdAt || new Date()).toISOString().slice(0, 10);
            const amount = Number(c.totalAmount || 0);
            if (byDay.has(key)) {
              byDay.set(key, (byDay.get(key) || 0) + amount);
              console.log(`Added campaign amount ${amount} for key ${key}`);
            } else {
              console.log(`Key ${key} not found in byDay Map!`);
            }
            break;
          }
        }
      }
    }

    const series = Array.from(byDay.entries()).map(([iso, revenue]) => {
      const d = new Date(iso);
      return {
        name: d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }),
        revenue: Math.max(0, Math.round(revenue))
      };
    });

    console.log('Resulting Series:', series);

  } catch (error) {
    console.error('Test failed with error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

test();
