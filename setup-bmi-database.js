const { Pool } = require('pg');
require('dotenv').config();

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function setupBMIDatabase() {
  try {
    console.log('Setting up BMI database table...');
    
    // Read the SQL file
    const fs = require('fs');
    const path = require('path');
    const sqlFile = path.join(__dirname, 'create-bmi-table.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');
    
    // Execute the SQL
    await pool.query(sql);
    
    console.log('✅ BMI database table created successfully!');
    
    // Test the table by inserting a sample record
    const testQuery = `
      INSERT INTO bmi_data (device_id, height, weight, bmi, category, timestamp)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    
    const testValues = [
      'TEST-DEVICE-001',
      175.0,
      70.0,
      22.9,
      'Normal weight',
      new Date().toISOString()
    ];
    
    const result = await pool.query(testQuery, testValues);
    console.log('✅ Test record inserted:', result.rows[0]);
    
    // Clean up test record
    await pool.query('DELETE FROM bmi_data WHERE device_id = $1', ['TEST-DEVICE-001']);
    console.log('✅ Test record cleaned up');
    
  } catch (error) {
    console.error('❌ Error setting up BMI database:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the setup
if (require.main === module) {
  setupBMIDatabase()
    .then(() => {
      console.log('🎉 BMI database setup completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 BMI database setup failed:', error);
      process.exit(1);
    });
}

module.exports = setupBMIDatabase;

