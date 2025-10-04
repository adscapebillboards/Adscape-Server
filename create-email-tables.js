const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function createEmailTables() {
  try {
    console.log('🚀 Starting to create email notification tables...');
    
    // Create email_notifications table
    console.log('🗄️ Creating email_notifications table...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS email_notifications (
        id SERIAL PRIMARY KEY,
        notification_type VARCHAR(100) NOT NULL,
        recipient_email VARCHAR(255) NOT NULL,
        subject VARCHAR(500) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        message_id VARCHAR(255),
        error_message TEXT,
        data JSONB,
        sent_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    console.log('✅ email_notifications table created');
    
    // Create indexes for email_notifications
    console.log('📊 Creating indexes for email_notifications...');
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_email_notifications_type ON email_notifications(notification_type);
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_email_notifications_status ON email_notifications(status);
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_email_notifications_recipient ON email_notifications(recipient_email);
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_email_notifications_created_at ON email_notifications(created_at);
    `);
    console.log('✅ Indexes created for email_notifications');
    
    // Create function for updating timestamps
    console.log('⚙️ Creating timestamp update function...');
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);
    console.log('✅ Timestamp function created');
    
    // Create trigger for email_notifications
    console.log('🔗 Creating trigger for email_notifications...');
    await prisma.$executeRawUnsafe(`
      DROP TRIGGER IF EXISTS update_email_notifications_updated_at ON email_notifications;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER update_email_notifications_updated_at 
        BEFORE UPDATE ON email_notifications 
        FOR EACH ROW 
        EXECUTE FUNCTION update_updated_at_column();
    `);
    console.log('✅ Trigger created for email_notifications');
    
    // Create superadmin_emails table
    console.log('🗄️ Creating superadmin_emails table...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS superadmin_emails (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        name VARCHAR(255),
        is_active BOOLEAN DEFAULT true,
        notification_types TEXT[],
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    console.log('✅ superadmin_emails table created');
    
    // Create indexes for superadmin_emails
    console.log('📊 Creating indexes for superadmin_emails...');
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_superadmin_emails_active ON superadmin_emails(is_active);
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_superadmin_emails_email ON superadmin_emails(email);
    `);
    console.log('✅ Indexes created for superadmin_emails');
    
    // Create trigger for superadmin_emails
    console.log('🔗 Creating trigger for superadmin_emails...');
    await prisma.$executeRawUnsafe(`
      DROP TRIGGER IF EXISTS update_superadmin_emails_updated_at ON superadmin_emails;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER update_superadmin_emails_updated_at 
        BEFORE UPDATE ON superadmin_emails 
        FOR EACH ROW 
        EXECUTE FUNCTION update_updated_at_column();
    `);
    console.log('✅ Trigger created for superadmin_emails');
    
    // Insert default superadmin emails
    console.log('📧 Inserting default superadmin emails...');
    await prisma.$executeRawUnsafe(`
      INSERT INTO superadmin_emails (email, name, notification_types) VALUES
      ('adscapebillboards@gmail.com', 'Main Admin', ARRAY['campaignCreated', 'publisherAccountCreated', 'billboardVerificationRequest']),
      ('admin@billboards.com', 'Secondary Admin', ARRAY['campaignCreated', 'publisherAccountCreated', 'billboardVerificationRequest'])
      ON CONFLICT (email) DO NOTHING;
    `);
    console.log('✅ Default superadmin emails inserted');
    
    // Insert sample notification types
    console.log('📝 Inserting sample notification types...');
    await prisma.$executeRawUnsafe(`
      INSERT INTO email_notifications (notification_type, recipient_email, subject, status, data) VALUES
      ('campaignCreated', 'admin@billboards.com', '🎯 New Campaign Created - Action Required', 'sent', '{"sample": "data"}'),
      ('billboardApproved', 'user@example.com', '✅ Campaign Billboard Approved Successfully!', 'sent', '{"sample": "data"}'),
      ('billboardRejected', 'user@example.com', '❌ Campaign Billboard Rejected - Action Required', 'sent', '{"sample": "data"}'),
      ('publisherAccountCreated', 'admin@billboards.com', '🏢 New Publisher Account Created - Review Required', 'sent', '{"sample": "data"}'),
      ('billboardVerificationRequest', 'admin@billboards.com', '📺 New Billboard Verification Request - Review Required', 'sent', '{"sample": "data"}')
      ON CONFLICT DO NOTHING;
    `);
    console.log('✅ Sample notification types inserted');
    
    console.log('🎉 All tables created successfully!');
    
    // Verify tables exist
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('email_notifications', 'superadmin_emails')
      ORDER BY table_name;
    `;
    
    console.log('📋 Created tables:', tables);
    
    // Check record counts
    const emailCount = await prisma.$queryRaw`SELECT COUNT(*) as count FROM superadmin_emails;`;
    const notificationCount = await prisma.$queryRaw`SELECT COUNT(*) as count FROM email_notifications;`;
    
    console.log('📊 Record counts:');
    console.log(`   - superadmin_emails: ${emailCount[0].count} records`);
    console.log(`   - email_notifications: ${notificationCount[0].count} records`);
    
  } catch (error) {
    console.error('❌ Error creating tables:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
createEmailTables()
  .then(() => {
    console.log('🎯 Email notification system setup complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Setup failed:', error);
    process.exit(1);
  });
