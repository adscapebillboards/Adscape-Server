const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function addPermissionsColumn() {
  try {
    console.log('🔌 Connecting to DB...');
    await prisma.$connect();
    
    console.log('🛠️ Adding permissions column to publishers...');
    await prisma.$executeRawUnsafe('ALTER TABLE publishers ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT \'{}\'');
    
    console.log('✅ Success!');
  } catch (error) {
    console.error('❌ Failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

addPermissionsColumn();
