const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkTriggers() {
  try {
    console.log('🔍 Checking database triggers...');
    
    // Check if campaign triggers exist
    const triggers = await prisma.$queryRaw`
      SELECT 
        trigger_name, 
        event_manipulation, 
        event_object_table,
        action_statement
      FROM information_schema.triggers 
      WHERE trigger_name LIKE '%campaign%'
    `;
    
    console.log('\n📋 Campaign triggers found:');
    if (triggers.length === 0) {
      console.log('❌ No campaign triggers found!');
      console.log('   This means the automation system is not installed.');
    } else {
      triggers.forEach(trigger => {
        console.log(`   ✅ ${trigger.trigger_name} on ${trigger.event_object_table}.${trigger.event_manipulation}`);
      });
    }
    
    // Check if functions exist
    const functions = await prisma.$queryRaw`
      SELECT routine_name, routine_type
      FROM information_schema.routines 
      WHERE routine_name LIKE '%campaign%'
    `;
    
    console.log('\n🔧 Campaign functions found:');
    if (functions.length === 0) {
      console.log('❌ No campaign functions found!');
    } else {
      functions.forEach(func => {
        console.log(`   ✅ ${func.routine_name} (${func.routine_type})`);
      });
    }
    
    // Check campaign table structure
    const campaigns = await prisma.campaign.findFirst({
      select: {
        id: true,
        status: true,
        billboards: true
      }
    });
    
    if (campaigns) {
      console.log('\n📊 Sample campaign data:');
      console.log(`   ID: ${campaigns.id}`);
      console.log(`   Status: ${campaigns.status}`);
      console.log(`   Billboards type: ${typeof campaigns.billboards}`);
      if (Array.isArray(campaigns.billboards)) {
        console.log(`   Billboard count: ${campaigns.billboards.length}`);
        if (campaigns.billboards.length > 0) {
          const sample = campaigns.billboards[0];
          console.log(`   Sample billboard structure:`, {
            id: sample.id,
            status: sample.status,
            hasBookingDetails: !!sample.bookingDetails,
            hasFiles: !!sample.files,
            hasScreenId: !!sample.screen_id
          });
        }
      }
    } else {
      console.log('\n❌ No campaigns found in database');
    }
    
  } catch (error) {
    console.error('❌ Error checking database:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkTriggers();
