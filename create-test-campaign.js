const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');
const prisma = new PrismaClient();

// Create a test campaign with multiple billboards
async function createTestCampaign() {
  try {
    console.log('🧪 Creating Test Campaign with Multiple Billboards...\n');

    const campaignId = uuidv4();
    const testBillboards = [
      {
        id: 'test-billboard-1',
        location: 'Test Location 1',
        city: 'Chennai',
        pricePerDay: 1000,
        totalPrice: 5000,
        bookingDetails: {
          startDate: '2025-01-20',
          endDate: '2025-01-24'
        },
        files: ['https://example.com/test1.jpg'],
        owner: 'Test Owner 1',
        screen_id: 'SCREEN_001',
        userName: 'srinnivassh@gmail.com',
        status: 'PENDING',
        createDate: new Date().toISOString(),
        endDate: '2025-01-24',
        billboardCampaignId: `${campaignId}_test-billboard-1`
      },
      {
        id: 'test-billboard-2',
        location: 'Test Location 2',
        city: 'Salem',
        pricePerDay: 1200,
        totalPrice: 6000,
        bookingDetails: {
          startDate: '2025-01-20',
          endDate: '2025-01-24'
        },
        files: ['https://example.com/test2.jpg'],
        owner: 'Test Owner 2',
        screen_id: 'SCREEN_002',
        userName: 'srinnivassh@gmail.com',
        status: 'PENDING',
        createDate: new Date().toISOString(),
        endDate: '2025-01-24',
        billboardCampaignId: `${campaignId}_test-billboard-2`
      },
      {
        id: 'test-billboard-3',
        location: 'Test Location 3',
        city: 'Coimbatore',
        pricePerDay: 1500,
        totalPrice: 7500,
        bookingDetails: {
          startDate: '2025-01-20',
          endDate: '2025-01-24'
        },
        files: ['https://example.com/test3.jpg'],
        owner: 'Test Owner 3',
        screen_id: 'SCREEN_003',
        userName: 'srinnivassh@gmail.com',
        status: 'PENDING',
        createDate: new Date().toISOString(),
        endDate: '2025-01-24',
        billboardCampaignId: `${campaignId}_test-billboard-3`
      }
    ];

    const totalAmount = testBillboards.reduce((sum, b) => sum + b.totalPrice, 0);

    const campaign = await prisma.campaign.create({
      data: {
        id: campaignId,
        userName: 'srinnivassh@gmail.com',
        campaignName: 'Test Multi-Billboard Campaign',
        status: 'PENDING',
        totalAmount,
        startDate: new Date('2025-01-20'),
        endDate: new Date('2025-01-24'),
        billboards: testBillboards
      }
    });

    console.log('✅ Test campaign created successfully!');
    console.log(`   Campaign ID: ${campaign.id}`);
    console.log(`   Status: ${campaign.status}`);
    console.log(`   Name: ${campaign.campaignName}`);
    console.log(`   Total Amount: ${campaign.totalAmount}`);
    console.log(`   Billboards: ${testBillboards.length}`);
    
    testBillboards.forEach((billboard, index) => {
      console.log(`     ${index + 1}. ${billboard.id} - Status: ${billboard.status} - City: ${billboard.city}`);
    });

    console.log('\n🎯 Test campaign ready for approval testing!');

  } catch (error) {
    console.error('❌ Error creating test campaign:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the creation
if (require.main === module) {
  createTestCampaign();
}

