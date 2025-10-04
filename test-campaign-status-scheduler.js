const { updateCampaignStatusByDate, updateAllCampaignsStatusByDate, getCampaignStatusSummary } = require('./controllers/campaignStatusController');
const scheduler = require('./utils/campaignStatusScheduler');
const logger = require('./config/logger');

async function testCampaignStatusScheduler() {
  console.log('🧪 Testing Campaign Status Scheduler...\n');

  try {
    // Test 1: Get all campaigns and their current status
    console.log('1. Testing getCampaignStatusSummary for all campaigns...');
    
    // First, let's get a list of campaigns
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    
    const campaigns = await prisma.campaign.findMany({
      take: 5 // Limit to 5 campaigns for testing
    });

    console.log(`Found ${campaigns.length} campaigns to test`);

    // Test 2: Test individual campaign status update
    if (campaigns.length > 0) {
      const testCampaign = campaigns[0];
      console.log(`\n2. Testing updateCampaignStatusByDate for campaign: ${testCampaign.id}`);
      
      const result = await updateCampaignStatusByDate(testCampaign.id);
      
      if (result) {
        console.log('✅ Individual campaign status update successful');
        console.log(`   Campaign ID: ${testCampaign.id}`);
        console.log(`   Status Changed: ${result.statusChanged}`);
        console.log(`   Updated Billboards: ${result.updatedBillboards.length}`);
        console.log(`   New Campaign Status: ${result.campaign.status}`);
      } else {
        console.log('❌ Individual campaign status update failed');
      }
    }

    // Test 3: Test batch update
    console.log('\n3. Testing updateAllCampaignsStatusByDate...');
    
    const batchResult = await updateAllCampaignsStatusByDate();
    
    console.log('✅ Batch campaign status update completed');
    console.log(`   Total Campaigns: ${batchResult.totalCampaigns}`);
    console.log(`   Updated Campaigns: ${batchResult.updatedCampaigns}`);
    console.log(`   Results: ${batchResult.results.length}`);

    // Test 4: Test scheduler functionality
    console.log('\n4. Testing scheduler functionality...');
    
    // Get scheduler status
    const schedulerStatus = scheduler.getStatus();
    console.log(`   Scheduler Running: ${schedulerStatus.isRunning}`);
    console.log(`   Has Interval: ${schedulerStatus.hasInterval}`);

    // Test 5: Test manual scheduler run
    console.log('\n5. Testing manual scheduler run...');
    
    const manualResult = await scheduler.runImmediate();
    
    console.log('✅ Manual scheduler run completed');
    console.log(`   Total Campaigns: ${manualResult.totalCampaigns}`);
    console.log(`   Updated Campaigns: ${manualResult.updatedCampaigns}`);

    // Test 6: Test campaign status summary
    if (campaigns.length > 0) {
      const testCampaign = campaigns[0];
      console.log(`\n6. Testing getCampaignStatusSummary for campaign: ${testCampaign.id}`);
      
      const summary = await getCampaignStatusSummary(testCampaign.id);
      
      console.log('✅ Campaign status summary retrieved');
      console.log(`   Campaign ID: ${summary.campaignId}`);
      console.log(`   Campaign Status: ${summary.campaignStatus}`);
      console.log(`   Total Billboards: ${summary.totalBillboards}`);
      console.log(`   Status Counts:`, summary.statusCounts);
      console.log(`   Billboard Statuses: ${summary.billboardStatuses.length} billboards`);
    }

    console.log('\n🎯 All tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    logger.error('Campaign status scheduler test failed:', error);
  } finally {
    // Close Prisma connection
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    await prisma.$disconnect();
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testCampaignStatusScheduler()
    .then(() => {
      console.log('Test completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Test failed:', error);
      process.exit(1);
    });
}

module.exports = { testCampaignStatusScheduler };
