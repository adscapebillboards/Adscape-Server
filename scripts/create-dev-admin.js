const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function createDevAdmin() {
  try {
    const email = 'dev@adscape.com';
    const password = 'dev123456';
    const name = 'Dev Admin';
    const phone = '1234567890';

    // Check if dev admin already exists
    const existingAdmin = await prisma.publisher.findUnique({
      where: { email }
    });

    if (existingAdmin) {
      console.log('⚠️  Dev admin already exists!');
      console.log('Email:', existingAdmin.email);
      console.log('Role:', existingAdmin.role);
      console.log('Status:', existingAdmin.status);
      console.log('\nTo reset password, delete the account first or use a different email.');
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create dev admin as a publisher with superadmin role
    const devAdmin = await prisma.publisher.create({
      data: {
        name,
        email,
        phone,
        password: hashedPassword,
        role: 'superadmin',
        status: 'active',
        joinDate: new Date(),
        location: 'Development'
      }
    });

    console.log('✅ Dev admin created successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📧 Email:', devAdmin.email);
    console.log('🔑 Password:', password);
    console.log('👤 Name:', devAdmin.name);
    console.log('🎭 Role:', devAdmin.role);
    console.log('📱 Phone:', devAdmin.phone);
    console.log('✅ Status:', devAdmin.status);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n💡 You can now use these credentials to log in.');

  } catch (error) {
    console.error('❌ Error creating dev admin:', error);
    if (error.code === 'P2002') {
      console.error('⚠️  A publisher with this email already exists.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
createDevAdmin();
