/*
  Creates notifications table if it doesn't exist.
  Run: node scripts/create-notifications-table.js
*/
const prisma = require('../db/db');

async function main() {
  try {
    await prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS notifications (id SERIAL PRIMARY KEY, recipient_email VARCHAR(255), recipient_role VARCHAR(50), type VARCHAR(100) NOT NULL, title VARCHAR(300) NOT NULL, message TEXT, entity_type VARCHAR(50), entity_id VARCHAR(100), is_read BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT NOW())'
    );
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_email, recipient_role)');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at)');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read)');
    console.log('Notifications table ensured.');
  } catch (e) {
    console.error('Failed to create notifications table:', e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();


