const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Test the exact scenario from the user's logs
async function testSingleBillboardCampaign() {
  try {
    console.log('🧪 Testing Single Billboard Campaign Scenario...\n');

    const campaignId = 'c08dfedc-e48f-4dab-a547-ed86b16863dc';
    const billboardId = '1754539178053';

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

    // 3. Simulate the exact API call
    console.log('\n2. Simulating the exact API call...');
    
    const { updateBillboardStatus } = require('./controllers/campaignApiController');
    
    const mockReq = {
      params: { 
        campaignId: campaignId, 
        billboardId: billboardId 
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

    // 4. Check the result
    console.log('\n3. Checking final result...');
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

    // 5. Summary
    console.log('\n4. Summary:');
    if (allApproved && finalCampaign.status === 'APPROVED') {
      console.log('   ✅ SUCCESS: Campaign automatically updated to APPROVED!');
      console.log(`   ✅ Campaign name updated to: ${finalCampaign.campaignName}`);
    } else if (allApproved && finalCampaign.status !== 'APPROVED') {
      console.log('   ❌ ISSUE: All billboards approved but campaign status not updated');
      console.log(`   Expected: APPROVED, Got: ${finalCampaign.status}`);
    } else {
      console.log('   ⚠️  PARTIAL: Not all billboards are approved yet');
    }

    await prisma.$disconnect();
    console.log('\n🎯 Single billboard campaign test completed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
if (require.main === module) {
  testSingleBillboardCampaign();
}

