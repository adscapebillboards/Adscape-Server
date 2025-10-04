const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Test case sensitivity issue
async function testCaseSensitivity() {
  try {
    console.log('🧪 Testing Case Sensitivity Issue...\n');

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

    // 3. Test different status values
    console.log('\n2. Testing different status values...');
    
    const testStatuses = ['approved', 'APPROVED', 'Approved', 'pending', 'PENDING'];
    
    testStatuses.forEach(status => {
      const normalizedStatus = status.toUpperCase();
      const isApproved = normalizedStatus === 'APPROVED' | "approved";
      console.log(`   Status: "${status}" -> Normalized: "${normalizedStatus}" -> Is Approved: ${isApproved}`);
    });

    // 4. Test the actual API call with different status values
    console.log('\n3. Testing API call with different status values...');
    
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

    // Test with lowercase "approved"
    console.log('\n4. Testing with status: "approved" (lowercase)...');
    const mockReq1 = {
      params: { 
        campaignId: campaignId, 
        billboardId: billboardId 
      },
      body: { status: 'approved' }
    };

    await updateBillboardStatus(mockReq1, mockRes);

    // Check result
    const campaignAfter1 = await prisma.campaign.findUnique({
      where: { id: campaignId }
    });
    console.log(`   Campaign Status After: ${campaignAfter1.status}`);

    // Test with uppercase "APPROVED"
    console.log('\n5. Testing with status: "APPROVED" (uppercase)...');
    const mockReq2 = {
      params: { 
        campaignId: campaignId, 
        billboardId: billboardId 
      },
      body: { status: 'APPROVED' }
    };

    await updateBillboardStatus(mockReq2, mockRes);

    // Check result
    const campaignAfter2 = await prisma.campaign.findUnique({
      where: { id: campaignId }
    });
    console.log(`   Campaign Status After: ${campaignAfter2.status}`);

    await prisma.$disconnect();
    console.log('\n🎯 Case sensitivity test completed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
if (require.main === module) {
  testCaseSensitivity();
}

