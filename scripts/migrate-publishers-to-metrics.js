const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function migratePublishersToMetrics() {
  try {
    console.log('Starting migration of publishers to PublisherMetric table...');
    
    // Get all publishers
    const publishers = await prisma.publisher.findMany({
      orderBy: { id: 'asc' }
    });
    
    console.log(`Found ${publishers.length} publishers to migrate`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const publisher of publishers) {
      try {
        // Check if PublisherMetric already exists for this publisher
        const existingMetric = await prisma.publisherMetric.findUnique({
          where: { publisherId: publisher.id }
        });
        
        if (existingMetric) {
          console.log(`PublisherMetric already exists for publisher ${publisher.id} (${publisher.email})`);
          successCount++;
          continue;
        }
        
        // Create PublisherMetric entry
        const metric = await prisma.publisherMetric.create({
          data: {
            publisherId: publisher.id,
            totalBillboards: publisher.totalBillboards || 0,
            totalBookings: 0, // Will be calculated from campaigns
            totalRevenue: 0, // Will be calculated from campaigns
            joinDate: publisher.joinDate || new Date(),
            lastBooking: null,
            status: publisher.status || 'active',
            settings: {
              language: 'en',
              timezone: 'est',
              notifications: {
                email: true,
                sms: false,
                push: true
              },
              theme: 'light'
            }
          }
        });
        
        console.log(`✓ Created PublisherMetric for publisher ${publisher.id} (${publisher.email})`);
        successCount++;
        
      } catch (error) {
        console.error(`✗ Error creating PublisherMetric for publisher ${publisher.id} (${publisher.email}):`, error.message);
        errorCount++;
      }
    }
    
    console.log('\n=== Migration Summary ===');
    console.log(`Total publishers: ${publishers.length}`);
    console.log(`Successful migrations: ${successCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log('========================\n');
    
    if (errorCount > 0) {
      console.log('Some migrations failed. Please check the errors above.');
    } else {
      console.log('All publishers successfully migrated to PublisherMetric table!');
    }
    
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the migration
migratePublishersToMetrics();
















