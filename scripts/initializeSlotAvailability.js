const prisma = require('../db/db');
const logger = require('../config/logger');
const { 
  updateBillboardSlotAvailabilityJSON
} = require('../controllers/availabilityController');

/**
 * Initialize slot availability for all billboards in the database
 * Stores all 2 months of data in a single JSON field on each billboard
 * Format: { "DD.MM.YYYY": available_slots, ... }
 */
async function initializeAllBillboardSlots() {
  try {
    console.log('🚀 Starting slot availability initialization for all billboards...\n');

    // Get all approved billboards
    const billboards = await prisma.billboard.findMany({
      where: {
        status: 'APPROVED'
      },
      select: {
        id: true,
        name: true,
        location: true,
        max_slots_per_day: true
      }
    });

    console.log(`📊 Found ${billboards.length} approved billboards\n`);

    if (billboards.length === 0) {
      console.log('⚠️  No approved billboards found. Exiting.');
      return;
    }

    console.log(`📅 Generating 2 months of slot availability data for each billboard\n`);

    let successCount = 0;
    let errorCount = 0;

    // Process each billboard
    for (let i = 0; i < billboards.length; i++) {
      const billboard = billboards[i];
      const billboardId = String(billboard.id);
      
      try {
        console.log(`[${i + 1}/${billboards.length}] Processing billboard: ${billboardId}`);
        console.log(`   Name: ${billboard.name || 'N/A'}`);
        console.log(`   Location: ${billboard.location || 'N/A'}`);
        console.log(`   Max slots/day: ${billboard.max_slots_per_day || 8}`);

        // Use the helper function to update slot availability JSON
        await updateBillboardSlotAvailabilityJSON(billboardId);

        console.log(`   ✅ Slot availability JSON updated (2 months of data)\n`);
        successCount++;
      } catch (error) {
        console.error(`   ❌ Error processing billboard ${billboardId}:`, error.message);
        errorCount++;
        console.log('');
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 Initialization Summary:');
    console.log(`   Total billboards: ${billboards.length}`);
    console.log(`   ✅ Success: ${successCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log('='.repeat(60));

    if (errorCount === 0) {
      console.log('\n🎉 All billboards initialized successfully!');
    } else {
      console.log(`\n⚠️  Completed with ${errorCount} error(s).`);
    }

  } catch (error) {
    console.error('\n❌ Fatal error during initialization:', error);
    logger.error('Error initializing slot availability:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
if (require.main === module) {
  initializeAllBillboardSlots()
    .then(() => {
      console.log('\n✅ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { initializeAllBillboardSlots };
