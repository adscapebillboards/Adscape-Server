const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const checkDatabase = async () => {
  console.log('🔍 Checking Database Structure...\n');

  try {
    // Test database connection
    console.log('1. Testing database connection...');
    await prisma.$connect();
    console.log('✅ Database connected successfully');

    // Check if superadmin table exists
    console.log('\n2. Checking superadmin table...');
    try {
      const superadmins = await prisma.superAdmin.findMany({
        take: 1
      });
      console.log('✅ SuperAdmin table exists and is accessible');
      console.log(`   Found ${superadmins.length} superadmin users`);
    } catch (error) {
      console.log('❌ SuperAdmin table error:', error.message);
    }

    // Check table structure by trying to create a test record
    console.log('\n3. Testing table structure...');
    try {
      const testUser = await prisma.superAdmin.create({
        data: {
          email: 'test@example.com',
          password: 'hashedpassword',
          fullName: 'Test User',
          phoneNumber: '+1234567890',
          role: 'manager',
          status: 'active',
          permissions: {}
        }
      });
      console.log('✅ Table structure is correct');
      console.log(`   Created test user with ID: ${testUser.id}`);

      // Clean up test user
      await prisma.superAdmin.delete({
        where: { id: testUser.id }
      });
      console.log('   Test user cleaned up');

    } catch (error) {
      console.log('❌ Table structure error:', error.message);
    }

    // Check if there are any existing superadmin users
    console.log('\n4. Checking existing superadmin users...');
    try {
      const allSuperadmins = await prisma.superAdmin.findMany({
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          status: true
        }
      });
      
      if (allSuperadmins.length > 0) {
        console.log(`✅ Found ${allSuperadmins.length} superadmin users:`);
        allSuperadmins.forEach(user => {
          console.log(`   - ${user.fullName} (${user.email}) - ${user.role} - ${user.status}`);
        });
      } else {
        console.log('⚠️  No superadmin users found');
        console.log('   You may need to create the initial superadmin user');
      }
    } catch (error) {
      console.log('❌ Error fetching superadmin users:', error.message);
    }

    console.log('\n✅ Database check completed!');

  } catch (error) {
    console.error('❌ Database check failed:', error.message);
  } finally {
    await prisma.$disconnect();
  }
};

checkDatabase();

