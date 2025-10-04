const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Simple test to verify the approval flow
async function testSimpleApprovalFlow() {
  try {
    console.log('🧪 Testing Simple Approval Flow...\n');

    // 1. Find a campaign with multiple billboards
    console.log('1. Finding a campaign...');
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

    console.log(`✅ Found campaign: ${testCampaign.id}`);
    console.log(`   Status: ${testCampaign.status}`);
    console.log(`   Name: ${testCampaign.campaignName}`);

    // 2. Parse and display current billboards
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

    // 3. Set all billboards to PENDING first
    console.log('\n2. Setting all billboards to PENDING...');
    billboards.forEach(billboard => {
      billboard.status = 'PENDING';
    });

    await prisma.campaign.update({
      where: { id: testCampaign.id },
      data: { 
        billboards,
        status: 'pending',
        campaignName: 'Test Campaign'
      }
    });

    console.log('   ✅ All billboards set to PENDING');
    console.log('   ✅ Campaign status set to pending');

    // 4. Verify the update
    const updatedCampaign = await prisma.campaign.findUnique({
      where: { id: testCampaign.id }
    });

    let updatedBillboards = updatedCampaign.billboards;
    if (typeof updatedBillboards === 'string') {
      try {
        updatedBillboards = JSON.parse(updatedBillboards);
      } catch (error) {
        console.log(`❌ Error parsing updated billboards: ${error.message}`);
      }
    }

    console.log(`   Verified - Campaign Status: ${updatedCampaign.status}`);
    console.log(`   Verified - Campaign Name: ${updatedCampaign.campaignName}`);
    updatedBillboards.forEach((billboard, index) => {
      console.log(`     ${index + 1}. ${billboard.id} - Status: ${billboard.status}`);
    });

    // 5. Now approve the first billboard
    console.log('\n3. Approving first billboard...');
    const firstBillboard = updatedBillboards[0];
    console.log(`   Approving: ${firstBillboard.id}`);

    const { updateBillboardStatus } = require('./controllers/campaignApiController');
    
    const mockReq = {
      params: { 
        campaignId: testCampaign.id, 
        billboardId: firstBillboard.id 
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

    // 6. Check the result
    console.log('\n4. Checking result...');
    const finalCampaign = await prisma.campaign.findUnique({
      where: { id: testCampaign.id }
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

    // 7. Now approve the second billboard to trigger campaign approval
    if (finalBillboards.length > 1) {
      console.log('\n5. Approving second billboard to trigger campaign approval...');
      const secondBillboard = finalBillboards[1];
      console.log(`   Approving: ${secondBillboard.id}`);

      const mockReq2 = {
        params: { 
          campaignId: testCampaign.id, 
          billboardId: secondBillboard.id 
        },
        body: { status: 'approved' }
      };

      await updateBillboardStatus(mockReq2, mockRes);

      // 8. Check final result
      console.log('\n6. Final result after approving all billboards...');
      const finalFinalCampaign = await prisma.campaign.findUnique({
        where: { id: testCampaign.id }
      });

      let finalFinalBillboards = finalFinalCampaign.billboards;
      if (typeof finalFinalBillboards === 'string') {
        try {
          finalFinalBillboards = JSON.parse(finalFinalBillboards);
        } catch (error) {
          console.log(`❌ Error parsing final billboards: ${error.message}`);
        }
      }

      const finalApprovedCount = finalFinalBillboards.filter(b => b.status?.toUpperCase() === 'APPROVED').length;
      const finalAllApproved = finalFinalBillboards.every(b => b.status?.toUpperCase() === 'APPROVED');

      console.log(`   Final Campaign Status: ${finalFinalCampaign.status}`);
      console.log(`   Final Campaign Name: ${finalFinalCampaign.campaignName}`);
      console.log(`   Final Approved Billboards: ${finalApprovedCount}/${finalFinalBillboards.length}`);
      console.log(`   All Final Approved: ${finalAllApproved ? 'YES' : 'NO'}`);

      finalFinalBillboards.forEach((billboard, index) => {
        console.log(`     ${index + 1}. ${billboard.id} - Status: ${billboard.status}`);
      });

      // 9. Summary
      console.log('\n7. Summary:');
      if (finalAllApproved && finalFinalCampaign.status === 'APPROVED') {
        console.log('   ✅ SUCCESS: Campaign automatically updated to APPROVED when all billboards were approved!');
        console.log(`   ✅ Campaign name updated to: ${finalFinalCampaign.campaignName}`);
      } else {
        console.log('   ❌ ISSUE: Campaign status not updated automatically');
        console.log(`   Expected: APPROVED, Got: ${finalFinalCampaign.status}`);
      }
    }

    console.log('\n🎯 Simple approval flow test completed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
if (require.main === module) {
  testSimpleApprovalFlow();
}

