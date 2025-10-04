const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Comprehensive test for billboard approval functionality
async function testCompleteBillboardApproval() {
  try {
    console.log('🧪 Testing Complete Billboard Approval Functionality...\n');

    // 1. Find a campaign with multiple billboards
    console.log('1. Finding a campaign with multiple billboards...');
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

    // 3. Test the complete flow
    console.log('\n2. Testing complete billboard approval flow...');
    
    // Import the functions
    const { updateBillboardStatus, updateUserStatistics, updateCampaignStatusBasedOnBillboards } = require('./controllers/campaignApiController');
    
    // Find a billboard to approve
    const billboardToApprove = billboards.find(b => b.status?.toUpperCase() !== 'APPROVED');
    if (!billboardToApprove) {
      console.log('   ⚠️  All billboards are already approved');
      console.log('   Testing with existing approved billboard...');
    }

    const testBillboard = billboardToApprove || billboards[0];
    console.log(`   Testing with billboard: ${testBillboard.id}`);
    console.log(`   Current status: ${testBillboard.status}`);

    // 4. Simulate the API call
    console.log('\n3. Simulating billboard approval API call...');
    
    // Create a mock request and response
    const mockReq = {
      params: { 
        campaignId: testCampaign.id, 
        billboardId: testBillboard.id 
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

    // Call the function
    try {
      await updateBillboardStatus(mockReq, mockRes);
    } catch (error) {
      console.log(`   ❌ Function call failed: ${error.message}`);
    }

    // 5. Verify the results
    console.log('\n4. Verifying results...');
    
    // Check campaign status
    const updatedCampaign = await prisma.campaign.findUnique({
      where: { id: testCampaign.id }
    });
    console.log(`   Campaign Status: ${updatedCampaign.status}`);
    
    // Check billboard statuses
    let updatedBillboards = updatedCampaign.billboards;
    if (typeof updatedBillboards === 'string') {
      try {
        updatedBillboards = JSON.parse(updatedBillboards);
      } catch (error) {
        console.log(`   ❌ Error parsing updated billboards: ${error.message}`);
      }
    }
    
    console.log(`   Billboard Statuses:`);
    updatedBillboards.forEach((billboard, index) => {
      console.log(`     ${index + 1}. ${billboard.id} - Status: ${billboard.status}`);
    });

    // Check if slots were generated
    const slotCount = await prisma.generatedSlot.count({
      where: { campaignId: testCampaign.id }
    });
    console.log(`   Total Slots Generated: ${slotCount}`);

    // Check user statistics
    const user = await prisma.user.findUnique({
      where: { email: testCampaign.userName }
    });
    console.log(`   User Statistics:`);
    console.log(`     Total Bookings: ${user.totalbookings}`);
    console.log(`     Total Spent: ${user.totalspent}`);
    console.log(`     Last Booking: ${user.lastbooking}`);
    console.log(`     Status: ${user.status}`);

    // 6. Test campaign status update function directly
    console.log('\n5. Testing campaign status update function directly...');
    
    try {
      const result = await updateCampaignStatusBasedOnBillboards(testCampaign.id, updatedBillboards);
      console.log(`   Function returned: ${result}`);
      
      const finalCampaign = await prisma.campaign.findUnique({
        where: { id: testCampaign.id },
        select: { status: true }
      });
      console.log(`   Final campaign status: ${finalCampaign?.status}`);
    } catch (error) {
      console.log(`   ❌ Campaign status update failed: ${error.message}`);
    }

    // 7. Summary
    console.log('\n6. Summary:');
    const allBillboardsApproved = updatedBillboards.every(b => b.status?.toUpperCase() === 'APPROVED');
    console.log(`   All billboards approved: ${allBillboardsApproved ? '✅ YES' : '❌ NO'}`);
    console.log(`   Campaign status: ${updatedCampaign.status}`);
    console.log(`   Slots generated: ${slotCount > 0 ? '✅ YES' : '❌ NO'} (${slotCount})`);
    console.log(`   User stats updated: ${user.totalbookings > 0 ? '✅ YES' : '❌ NO'}`);

    console.log('\n🎯 Complete billboard approval test completed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
if (require.main === module) {
  testCompleteBillboardApproval();
}

module.exports = { testCompleteBillboardApproval };

