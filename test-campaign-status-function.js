const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Test the updateCampaignStatusBasedOnBillboards function directly
async function testCampaignStatusFunction() {
  try {
    console.log('🧪 Testing Campaign Status Function Directly...\n');

    // Get the first campaign with multiple billboards
    const campaigns = await prisma.campaign.findMany({
      orderBy: { createdAt: 'desc' }
    });

    let campaignId = null;
    for (const campaign of campaigns) {
      let billboards = campaign.billboards;
      if (typeof billboards === 'string') {
        try {
          billboards = JSON.parse(billboards);
        } catch (error) {
          continue;
        }
      }
      
      if (Array.isArray(billboards) && billboards.length > 1) {
        campaignId = campaign.id;
        break;
      }
    }

    if (!campaignId) {
      console.log('❌ No campaign with multiple billboards found');
      return;
    }
    
    // 1. Get the campaign
    console.log(`1. Getting campaign: ${campaignId}`);
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId }
    });

    if (!campaign) {
      console.log('❌ Campaign not found');
      return;
    }

    console.log(`   Current Status: ${campaign.status}`);
    console.log(`   User: ${campaign.userName}`);

    // 2. Parse billboards
    let billboards = campaign.billboards;
    if (typeof billboards === 'string') {
      try {
        billboards = JSON.parse(billboards);
      } catch (error) {
        console.log(`❌ Error parsing billboards: ${error.message}`);
        return;
      }
    }

    console.log(`   Billboards: ${billboards.length}`);
    billboards.forEach((billboard, index) => {
      console.log(`     ${index + 1}. ${billboard.id} - Status: ${billboard.status}`);
    });

    // 3. Test the exact logic from updateCampaignStatusBasedOnBillboards
    console.log('\n2. Testing updateCampaignStatusBasedOnBillboards logic...');
    
    // Copy the exact logic from the function
    const allBillboardsApproved = billboards.every(b => b.status?.toUpperCase() === 'APPROVED');
    console.log(`   All billboards approved (case-insensitive): ${allBillboardsApproved}`);
    
    // Log each billboard's status for debugging
    billboards.forEach((billboard, index) => {
      const status = billboard.status || 'NO_STATUS';
      const upperStatus = status.toUpperCase();
      const isApproved = upperStatus === 'APPROVED';
      
      console.log(`   Billboard ${index + 1}: ID=${billboard.id}, Status="${status}", toUpperCase()="${upperStatus}", === 'APPROVED': ${isApproved}`);
    });

    // 4. Test the actual function call
    console.log('\n3. Testing actual function call...');
    
    try {
      // Import the function
      const { updateCampaignStatusBasedOnBillboards } = require('./controllers/campaignApiController');
      
      console.log('   Calling updateCampaignStatusBasedOnBillboards...');
      const result = await updateCampaignStatusBasedOnBillboards(campaignId, billboards);
      console.log(`   Function returned: ${result}`);
      
      // Verify the result
      const verification = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { status: true }
      });
      console.log(`   Campaign status after function call: ${verification?.status}`);
      
    } catch (error) {
      console.log(`   ❌ Function call failed: ${error.message}`);
      
      // If import fails, test the logic manually
      console.log('\n4. Testing logic manually...');
      
      if (allBillboardsApproved) {
        console.log('   All billboards are approved, updating campaign status to APPROVED...');
        
        try {
          const updatedCampaign = await prisma.campaign.update({
            where: { id: campaignId },
            data: { status: 'APPROVED' }
          });
          
          console.log(`   ✅ Campaign status updated to: ${updatedCampaign.status}`);
        } catch (updateError) {
          console.log(`   ❌ Update failed: ${updateError.message}`);
        }
      } else {
        console.log('   Not all billboards are approved, setting campaign status to pending...');
        
        try {
          const updatedCampaign = await prisma.campaign.update({
            where: { id: campaignId },
            data: { status: 'pending' }
          });
          
          console.log(`   ✅ Campaign status updated to: ${updatedCampaign.status}`);
        } catch (updateError) {
          console.log(`   ❌ Update failed: ${updateError.message}`);
        }
      }
    }

    // 5. Final verification
    console.log('\n5. Final verification...');
    const finalCampaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { status: true }
    });
    console.log(`   Final campaign status: ${finalCampaign?.status}`);

    console.log('\n🎯 Campaign status function test completed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
if (require.main === module) {
  testCampaignStatusFunction();
}





