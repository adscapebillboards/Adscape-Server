const axios = require('axios');

// Test the exact API call that the UI makes
async function testUIApiCall() {
  try {
    console.log('🧪 Testing UI API Call...\n');

    // 1. First, let's find a campaign with multiple billboards
    console.log('1. Finding a campaign with multiple billboards...');
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

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
      await prisma.$disconnect();
      return;
    }

    console.log(`✅ Found test campaign: ${testCampaign.id}`);
    console.log(`   Status: ${testCampaign.status}`);
    console.log(`   Name: ${testCampaign.campaignName}`);

    // 2. Parse billboards
    let billboards = testCampaign.billboards;
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

    // 3. Find a billboard to approve
    const billboardToApprove = billboards.find(b => b.status?.toUpperCase() !== 'APPROVED');
    if (!billboardToApprove) {
      console.log('❌ No billboard to approve found');
      await prisma.$disconnect();
      return;
    }

    console.log(`\n2. Testing API call for billboard: ${billboardToApprove.id}`);

    // 4. Make the exact API call that the UI makes
    const api = axios.create({
      baseURL: 'http://localhost:4000'
    });

    const response = await api.put(`/api/campaigns/${testCampaign.id}/billboards/${billboardToApprove.id}/status`, {
      status: 'approved'
    });

    console.log('✅ API Call Successful!');
    console.log('   Response:', response.data);

    // 5. Check the result
    console.log('\n3. Checking result...');
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

    // 6. Summary
    console.log('\n4. Summary:');
    if (allApproved && finalCampaign.status === 'APPROVED') {
      console.log('   ✅ SUCCESS: API call worked perfectly!');
      console.log('   ✅ Campaign automatically updated to APPROVED');
      console.log(`   ✅ Campaign name updated to: ${finalCampaign.campaignName}`);
    } else if (allApproved && finalCampaign.status !== 'APPROVED') {
      console.log('   ❌ ISSUE: All billboards approved but campaign status not updated');
      console.log(`   Expected: APPROVED, Got: ${finalCampaign.status}`);
    } else {
      console.log('   ⚠️  PARTIAL: Not all billboards are approved yet');
    }

    await prisma.$disconnect();
    console.log('\n🎯 UI API call test completed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    if (error.response) {
      console.error('   Response status:', error.response.status);
      console.error('   Response data:', error.response.data);
    }
  }
}

// Run the test
if (require.main === module) {
  testUIApiCall();
}

