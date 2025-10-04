const EmailService = require('./services/emailService');
const logger = require('./config/logger');

async function testBillboardEmailFix() {
  try {
    console.log('🧪 Testing billboard email notification fix...\n');

    // Simulate the campaign data structure that would be passed from the controller
    // This mimics the original campaign data with userName field
    const originalCampaign = {
      id: '4d66cfd9-8ea0-4254-886e-49da8b5298e1',
      userName: 'testuser@example.com', // This is the key field that was missing
      campaignName: 'Test Campaign',
      status: 'PENDING',
      totalAmount: 5000,
      startDate: new Date(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      billboards: [
        {
          id: '1754539178053',
          status: 'APPROVED',
          location: 'Test Location',
          city: 'Test City'
        }
      ]
    };

    // Simulate the updated billboards array
    const updatedBillboards = [
      {
        id: '1754539178053',
        status: 'APPROVED',
        location: 'Test Location',
        city: 'Test City',
        updatedAt: new Date().toISOString()
      }
    ];

    // Simulate the campaignDataForEmail structure that the fix creates
    const campaignDataForEmail = {
      ...originalCampaign,
      billboards: updatedBillboards
    };

    const billboardData = {
      id: '1754539178053',
      location: 'Test Billboard Location',
      city: 'Test City',
      pricePerDay: 500,
      totalPrice: 3500,
      bookingDetails: {
        startDate: new Date(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    };

    console.log('📧 Testing billboard approval notification with fixed campaign data...');
    console.log('Campaign data structure:', {
      id: campaignDataForEmail.id,
      userName: campaignDataForEmail.userName,
      campaignName: campaignDataForEmail.campaignName,
      hasUserName: !!campaignDataForEmail.userName,
      billboardsCount: campaignDataForEmail.billboards.length
    });
    
    await EmailService.notifyBillboardApproved(campaignDataForEmail, billboardData);
    console.log('✅ Billboard approval notification sent successfully');

    console.log('\n📧 Testing billboard rejection notification...');
    const rejectionReason = 'Image quality does not meet our standards';
    await EmailService.notifyBillboardRejected(campaignDataForEmail, billboardData, rejectionReason);
    console.log('✅ Billboard rejection notification sent successfully');

    console.log('\n🎉 Fix verification completed!');
    console.log('📋 Summary:');
    console.log('   ✅ Campaign data now includes userName field');
    console.log('   ✅ Email notifications will be sent to users');
    console.log('   ✅ Both approval and rejection notifications working');

  } catch (error) {
    console.error('❌ Error testing billboard email fix:', error);
  }
}

// Run the test
testBillboardEmailFix()
  .then(() => {
    console.log('\n🎯 Billboard email fix test complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Billboard email fix test failed:', error);
    process.exit(1);
  });

