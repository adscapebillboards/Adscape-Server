const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function debugCampaign() {
  try {
    console.log('🔍 Debugging campaign email issue...\n');

    const campaignId = 'be002c75-22a4-4b0e-ab63-7a184cc89e96';

    // Fetch the campaign from database
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId }
    });

    if (!campaign) {
      console.log('❌ Campaign not found in database');
      return;
    }

    console.log('📋 Campaign data from database:');
    console.log(JSON.stringify(campaign, null, 2));

    console.log('\n🔍 Key fields check:');
    console.log(`- ID: ${campaign.id}`);
    console.log(`- userName: ${campaign.userName || 'MISSING'}`);
    console.log(`- campaignName: ${campaign.campaignName || 'MISSING'}`);
    console.log(`- status: ${campaign.status}`);
    console.log(`- totalAmount: ${campaign.totalAmount}`);
    console.log(`- has billboards: ${!!campaign.billboards}`);

    if (campaign.billboards) {
      let billboards = campaign.billboards;
      if (typeof billboards === 'string') {
        billboards = JSON.parse(billboards);
      }
      console.log(`- billboards count: ${billboards.length}`);
      console.log('- Billboard statuses:');
      billboards.forEach((billboard, index) => {
        console.log(`  ${index + 1}. ID: ${billboard.id}, Status: ${billboard.status}`);
      });
    }

    // Test email notification with this campaign data
    console.log('\n📧 Testing email notification with this campaign data...');
    
    const EmailService = require('./services/emailService');
    
    // Simulate billboard approval
    const billboardData = {
      id: '1748747072382',
      location: 'Test Location',
      city: 'Test City',
      pricePerDay: 500,
      totalPrice: 3500,
      bookingDetails: {
        startDate: new Date(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    };

    await EmailService.notifyBillboardApproved(campaign, billboardData);

  } catch (error) {
    console.error('❌ Error debugging campaign:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the debug
debugCampaign()
  .then(() => {
    console.log('\n🎯 Campaign debug complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Campaign debug failed:', error);
    process.exit(1);
  });

