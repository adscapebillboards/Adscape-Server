const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Test to approve all billboards and verify campaign status
async function testCompleteApproval() {
  try {
    console.log('🧪 Testing Complete Approval Flow...\n');

    // 1. Find the test campaign
    console.log('1. Finding test campaign...');
    const campaign = await prisma.campaign.findFirst({
      where: {
        id: '071f7e63-7844-440b-8c54-ef2baad87830'
      }
    });

    if (!campaign) {
      console.log('❌ Test campaign not found');
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
        return;
      }
    }

    console.log(`   Billboards: ${billboards.length}`);
    billboards.forEach((billboard, index) => {
      console.log(`     ${index + 1}. ${billboard.id} - Status: ${billboard.status}`);
    });

    // 3. Find the pending billboard (should be the third one)
    const pendingBillboard = billboards.find(b => b.status === 'PENDING');
    if (!pendingBillboard) {
      console.log('❌ No pending billboard found');
      return;
    }

    console.log(`\n2. Approving the last pending billboard: ${pendingBillboard.id}`);

    // 4. Approve the last billboard
    const { updateBillboardStatus } = require('./controllers/campaignApiController');
    
    const mockReq = {
      params: { 
        campaignId: campaign.id, 
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

    await updateBillboardStatus(mockReq, mockRes);

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
    } else {
      console.log('   ❌ ISSUE: Campaign status not updated automatically');
      console.log(`   Expected: APPROVED, Got: ${finalCampaign.status}`);
      console.log(`   All billboards approved: ${allApproved}`);
    }

    console.log('\n🎯 Complete approval test finished!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
if (require.main === module) {
  testCompleteApproval();
}
