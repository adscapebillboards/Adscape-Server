const axios = require('axios');

// Test the API call with detailed logging
async function testApiWithLogging() {
  try {
    console.log('🧪 Testing API Call with Detailed Logging...\n');

    const campaignId = '183fc209-9e96-421e-818a-1f8184274118';
    const billboardId = 'test-billboard-1';

    console.log(`1. Making API call to approve billboard: ${billboardId}`);

    // Make the exact API call that the UI makes
    const api = axios.create({
      baseURL: 'http://localhost:4000'
    });

    const response = await api.put(`/api/campaigns/${campaignId}/billboards/${billboardId}/status`, {
      status: 'approved'
    });

    console.log('✅ API Call Successful!');
    console.log('   Response:', response.data);

    // Wait a moment for any async operations to complete
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('\n2. Checking final campaign status...');
    
    // Check the final campaign status
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    const finalCampaign = await prisma.campaign.findUnique({
      where: { id: campaignId }
    });

    if (finalCampaign) {
      console.log(`   Final Campaign Status: ${finalCampaign.status}`);
      console.log(`   Final Campaign Name: ${finalCampaign.campaignName}`);
      
      let finalBillboards = finalCampaign.billboards;
      if (typeof finalBillboards === 'string') {
        try {
          finalBillboards = JSON.parse(finalBillboards);
        } catch (error) {
          console.log(`   ❌ Error parsing final billboards: ${error.message}`);
        }
      }

      const approvedCount = finalBillboards.filter(b => b.status?.toUpperCase() === 'APPROVED').length;
      const allApproved = finalBillboards.every(b => b.status?.toUpperCase() === 'APPROVED');

      console.log(`   Approved Billboards: ${approvedCount}/${finalBillboards.length}`);
      console.log(`   All Approved: ${allApproved ? 'YES' : 'NO'}`);

      finalBillboards.forEach((billboard, index) => {
        console.log(`     ${index + 1}. ${billboard.id} - Status: ${billboard.status}`);
      });

      if (allApproved && finalCampaign.status === 'APPROVED') {
        console.log('\n   ✅ SUCCESS: Campaign automatically updated to APPROVED!');
      } else if (allApproved && finalCampaign.status !== 'APPROVED') {
        console.log('\n   ❌ ISSUE: All billboards approved but campaign status not updated');
      } else {
        console.log('\n   ⚠️  PARTIAL: Not all billboards are approved yet');
      }
    }

    await prisma.$disconnect();
    console.log('\n🎯 API test with logging completed!');

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
  testApiWithLogging();
}

