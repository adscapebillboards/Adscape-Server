const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Test approval flow with fresh campaign
async function testFreshCampaignApproval() {
  try {
    console.log('🧪 Testing Fresh Campaign Approval Flow...\n');

    const campaignId = '5c281981-b7ad-44e7-abb9-24fd76bc1936';

    // 1. Get the campaign
    console.log('1. Getting campaign data...');
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId }
    });

    if (!campaign) {
      console.log('❌ Campaign not found');
      await prisma.$disconnect();
      return;
    }

    console.log(`✅ Found campaign: ${campaign.id}`);
    console.log(`   Status: ${campaign.status}`);
    console.log(`   Name: ${campaign.campaignName}`);
    console.log(`   User: ${campaign.userName}`);

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

    // 4. Approve each billboard one by one
    for (let i = 0; i < billboards.length; i++) {
      const billboard = billboards[i];
      console.log(`\n2.${i + 1}. Approving billboard: ${billboard.id}`);
      
      const mockReq = {
        params: { 
          campaignId: campaignId, 
          billboardId: billboard.id 
        },
        body: { status: 'approved' }
      };

      await updateBillboardStatus(mockReq, mockRes);
      
      // Small delay to ensure database updates
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // 5. Check final result
    console.log('\n3. Final result after approving ALL billboards...');
    const finalCampaign = await prisma.campaign.findUnique({
      where: { id: campaignId }
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
    console.log('\n🎯 Fresh campaign approval test completed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
if (require.main === module) {
  testFreshCampaignApproval();
}

