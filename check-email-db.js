const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkEmailDatabase() {
  try {
    console.log('🔍 Checking email notification database...\n');

    // Check if tables exist
    console.log('📋 Checking table existence...');
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('email_notifications', 'superadmin_emails')
      ORDER BY table_name;
    `;
    
    console.log('✅ Tables found:', tables);

    // Check superadmin_emails table
    console.log('\n📧 Checking superadmin_emails table...');
    try {
      const superadminEmails = await prisma.superAdminEmail.findMany();
      console.log(`✅ Found ${superadminEmails.length} superadmin emails:`);
      superadminEmails.forEach(email => {
        console.log(`   - ${email.email} (${email.name}) - Active: ${email.isActive} - Types: ${email.notificationTypes.join(', ')}`);
      });
    } catch (error) {
      console.log('❌ Error accessing superadmin_emails:', error.message);
    }

    // Check email_notifications table
    console.log('\n📝 Checking email_notifications table...');
    try {
      const notifications = await prisma.emailNotification.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10
      });
      console.log(`✅ Found ${notifications.length} recent notifications:`);
      notifications.forEach(notification => {
        console.log(`   - ${notification.notificationType} to ${notification.recipientEmail} - Status: ${notification.status} - Created: ${notification.createdAt}`);
      });
    } catch (error) {
      console.log('❌ Error accessing email_notifications:', error.message);
    }

    // Check Prisma model availability
    console.log('\n🔧 Checking Prisma models...');
    console.log('Available models:', Object.keys(prisma));
    
    if (prisma.superAdminEmail) {
      console.log('✅ superAdminEmail model is available');
    } else {
      console.log('❌ superAdminEmail model is NOT available');
    }
    
    if (prisma.emailNotification) {
      console.log('✅ emailNotification model is available');
    } else {
      console.log('❌ emailNotification model is NOT available');
    }

  } catch (error) {
    console.error('❌ Error checking database:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the check
checkEmailDatabase()
  .then(() => {
    console.log('\n🎯 Database check complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Database check failed:', error);
    process.exit(1);
  });

