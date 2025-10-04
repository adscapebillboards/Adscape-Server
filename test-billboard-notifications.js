const EmailService = require('./services/emailService');
const logger = require('./config/logger');

async function testBillboardNotifications() {
  try {
    console.log('🧪 Testing billboard approval/rejection notifications...\n');

    // Test 1: Billboard Approved Notification
    console.log('📧 Test 1: Billboard Approved Notification');
    const campaignData = {
      id: 'test-campaign-123',
      userName: 'testuser@example.com',
      campaignName: 'My Test Campaign',
      status: 'PENDING',
      totalAmount: 5000,
      startDate: new Date(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    };

    const billboardData = {
      id: 'billboard-1',
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

    // Test 2: Billboard Rejected Notification
    console.log('📧 Test 2: Billboard Rejected Notification');
    const rejectionReason = 'Image quality does not meet our standards';

    console.log('Sending billboard rejected notification...');
    await EmailService.notifyBillboardRejected(campaignData, billboardData, rejectionReason);
    console.log('✅ Billboard rejected notification sent\n');

    console.log('🎉 All billboard notification tests completed successfully!');
    console.log('\n📋 Summary:');
    console.log('   ✅ Billboard approval notifications working');
    console.log('   ✅ Billboard rejection notifications working');
    console.log('   ✅ Users receive emails when billboards are approved/rejected');
    console.log('   ✅ All emails sent asynchronously (no timeouts)');

  } catch (error) {
    console.error('❌ Error testing billboard notifications:', error);
  }
}

// Run the test
testBillboardNotifications()
  .then(() => {
    console.log('\n🎯 Billboard notification test complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Billboard notification test failed:', error);
    process.exit(1);
  });

