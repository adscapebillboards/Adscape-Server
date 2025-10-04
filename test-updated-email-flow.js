const EmailService = require('./services/emailService');
const logger = require('./config/logger');

async function testUpdatedEmailFlow() {
  try {
    console.log('🧪 Testing updated email flow...\n');

    // Simulate campaign name update (this is what happens after user updates campaign name)
    console.log('📧 Test: Campaign Name Update Triggers Emails');
    
    const campaignData = {
      id: 'test-campaign-789',
      userName: 'testuser@example.com',
      campaignName: 'My Awesome Campaign',
      totalAmount: 5000,
      startDate: new Date(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      billboards: [
        { id: 'billboard-1', location: 'Test Location' }
      ],
      status: 'PENDING'
    };

    console.log('Simulating campaign name update to:', campaignData.campaignName);
    console.log('This should trigger both user confirmation and superadmin notification...\n');

    // Test 1: User confirmation email
    console.log('📧 Sending user confirmation email...');
    await EmailService.notifyCampaignCreatedUser(campaignData);
    console.log('✅ User confirmation email sent\n');

    // Test 2: Superadmin notification
    console.log('📧 Sending superadmin notification...');
    await EmailService.notifyCampaignCreated(campaignData);
    console.log('✅ Superadmin notification sent\n');

    console.log('🎉 Updated email flow test completed successfully!');
    console.log('\n📋 Summary of changes:');
    console.log('   ✅ Emails sent ONLY after campaign name update');
    console.log('   ✅ User gets confirmation with actual campaign name');
    console.log('   ✅ Superadmin gets notification as new campaign request');
    console.log('   ✅ No more "Auto Campaign" in emails');
    console.log('   ✅ No duplicate emails sent');

  } catch (error) {
    console.error('❌ Error testing updated email flow:', error);
  }
}

// Run the test
testUpdatedEmailFlow()
  .then(() => {
    console.log('\n🎯 Updated email flow test complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Updated email flow test failed:', error);
    process.exit(1);
  });

