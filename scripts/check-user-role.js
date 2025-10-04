const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkUserRole(email) {
  try {
    const user = await prisma.publisher.findUnique({
      where: { email }
    });

    if (!user) {
      console.log('User not found:', email);
      return;
    }

    console.log('User found:');
    console.log('Full user object:', JSON.stringify(user, null, 2));

  } catch (error) {
    console.error('Error checking user role:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Check the admin user
checkUserRole('Adscape@hub.in'); 