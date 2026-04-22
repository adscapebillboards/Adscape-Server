const prisma = require('../db/db');
const logger = require('../config/logger');
const { 
  generateAvailabilityForAllBillboards
} = require('../controllers/availabilityController');

/**
 * Initialize slot availability for all billboards in the database
 * Stores all 2 months of data in a single JSON field on each billboard
 * Format: { "DD.MM.YYYY": available_slots, ... }
 */
async function initializeAllBillboardSlots() {
  try {
    console.log('🚀 Starting slot availability initialization for all billboards...\n');
    const result = await generateAvailabilityForAllBillboards(2);

    console.log('\n' + '='.repeat(60));
    console.log('📊 Initialization Summary:');
    console.log(`   Date range: ${result.start} to ${result.end}`);
    console.log(`   Total billboards: ${result.totalBillboards}`);
    console.log(`   ✅ Success: ${result.success}`);
    console.log(`   ❌ Errors: ${result.failed}`);
    console.log('='.repeat(60));

    if (result.failed === 0) {
      console.log('\n🎉 All billboards initialized successfully!');
    } else {
      console.log(`\n⚠️  Completed with ${result.failed} error(s).`);
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
