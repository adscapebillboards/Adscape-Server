const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { getStartOfDayIST, getEndOfDayIST, getCurrentISTTime } = require('./utils/timeUtils');

async function findLatestCampaign() {
  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10
  });

  const now = getCurrentISTTime();
  console.log('--- LATEST CAMPAIGNS ---');
  console.log('Current IST:', now.toString());

  campaigns.forEach((c) => {
    let billboards = c.billboards;
    if (typeof billboards === 'string') billboards = JSON.parse(billboards);
    
    console.log(`\nCAMPAIGN: ${c.id} (${c.status})`);
    if (billboards && billboards.length > 0) {
      billboards.forEach((b) => {
        if (b.bookingDetails) {
          const start = getStartOfDayIST(b.bookingDetails.startDate);
          const end = getEndOfDayIST(b.bookingDetails.endDate);
          console.log(`  Billboard ${b.id}: ${b.status} | Dates: ${b.bookingDetails.startDate} to ${b.bookingDetails.endDate}`);
          console.log(`    Meets range? ${now >= start && now <= end}`);
        }
      });
    }
  });

  await prisma.$disconnect();
}

findLatestCampaign();
