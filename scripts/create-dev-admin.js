const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function createDevAdmin() {
  try {
    const email = 'srinnivassh@gmail.com';
    const password = 'dev123456';
    const name = 'Developer Admin';
    const phone = '1234567890';
    const developerPermissions = {
      users: true,
      publishers: true,
      billboards: true,
      bookings: true,
      assets: true,
      actions: true,
      partners: true,
      systemSettings: true,
      developerMode: true,
      developerSettings: true,
      system: {
        developerMode: true,
        diagnostics: true,
        maintenance: true
      }
    };

    const existingAdmin = await prisma.publisher.findUnique({
      where: { email }
    });

    if (existingAdmin) {
      const updatedAdmin = await prisma.publisher.update({
        where: { email },
        data: {
          name: existingAdmin.name || name,
          phone: existingAdmin.phone || phone,
          role: 'developer',
          status: 'active',
          permissions: {
            ...(existingAdmin.permissions && typeof existingAdmin.permissions === 'object' ? existingAdmin.permissions : {}),
            ...developerPermissions
          }
        }
      });

      console.log('✅ Developer admin updated successfully!');
      console.log('Email:', updatedAdmin.email);
      console.log('Role:', updatedAdmin.role);
      console.log('Status:', updatedAdmin.status);
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create developer admin as a publisher with superadmin-equivalent access.
    const devAdmin = await prisma.publisher.create({
      data: {
        name,
        email,
        phone,
        password: hashedPassword,
        role: 'developer',
        status: 'active',
        joinDate: new Date(),
        location: 'Development',
        permissions: developerPermissions
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
