const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Test script to debug billboard approval issue
async function testBillboardApprovalIssue() {
  try {
    console.log('🔍 Debugging Billboard Approval Issue...\n');

    // 1. Find a campaign with multiple billboards
    console.log('1. Finding campaigns with multiple billboards...');
    const campaigns = await prisma.campaign.findMany({
      orderBy: { createdAt: 'desc' }
    });

    let testCampaign = null;
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
        testCampaign = campaign;
        break;
      }
    }

    if (!testCampaign) {
      console.log('❌ No campaign with multiple billboards found');
      return;
    }

    console.log(`✅ Found test campaign: ${testCampaign.id}`);
    console.log(`   Current Status: ${testCampaign.status}`);
    console.log(`   Current Name: ${testCampaign.campaignName}`);
    console.log(`   User: ${testCampaign.userName}`);

    // 2. Parse billboards
    let billboards = testCampaign.billboards;
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

    // 3. Check if all billboards are approved
    const allBillboardsApproved = billboards.every(b => b.status?.toUpperCase() === 'APPROVED');
    console.log(`\n2. All billboards approved: ${allBillboardsApproved ? '✅ YES' : '❌ NO'}`);

    if (allBillboardsApproved) {
      console.log('   ⚠️  All billboards are already approved, but campaign status might not be updated');
      console.log('   Testing manual campaign status update...');
      
      // Import the function
      const { updateCampaignStatusBasedOnBillboards } = require('./controllers/campaignApiController');
      
      try {
        console.log('\n3. Testing manual campaign status update...');
        const result = await updateCampaignStatusBasedOnBillboards(testCampaign.id, billboards);
        console.log(`   Function returned: ${result}`);
        
        // Check the result
        const updatedCampaign = await prisma.campaign.findUnique({
          where: { id: testCampaign.id }
        });
        console.log(`   Updated Campaign Status: ${updatedCampaign.status}`);
        console.log(`   Updated Campaign Name: ${updatedCampaign.campaignName}`);
        
        if (updatedCampaign.status === 'APPROVED') {
          console.log('   ✅ Campaign status updated successfully!');
        } else {
          console.log('   ❌ Campaign status not updated!');
        }
      } catch (error) {
        console.log(`   ❌ Manual update failed: ${error.message}`);
      }
    } else {
      console.log('   ⚠️  Not all billboards are approved');
      console.log('   Finding a billboard to approve...');
      
      const pendingBillboard = billboards.find(b => b.status?.toUpperCase() !== 'APPROVED');
      if (pendingBillboard) {
        console.log(`   Found billboard to approve: ${pendingBillboard.id} (Status: ${pendingBillboard.status})`);
        
        // Test the API call
        console.log('\n3. Testing billboard approval API call...');
        
        const { updateBillboardStatus } = require('./controllers/campaignApiController');
        
        const mockReq = {
          params: { 
            campaignId: testCampaign.id, 
            billboardId: pendingBillboard.id 
          },
          body: { status: 'approved' }
        };
        
        const mockRes = {
          json: (data) => {
            console.log('   ✅ API Response:', data.message);
            console.log(`   Campaign Status: ${data.campaign.status}`);
            console.log(`   Billboard Status: ${data.updatedBillboard.status}`);
          },
          status: (code) => ({
            json: (data) => {
              console.log(`   ❌ API Error (${code}):`, data.error);
            }
          })
        };

        try {
          await updateBillboardStatus(mockReq, mockRes);
          
          // Check final state
          const finalCampaign = await prisma.campaign.findUnique({
            where: { id: testCampaign.id }
          });
          
          let finalBillboards = finalCampaign.billboards;
          if (typeof finalBillboards === 'string') {
            try {
              finalBillboards = JSON.parse(finalBillboards);
            } catch (error) {
              console.log(`   ❌ Error parsing final billboards: ${error.message}`);
            }
          }
          
          const allFinalApproved = finalBillboards.every(b => b.status?.toUpperCase() === 'APPROVED');
          console.log(`\n4. Final Results:`);
          console.log(`   All billboards approved: ${allFinalApproved ? '✅ YES' : '❌ NO'}`);
          console.log(`   Campaign status: ${finalCampaign.status}`);
          console.log(`   Campaign name: ${finalCampaign.campaignName}`);
          
        } catch (error) {
          console.log(`   ❌ API call failed: ${error.message}`);
        }
      } else {
        console.log('   ❌ No pending billboards found');
      }
    }

    console.log('\n🎯 Billboard approval issue debugging completed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
if (require.main === module) {
  testBillboardApprovalIssue();
}

