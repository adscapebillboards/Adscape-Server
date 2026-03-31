const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { getStartOfDayIST, getEndOfDayIST, getCurrentISTTime } = require('./utils/timeUtils');

async function debugCampaign() {
  const campaignId = '0004168f-28a5-417c-b105-90d18d378b5a';
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId }
  });

  if (!campaign) {
    console.log('Campaign not found');
    return;
  }

  console.log('Campaign Status:', campaign.status);
  
  let billboards = campaign.billboards;
  if (typeof billboards === 'string') {
    billboards = JSON.parse(billboards);
  }

  const now = getCurrentISTTime();
  console.log('Current IST Time:', now.toString());

  billboards.forEach((b, i) => {
    console.log(`\nBillboard ${i}:`, b.id);
    console.log('Current Status:', b.status);
    if (b.bookingDetails) {
      console.log('Start Date:', b.bookingDetails.startDate);
      console.log('End Date:', b.bookingDetails.endDate);
      
      const start = getStartOfDayIST(b.bookingDetails.startDate);
      const end = getEndOfDayIST(b.bookingDetails.endDate);
      
      console.log('Start of Day IST:', start.toString());
      console.log('End of Day IST:', end.toString());
      console.log('Now < Start:', now < start);
      console.log('Now >= Start:', now >= start);
      console.log('Now <= End:', now <= end);
    } else {
      console.log('No booking details');
    }
  });

  await prisma.$disconnect();
}

debugCampaign();
