const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function resetAdminPassword() {
  try {
    // Find the superadmin user
    const admin = await prisma.publisher.findFirst({
      where: {
        role: 'superadmin'
      }
    });

    if (!admin) {
      console.log('No superadmin found');
      return;
    }

    // Reset password
    const newPassword = 'admin123';
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    await prisma.publisher.update({
      where: {
        id: admin.id
      },
      data: {
        password: hashedPassword
      }
    });

    console.log('Admin password reset successfully:');
    console.log('Email:', admin.email);
    console.log('New Password:', newPassword);
    console.log('Role:', admin.role);

  } catch (error) {
    console.error('Error resetting admin password:', error);
  } finally {
    await prisma.$disconnect();
  }
}

resetAdminPassword(); 