#!/usr/bin/env node

/**
 * Migration script to transition from old app.js structure to new organized structure
 * Run this script to backup the old app.js and replace it with the new organized version
 */

const fs = require('fs');
const path = require('path');

console.log('🚀 Starting migration to new API structure...');

// Backup the old app.js
const oldAppPath = path.join(__dirname, '..', 'app.js');
const backupPath = path.join(__dirname, '..', 'app-backup.js');
const newAppPath = path.join(__dirname, '..', 'app-new.js');

try {
  // Check if old app.js exists
  if (fs.existsSync(oldAppPath)) {
    // Create backup
    fs.copyFileSync(oldAppPath, backupPath);
    console.log('✅ Old app.js backed up to app-backup.js');
    
    // Replace with new app.js
    if (fs.existsSync(newAppPath)) {
      fs.copyFileSync(newAppPath, oldAppPath);
      console.log('✅ New organized app.js installed');
      
      // Remove the temporary new app file
      fs.unlinkSync(newAppPath);
      console.log('✅ Cleaned up temporary files');
    } else {
      console.error('❌ app-new.js not found. Please ensure it exists.');
      process.exit(1);
    }
  } else {
    console.error('❌ app.js not found in the current directory');
    process.exit(1);
  }
  
  console.log('\n🎉 Migration completed successfully!');
  console.log('\n📋 Next steps:');
  console.log('1. Add logging environment variables to your .env file:');
  console.log('   ENABLE_LOGGING=true');
  console.log('   LOG_LEVEL=INFO');
  console.log('2. Test your endpoints to ensure they work correctly');
  console.log('3. Monitor the logs to verify the new logging system is working');
  console.log('4. If everything works, you can delete app-backup.js');
  console.log('\n📖 Check README-API-ORGANIZATION.md for detailed documentation');
  
} catch (error) {
  console.error('❌ Migration failed:', error.message);
  process.exit(1);
} 