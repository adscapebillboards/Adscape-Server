const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Test script to simulate approving a pending billboard
async function testPendingBillboardApproval() {
  try {
    console.log('🧪 Testing Pending Billboard Approval Flow...\n');

    // 1. Find a campaign with at least one pending billboard
    console.log('1. Finding campaigns with pending billboards...');
    const campaigns = await prisma.campaign.findMany({
      orderBy: { createdAt: 'desc' }
    });

    let testCampaign = null;
    let pendingBillboard = null;
    
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
        // Check if there's at least one pending billboard
        const pending = billboards.find(b => b.status?.toUpperCase() !== 'APPROVED');
        if (pending) {
          testCampaign = campaign;
          pendingBillboard = pending;
          break;
        }
      }
    }

    if (!testCampaign || !pendingBillboard) {
      console.log('❌ No campaign with pending billboards found');
      console.log('   Creating a test scenario...');
      
      // Let's find any campaign and manually set one billboard to pending
      const anyCampaign = await prisma.campaign.findFirst({
        where: {
          billboards: {
            not: null
          }
        }
      });
      
      if (anyCampaign) {
        let billboards = anyCampaign.billboards;
        if (typeof billboards === 'string') {
          try {
            billboards = JSON.parse(billboards);
          } catch (error) {
            console.log('❌ Error parsing billboards');
            return;
          }
        }
        
        if (billboards.length > 0) {
          // Set the first billboard to pending
          billboards[0].status = 'PENDING';
          
          await prisma.campaign.update({
            where: { id: anyCampaign.id },
            data: { billboards }
          });
          
          testCampaign = anyCampaign;
          pendingBillboard = billboards[0];
          console.log(`✅ Created test scenario with campaign: ${testCampaign.id}`);
        }
      }
    }

    if (!testCampaign || !pendingBillboard) {
      console.log('❌ Could not create test scenario');
      return;
    }

    console.log(`✅ Found test campaign: ${testCampaign.id}`);
    console.log(`   Current Status: ${testCampaign.status}`);
    console.log(`   Current Name: ${testCampaign.campaignName}`);
    console.log(`   Pending Billboard: ${pendingBillboard.id} (Status: ${pendingBillboard.status})`);

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

    console.log(`   Total Billboards: ${billboards.length}`);
    billboards.forEach((billboard, index) => {
      console.log(`     ${index + 1}. ${billboard.id} - Status: ${billboard.status}`);
    });

    // 3. Count approved billboards before approval
    const approvedBefore = billboards.filter(b => b.status?.toUpperCase() === 'APPROVED').length;
    const totalBillboards = billboards.length;
    console.log(`\n2. Before Approval:`);
    console.log(`   Approved: ${approvedBefore}/${totalBillboards}`);
    console.log(`   Campaign Status: ${testCampaign.status}`);

    // 4. Test the API call to approve the pending billboard
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
      
      // 5. Check final state
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
      
      const approvedAfter = finalBillboards.filter(b => b.status?.toUpperCase() === 'APPROVED').length;
      const allFinalApproved = finalBillboards.every(b => b.status?.toUpperCase() === 'APPROVED');
      
      console.log(`\n4. After Approval:`);
      console.log(`   Approved: ${approvedAfter}/${totalBillboards}`);
      console.log(`   All billboards approved: ${allFinalApproved ? '✅ YES' : '❌ NO'}`);
      console.log(`   Campaign status: ${finalCampaign.status}`);
      console.log(`   Campaign name: ${finalCampaign.campaignName}`);
      
      // 6. Summary
      console.log(`\n5. Summary:`);
      if (allFinalApproved && finalCampaign.status === 'APPROVED') {
        console.log(`   ✅ SUCCESS: Campaign automatically updated to APPROVED when all billboards were approved!`);
        console.log(`   ✅ Campaign name updated to: ${finalCampaign.campaignName}`);
      } else if (allFinalApproved && finalCampaign.status !== 'APPROVED') {
        console.log(`   ❌ ISSUE: All billboards approved but campaign status is ${finalCampaign.status}`);
      } else {
        console.log(`   ⚠️  PARTIAL: Not all billboards are approved yet (${approvedAfter}/${totalBillboards})`);
      }
      
    } catch (error) {
      console.log(`   ❌ API call failed: ${error.message}`);
    }

    console.log('\n🎯 Pending billboard approval test completed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
if (require.main === module) {
  testPendingBillboardApproval();
}

