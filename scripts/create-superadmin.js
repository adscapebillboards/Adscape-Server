const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function createSuperAdmin() {
  try {
    // Check if superadmin already exists
    const existingAdmin = await prisma.publisher.findFirst({
      where: {
        role: 'superadmin'
      }
    });

    if (existingAdmin) {
      console.log('Superadmin already exists:', existingAdmin.email);
      return;
    }

    // Create superadmin user
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    const superAdmin = await prisma.publisher.create({
      data: {
        name: 'Super Admin',
        email: 'admin@billboardhub.com',
        phone: '1234567890',
        password: hashedPassword,
        role: 'superadmin',
        status: 'active',
        joinDate: new Date()
      }
    });

    console.log('Superadmin created successfully:');
    console.log('Email:', superAdmin.email);
    console.log('Password: admin123');
    console.log('Role:', superAdmin.role);

  } catch (error) {
    console.error('Error creating superadmin:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createSuperAdmin(); 