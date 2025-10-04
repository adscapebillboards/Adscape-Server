const EmailService = require('./services/emailService');
const logger = require('./config/logger');

async function testEmailNotifications() {
  try {
    console.log('🧪 Testing email notifications...\n');

    // Test 1: Campaign Created Notification
    console.log('📧 Test 1: Campaign Created Notification');
    const campaignData = {
      id: 'test-campaign-123',
      userName: 'testuser@example.com',
      campaignName: 'Test Campaign',
      totalAmount: 5000,
      startDate: new Date(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      billboards: [
        { id: 'billboard-1', location: 'Test Location' }
      ],
      status: 'pending'
    };

    console.log('Sending campaign created notification...');
    await EmailService.notifyCampaignCreated(campaignData);
    console.log('✅ Campaign created notification sent\n');

    // Test 2: Billboard Approved Notification
    console.log('📧 Test 2: Billboard Approved Notification');
    const billboardData = {
      location: 'Test Billboard Location',
      city: 'Test City',
      pricePerDay: 500,
      totalPrice: 3500,
      bookingDetails: {
        startDate: new Date(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    };

    console.log('Sending billboard approved notification...');
    await EmailService.notifyBillboardApproved(campaignData, billboardData);
    console.log('✅ Billboard approved notification sent\n');

    // Test 3: Billboard Rejected Notification
    console.log('📧 Test 3: Billboard Rejected Notification');
    const rejectionReason = 'Image quality does not meet our standards';

    console.log('Sending billboard rejected notification...');
    await EmailService.notifyBillboardRejected(campaignData, billboardData, rejectionReason);
    console.log('✅ Billboard rejected notification sent\n');

    console.log('🎉 All email notification tests completed successfully!');

  } catch (error) {
    console.error('❌ Error testing email notifications:', error);
  }
}

// Run the test
testEmailNotifications()
  .then(() => {
    console.log('\n🎯 Email notification test complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Email notification test failed:', error);
    process.exit(1);
  });

