const EmailService = require('./services/emailService');
const logger = require('./config/logger');

async function testCampaignData() {
  try {
    console.log('🧪 Testing campaign data for billboard notifications...\n');

    // Simulate the campaign data that would be passed from the controller
    const campaignData = {
      id: '4d66cfd9-8ea0-4254-886e-49da8b5298e1',
      userName: 'testuser@example.com', // This should be the user's email
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

    console.log('📧 Testing billboard approval notification with campaign data...');
    console.log('Campaign data:', JSON.stringify(campaignData, null, 2));
    
    await EmailService.notifyBillboardApproved(campaignData, billboardData);
    console.log('✅ Test completed');

  } catch (error) {
    console.error('❌ Error testing campaign data:', error);
  }
}

// Run the test
testCampaignData()
  .then(() => {
    console.log('\n🎯 Campaign data test complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Campaign data test failed:', error);
    process.exit(1);
  });

