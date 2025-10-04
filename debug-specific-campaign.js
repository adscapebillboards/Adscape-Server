const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Debug the specific campaign that's not updating
async function debugSpecificCampaign() {
  try {
    console.log('🔍 Debugging Specific Campaign...\n');

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

    // 3. Find the specific billboard
    const billboardIndex = billboards.findIndex(b => b.id === billboardId);
    if (billboardIndex === -1) {
      console.log(`❌ Billboard ${billboardId} not found in campaign`);
      await prisma.$disconnect();
      return;
    }

    console.log(`\n2. Found billboard at index ${billboardIndex}: ${billboards[billboardIndex].id}`);
    console.log(`   Current Status: ${billboards[billboardIndex].status}`);

    // 4. Simulate the approval process
    console.log('\n3. Simulating approval process...');
    
    // Update the billboard status in the array
    billboards[billboardIndex].status = 'APPROVED';
    billboards[billboardIndex].updatedAt = new Date().toISOString();

    console.log(`   Updated billboard status to: ${billboards[billboardIndex].status}`);

    // 5. Check if all billboards are approved
    const allBillboardsApproved = billboards.every(b => b.status?.toUpperCase() === 'APPROVED');
    const approvedCount = billboards.filter(b => b.status?.toUpperCase() === 'APPROVED').length;

    console.log(`\n4. Campaign Status Check:`);
    console.log(`   Total Billboards: ${billboards.length}`);
    console.log(`   Approved Billboards: ${approvedCount}`);
    console.log(`   All Approved: ${allBillboardsApproved ? 'YES' : 'NO'}`);

    // 6. Test the updateCampaignStatusBasedOnBillboards function
    console.log('\n5. Testing updateCampaignStatusBasedOnBillboards function...');
    
    const { updateCampaignStatusBasedOnBillboards } = require('./controllers/campaignApiController');
    
    try {
      const result = await updateCampaignStatusBasedOnBillboards(campaignId, billboards);
      console.log(`   Function returned: ${result}`);
      
      // Check the result
      const updatedCampaign = await prisma.campaign.findUnique({
        where: { id: campaignId }
      });
      
      console.log(`   Updated Campaign Status: ${updatedCampaign.status}`);
      console.log(`   Updated Campaign Name: ${updatedCampaign.campaignName}`);
      
      if (allBillboardsApproved && updatedCampaign.status === 'APPROVED') {
        console.log('   ✅ SUCCESS: Campaign status updated correctly!');
      } else if (allBillboardsApproved && updatedCampaign.status !== 'APPROVED') {
        console.log('   ❌ ISSUE: All billboards approved but campaign status not updated');
        console.log(`   Expected: APPROVED, Got: ${updatedCampaign.status}`);
      } else {
        console.log('   ⚠️  PARTIAL: Not all billboards are approved yet');
      }
      
    } catch (error) {
      console.log(`   ❌ Function failed: ${error.message}`);
    }

    // 7. Check if the billboard was actually updated in the database
    console.log('\n6. Checking if billboard was updated in database...');
    
    // Update the campaign with the new billboard status
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { billboards }
    });

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

    const finalBillboard = finalBillboards.find(b => b.id === billboardId);
    console.log(`   Billboard ${billboardId} status in database: ${finalBillboard?.status}`);

    await prisma.$disconnect();
    console.log('\n🎯 Debug completed!');

  } catch (error) {
    console.error('❌ Debug failed:', error);
  }
}

// Run the debug
if (require.main === module) {
  debugSpecificCampaign();
}

