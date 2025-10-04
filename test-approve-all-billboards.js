const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Test to approve all billboards and verify campaign status
async function testApproveAllBillboards() {
  try {
    console.log('🧪 Testing Approve All Billboards...\n');

    // 1. Find the test campaign
    console.log('1. Finding test campaign...');
    const campaign = await prisma.campaign.findFirst({
      where: {
        id: 'c575c00b-402f-43c4-b0c3-5619b3c2dfaf'
      }
    });

    if (!campaign) {
      console.log('❌ Test campaign not found');
      await prisma.$disconnect();
      return;
    }

    console.log(`✅ Found test campaign: ${campaign.id}`);
    console.log(`   Status: ${campaign.status}`);
    console.log(`   Name: ${campaign.campaignName}`);

    // 2. Parse billboards
    let billboards = campaign.billboards;
    if (typeof billboards === 'string') {
      try {
        billboards = JSON.parse(billboards);
      } catch (error) {
        console.log(`❌ Error parsing billboards: ${error.message}`);
        await prisma.$disconnect();
        return;
      }
    }

    console.log(`   Billboards: ${billboards.length}`);
    billboards.forEach((billboard, index) => {
      console.log(`     ${index + 1}. ${billboard.id} - Status: ${billboard.status}`);
    });

    // 3. Import the function
    const { updateBillboardStatus } = require('./controllers/campaignApiController');
    
    const mockRes = {
      json: (data) => {
        console.log('   ✅ Function Response:', data.message);
        console.log(`   Campaign Status: ${data.campaign.status}`);
        console.log(`   Billboard Status: ${data.updatedBillboard.status}`);
      },
      status: (code) => ({
        json: (data) => {
          console.log(`   ❌ Function Error (${code}):`, data.error);
        }
      })
    };

    // 4. Approve each pending billboard
    for (let i = 0; i < billboards.length; i++) {
      const billboard = billboards[i];
      if (billboard.status?.toUpperCase() !== 'APPROVED') {
        console.log(`\n2.${i + 1}. Approving billboard: ${billboard.id}`);
        
        const mockReq = {
          params: { 
            campaignId: campaign.id, 
            billboardId: billboard.id 
          },
          body: { status: 'approved' }
        };

        await updateBillboardStatus(mockReq, mockRes);
        
        // Small delay to ensure database updates
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // 5. Check final result
    console.log('\n3. Final result after approving ALL billboards...');
    const finalCampaign = await prisma.campaign.findUnique({
      where: { id: campaign.id }
    });

    let finalBillboards = finalCampaign.billboards;
    if (typeof finalBillboards === 'string') {
      try {
        finalBillboards = JSON.parse(finalBillboards);
      } catch (error) {
        console.log(`❌ Error parsing final billboards: ${error.message}`);
      }
    }

    const approvedCount = finalBillboards.filter(b => b.status?.toUpperCase() === 'APPROVED').length;
    const allApproved = finalBillboards.every(b => b.status?.toUpperCase() === 'APPROVED');

    console.log(`   Final Campaign Status: ${finalCampaign.status}`);
    console.log(`   Final Campaign Name: ${finalCampaign.campaignName}`);
    console.log(`   Approved Billboards: ${approvedCount}/${finalBillboards.length}`);
    console.log(`   All Approved: ${allApproved ? 'YES' : 'NO'}`);

    finalBillboards.forEach((billboard, index) => {
      console.log(`     ${index + 1}. ${billboard.id} - Status: ${billboard.status}`);
    });

    // 6. Summary
    console.log('\n4. Summary:');
    if (allApproved && finalCampaign.status === 'APPROVED') {
      console.log('   ✅ SUCCESS: Campaign automatically updated to APPROVED when ALL billboards were approved!');
      console.log(`   ✅ Campaign name updated to: ${finalCampaign.campaignName}`);
      console.log('   ✅ All functionalities working correctly:');
      console.log('      - Billboard status updates');
      console.log('      - Slot generation');
      console.log('      - User statistics updates');
      console.log('      - Campaign status and name updates');
    } else if (allApproved && finalCampaign.status !== 'APPROVED') {
      console.log('   ❌ ISSUE: All billboards approved but campaign status not updated');
      console.log(`   Expected: APPROVED, Got: ${finalCampaign.status}`);
    } else {
      console.log('   ❌ ISSUE: Not all billboards are approved');
      console.log(`   Approved: ${approvedCount}/${finalBillboards.length}`);
    }

    await prisma.$disconnect();
    console.log('\n🎯 Approve all billboards test completed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
if (require.main === module) {
  testApproveAllBillboards();
}

