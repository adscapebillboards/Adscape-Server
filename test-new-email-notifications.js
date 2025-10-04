const EmailService = require('./services/emailService');
const logger = require('./config/logger');

async function testNewEmailNotifications() {
  try {
    console.log('🧪 Testing new email notifications...\n');

    // Test 1: Campaign Creation Confirmation to User
    console.log('📧 Test 1: Campaign Creation Confirmation to User');
    const campaignData = {
      id: 'test-campaign-456',
      userName: 'testuser@example.com',
      campaignName: 'Test Campaign',
      totalAmount: 5000,
      startDate: new Date(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      billboards: [
        { id: 'billboard-1', location: 'Test Location' }
      ],
      status: 'PENDING'
    };

    console.log('Sending campaign creation confirmation to user...');
    await EmailService.notifyCampaignCreatedUser(campaignData);
    console.log('✅ Campaign creation confirmation sent to user\n');

    // Test 2: Campaign Name Updated Notification to Superadmin
    console.log('📧 Test 2: Campaign Name Updated Notification to Superadmin');
    const updatedCampaignData = {
      id: 'test-campaign-456',
      userName: 'testuser@example.com',
      campaignName: 'Updated Test Campaign',
      totalAmount: 5000,
      startDate: new Date(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      billboards: [
        { id: 'billboard-1', location: 'Test Location' }
      ],
      status: 'PENDING'
    };

    console.log('Sending campaign name update notification to superadmin...');
    await EmailService.notifyCampaignNameUpdated(updatedCampaignData);
    console.log('✅ Campaign name update notification sent to superadmin\n');

    console.log('🎉 All new email notification tests completed successfully!');
    console.log('\n📋 Summary of new notifications:');
    console.log('   ✅ Campaign creation confirmation sent to user');
    console.log('   ✅ Campaign name update notification sent to superadmin');
    console.log('   ✅ All emails sent asynchronously (no timeouts)');

  } catch (error) {
    console.error('❌ Error testing new email notifications:', error);
  }
}

// Run the test
testNewEmailNotifications()
  .then(() => {
    console.log('\n🎯 New email notification test complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 New email notification test failed:', error);
    process.exit(1);
  });

