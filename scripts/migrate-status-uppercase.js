/*
  One-off migration to uppercase status fields across relevant tables.
  - Billboards.status
  - Registrations.status

  Run with:
    node server/scripts/migrate-status-uppercase.js | cat
*/

const prisma = require('../db/db');

async function migrateBillboards() {
  // Use raw SQL to uppercase all statuses in place
  const result = await prisma.$executeRawUnsafe('UPDATE "billboards" SET "status" = UPPER("status")');
  return result; // number of rows affected
}

async function migrateRegistrations() {
  try {
    const result = await prisma.$executeRawUnsafe('UPDATE "registrations" SET "status" = UPPER("status")');
    return result;
  } catch (e) {
    // If table doesn't exist in this environment, skip gracefully
    return 0;
  }
}

async function main() {
  try {
    const [billboardsCount, registrationsCount] = await Promise.all([
      migrateBillboards(),
      migrateRegistrations()
    ]);
    console.log(`Billboards updated: ${billboardsCount}`);
    console.log(`Registrations updated: ${registrationsCount}`);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();


