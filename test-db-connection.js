const prisma = require('./db/db');

async function testConnection() {
  console.log('🔍 Testing Database Connection...\n');
  
  try {
    console.log('1. Attempting to connect...');
    await prisma.$connect();
    console.log('✅ Connected successfully!\n');
    
    console.log('2. Testing a simple query...');
    const result = await prisma.$queryRaw`SELECT 1 as test`;
    console.log('✅ Query test passed:', result);
    
    console.log('3. Testing User table access...');
    const userCount = await prisma.user.count();
    console.log(`✅ User table accessible. Total users: ${userCount}\n`);
    
    console.log('✅ All database tests passed!');
    
  } catch (error) {
    console.error('\n❌ Database connection failed!\n');
    console.error('Error:', error.message);
    console.error('Code:', error.code);
    if (error.meta) {
      console.error('Meta:', JSON.stringify(error.meta, null, 2));
    }
    
    console.error('\n📋 Troubleshooting steps:');
    console.error('1. Check if .env file exists in Server directory');
    console.error('2. Verify DATABASE_URL is set, OR');
    console.error('3. Verify all PostgreSQL variables are set:');
    console.error('   - PGHOST');
    console.error('   - PGUSER');
    console.error('   - PGPASSWORD');
    console.error('   - PGPORT');
    console.error('   - PGDATABASE');
    console.error('4. For Azure PostgreSQL databases:');
    console.error('   a. Check Azure Portal -> Your Database -> Connection Security');
    console.error('   b. Add your current IP address to firewall rules');
    console.error('   c. Enable "Allow Azure services and resources" if applicable');
    console.error('   d. Verify the server name matches exactly (case-sensitive)');
    console.error('5. Test network connectivity:');
    console.error('   - Try: telnet <hostname> <port>');
    console.error('   - Or: nc -zv <hostname> <port>');
    console.error('6. Verify credentials are correct');
    console.error('7. Check if database server is running and accessible');
    
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

testConnection();

