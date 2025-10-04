const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Test the exact API call that's failing
async function testExactApiCall() {
  try {
    console.log('🧪 Testing Exact API Call...\n');

    const campaignId = '4af36757-03e1-4eb4-ab95-8c366b8363b1';
    const billboardId = '1750092570324';

    // 1. Get the campaign before the API call
    console.log('1. Getting campaign before API call...');
    const campaignBefore = await prisma.campaign.findUnique({
      where: { id: campaignId }
    });

    console.log(`   Campaign Status Before: ${campaignBefore.status}`);
    console.log(`   Campaign Name Before: ${campaignBefore.campaignName}`);

    // 2. Simulate the exact API call
    console.log('\n2. Simulating the exact API call...');
    
    const { updateBillboardStatus } = require('./controllers/campaignApiController');
    
    const mockReq = {
      params: { 
        campaignId: campaignId, 
        billboardId: billboardId 
      },
      body: { status: 'approved' } // This is the exact status being sent
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

    // 3. Check the campaign after the API call
    console.log('\n3. Checking campaign after API call...');
    const campaignAfter = await prisma.campaign.findUnique({
      where: { id: campaignId }
    });

    console.log(`   Campaign Status After: ${campaignAfter.status}`);
    console.log(`   Campaign Name After: ${campaignAfter.campaignName}`);

    // 4. Parse billboards to see the final state
    let billboards = campaignAfter.billboards;
    if (typeof billboards === 'string') {
      try {
        billboards = JSON.parse(billboards);
      } catch (error) {
        console.log(`   ❌ Error parsing billboards: ${error.message}`);
      }
    }

    const approvedCount = billboards.filter(b => b.status?.toUpperCase() === 'APPROVED').length;
    const allApproved = billboards.every(b => b.status?.toUpperCase() === 'APPROVED');

    console.log(`   Approved Billboards: ${approvedCount}/${billboards.length}`);
    console.log(`   All Approved: ${allApproved ? 'YES' : 'NO'}`);

    billboards.forEach((billboard, index) => {
      console.log(`     ${index + 1}. ${billboard.id} - Status: ${billboard.status}`);
    });

    // 5. Summary
    console.log('\n4. Summary:');
    if (allApproved && campaignAfter.status === 'APPROVED') {
      console.log('   ✅ SUCCESS: Campaign automatically updated to APPROVED!');
      console.log(`   ✅ Campaign name updated to: ${campaignAfter.campaignName}`);
    } else if (allApproved && campaignAfter.status !== 'APPROVED') {
      console.log('   ❌ ISSUE: All billboards approved but campaign status not updated');
      console.log(`   Expected: APPROVED, Got: ${campaignAfter.status}`);
    } else {
      console.log('   ⚠️  PARTIAL: Not all billboards are approved yet');
    }

    await prisma.$disconnect();
    console.log('\n🎯 Exact API call test completed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
if (require.main === module) {
  testExactApiCall();
}

