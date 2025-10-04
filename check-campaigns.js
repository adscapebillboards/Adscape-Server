const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Check what campaigns exist
async function checkCampaigns() {
  try {
    console.log('🔍 Checking Campaigns in Database...\n');

    const campaigns = await prisma.campaign.findMany({
      orderBy: { createdAt: 'desc' }
    });

    console.log(`Total campaigns found: ${campaigns.length}\n`);

    campaigns.forEach((campaign, index) => {
      console.log(`${index + 1}. Campaign ID: ${campaign.id}`);
      console.log(`   Status: ${campaign.status}`);
      console.log(`   Name: ${campaign.campaignName}`);
      console.log(`   User: ${campaign.userName}`);
      console.log(`   Created: ${campaign.createdAt}`);
      
      let billboards = campaign.billboards;
      if (typeof billboards === 'string') {
        try {
          billboards = JSON.parse(billboards);
        } catch (error) {
          console.log(`   ❌ Error parsing billboards: ${error.message}`);
          billboards = [];
        }
      }
      
      console.log(`   Billboards: ${billboards.length}`);
      if (Array.isArray(billboards)) {
        billboards.forEach((billboard, bIndex) => {
          console.log(`     ${bIndex + 1}. ${billboard.id} - Status: ${billboard.status}`);
        });
      }
      console.log('');
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the check
if (require.main === module) {
  checkCampaigns();
}

