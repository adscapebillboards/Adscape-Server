const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({
  connectionString: 'postgresql://avnadmin:AVNS_07USf4r803Jrdm6vAva@billboard-srinnivassh-7657.l.aivencloud.com:16921/defaultdb?sslmode=require',
  ssl: {
    rejectUnauthorized: false
  }
});

// Setup endpoint to create superadmin table
router.post('/setup-superadmin-table', async (req, res) => {
  try {
    console.log('🔧 Setting up SuperAdmin table...');

    // Create the superadmins table
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS superadmins (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        full_name VARCHAR(255),
        phone_number VARCHAR(20),
        role VARCHAR(50) DEFAULT 'manager' CHECK (role IN ('superadmin', 'manager', 'support')),
        status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
        permissions JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    await pool.query(createTableQuery);
    console.log('✅ Superadmins table created');

    // Create indexes
    const createIndexesQuery = `
      CREATE INDEX IF NOT EXISTS idx_superadmins_email ON superadmins(email);
      CREATE INDEX IF NOT EXISTS idx_superadmins_role ON superadmins(role);
      CREATE INDEX IF NOT EXISTS idx_superadmins_status ON superadmins(status);
    `;

    await pool.query(createIndexesQuery);
    console.log('✅ Indexes created');

    // Insert default users
    const insertUserQuery = `
      INSERT INTO superadmins (email, password, full_name, phone_number, role, status, permissions)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (email) DO NOTHING;
    `;

    // Create default superadmin
    const adminPassword = await bcrypt.hash('admin123', 10);
    await pool.query(insertUserQuery, [
      'admin@billboards.com',
      adminPassword,
      'System Administrator',
      '+1234567890',
      'superadmin',
      'active',
      '{}'
    ]);

    // Create default manager
    const managerPassword = await bcrypt.hash('manager123', 10);
    await pool.query(insertUserQuery, [
      'manager@billboards.com',
      managerPassword,
      'System Manager',
      '+1234567891',
      'manager',
      'active',
      '{}'
    ]);

    // Create default support
    const supportPassword = await bcrypt.hash('support123', 10);
    await pool.query(insertUserQuery, [
      'support@billboards.com',
      supportPassword,
      'System Support',
      '+1234567892',
      'support',
      'active',
      '{}'
    ]);

    console.log('✅ Default users created');

    res.json({ 
      success: true, 
      message: 'SuperAdmin table setup completed successfully',
      users: [
        { email: 'admin@billboards.com', password: 'admin123', role: 'superadmin' },
        { email: 'manager@billboards.com', password: 'manager123', role: 'manager' },
        { email: 'support@billboards.com', password: 'support123', role: 'support' }
      ]
    });

  } catch (error) {
    console.error('❌ Setup error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router;
