const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

console.log('🔍 Azure PostgreSQL Connection Diagnostics\n');
console.log('=' .repeat(50));

// Check environment variables
console.log('\n1. Checking Environment Variables...');
const requiredVars = ['PGHOST', 'PGUSER', 'PGPASSWORD', 'PGPORT', 'PGDATABASE'];
const missingVars = requiredVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ Missing variables:', missingVars.join(', '));
} else {
  console.log('✅ All required variables are set');
  console.log(`   Host: ${process.env.PGHOST}`);
  console.log(`   User: ${process.env.PGUSER}`);
  console.log(`   Port: ${process.env.PGPORT}`);
  console.log(`   Database: ${process.env.PGDATABASE}`);
  console.log(`   Password: ${process.env.PGPASSWORD ? '***' + process.env.PGPASSWORD.slice(-3) : 'NOT SET'}`);
}

// Check if it's Azure
const isAzure = process.env.PGHOST?.includes('azure.com') || process.env.PGHOST?.includes('database.azure.com');
console.log(`\n2. Database Type: ${isAzure ? '☁️  Azure PostgreSQL' : '📦 Standard PostgreSQL'}`);

if (isAzure) {
  console.log('\n3. Azure-Specific Checks:');
  console.log('   ⚠️  Azure PostgreSQL requires:');
  console.log('      - Your IP address added to firewall rules');
  console.log('      - SSL connection (sslmode=require)');
  console.log('      - Correct server name (case-sensitive)');
  
  console.log('\n4. Firewall Configuration:');
  console.log('   To fix firewall issues:');
  console.log('   1. Go to Azure Portal');
  console.log('   2. Navigate to your PostgreSQL server');
  console.log('   3. Go to "Connection security" or "Networking"');
  console.log('   4. Add your current IP address');
  console.log('   5. Or enable "Allow Azure services" if deploying on Azure');
  
  // Try to get current IP (basic check)
  console.log('\n5. Current Connection Info:');
  console.log(`   Attempting to connect to: ${process.env.PGHOST}:${process.env.PGPORT}`);
}

// Test connection
console.log('\n6. Testing Connection...');
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 
        `postgresql://${process.env.PGUSER}:${process.env.PGPASSWORD}@${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}?sslmode=require`
    }
  }
});

prisma.$connect()
  .then(async () => {
    console.log('✅ Connection successful!');
    
    try {
      const result = await prisma.$queryRaw`SELECT version() as version`;
      console.log('✅ Database query successful');
      if (result && result[0]) {
        console.log(`   PostgreSQL version: ${result[0].version}`);
      }
    } catch (queryError) {
      console.error('⚠️  Connection works but query failed:', queryError.message);
    }
  })
  .catch((error) => {
    console.error('\n❌ Connection failed!');
    console.error(`   Error: ${error.message}`);
    
    if (error.message.includes("Can't reach database server")) {
      console.error('\n🔧 Common Solutions:');
      console.error('   1. Check firewall rules in Azure Portal');
      console.error('   2. Verify the server name is correct');
      console.error('   3. Check if the server is running');
      console.error('   4. Verify network connectivity');
      console.error('   5. Try connecting from Azure Cloud Shell to test');
    } else if (error.message.includes('password') || error.message.includes('authentication')) {
      console.error('\n🔧 Authentication Error:');
      console.error('   1. Verify username and password are correct');
      console.error('   2. Check if user has proper permissions');
      console.error('   3. Ensure password doesn\'t contain special characters that need encoding');
    } else if (error.message.includes('SSL')) {
      console.error('\n🔧 SSL Error:');
      console.error('   1. Azure PostgreSQL requires SSL');
      console.error('   2. Make sure sslmode=require is in connection string');
    }
  })
  .finally(async () => {
    await prisma.$disconnect();
    console.log('\n' + '='.repeat(50));
    console.log('Diagnostics complete');
  });





