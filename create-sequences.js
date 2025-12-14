const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

async function createSequences() {
  console.log('🔧 Creating missing sequences...\n');

  try {
    // Check if sequences exist and create them if they don't
    const sequences = [
      {
        name: 'billboards_id_seq',
        description: 'Sequence for billboards.id'
      },
      {
        name: 'campaigns_id_seq',
        description: 'Sequence for campaigns.id'
      }
    ];

    for (const seq of sequences) {
      try {
        // Check if sequence exists
        const checkResult = await prisma.$queryRaw`
          SELECT EXISTS (
            SELECT 1 
            FROM pg_sequences 
            WHERE schemaname = 'public' 
            AND sequencename = ${seq.name}
          ) as exists
        `;

        const exists = checkResult[0]?.exists;

        if (exists) {
          console.log(`✅ Sequence ${seq.name} already exists`);
        } else {
          console.log(`📝 Creating sequence ${seq.name}...`);
          
          // Create sequence starting from 1
          await prisma.$executeRawUnsafe(`
            CREATE SEQUENCE IF NOT EXISTS ${seq.name}
            START WITH 1
            INCREMENT BY 1
            NO MINVALUE
            NO MAXVALUE
            CACHE 1;
          `);
          
          console.log(`✅ Created sequence ${seq.name}`);
        }
      } catch (error) {
        console.error(`❌ Error with sequence ${seq.name}:`, error.message);
      }
    }

    // Get current max IDs from tables to set sequence values appropriately
    console.log('\n📊 Setting sequence values based on existing data...');
    
    try {
      // Check billboards table
      const billboardMax = await prisma.$queryRaw`
        SELECT COALESCE(MAX(CAST(id AS INTEGER)), 0) as max_id 
        FROM billboards 
        WHERE id ~ '^[0-9]+$'
      `;
      
      if (billboardMax && billboardMax[0]?.max_id) {
        const maxId = parseInt(billboardMax[0].max_id) + 1;
        await prisma.$executeRawUnsafe(`
          SELECT setval('billboards_id_seq', ${maxId}, false);
        `);
        console.log(`✅ Set billboards_id_seq to ${maxId}`);
      }
    } catch (error) {
      console.log(`⚠️  Could not set billboards_id_seq value: ${error.message}`);
    }

    try {
      // Check campaigns table
      const campaignMax = await prisma.$queryRaw`
        SELECT COALESCE(MAX(CAST(id AS INTEGER)), 0) as max_id 
        FROM campaigns 
        WHERE id ~ '^[0-9]+$'
      `;
      
      if (campaignMax && campaignMax[0]?.max_id) {
        const maxId = parseInt(campaignMax[0].max_id) + 1;
        await prisma.$executeRawUnsafe(`
          SELECT setval('campaigns_id_seq', ${maxId}, false);
        `);
        console.log(`✅ Set campaigns_id_seq to ${maxId}`);
      }
    } catch (error) {
      console.log(`⚠️  Could not set campaigns_id_seq value: ${error.message}`);
    }

    console.log('\n✅ Sequence creation complete!');
    console.log('You can now run: npx prisma db push');

  } catch (error) {
    console.error('\n❌ Error creating sequences:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

createSequences()
  .then(() => {
    console.log('\n✨ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Failed:', error);
    process.exit(1);
  });





