const { Pool } = require('pg');
const bcrypt = require('bcrypt');

// Database connection
const pool = new Pool({
  connectionString: 'postgresql://avnadmin:AVNS_07USf4r803Jrdm6vAva@billboard-srinnivassh-7657.l.aivencloud.com:16921/defaultdb?sslmode=require',
  ssl: {
    rejectUnauthorized: false
  }
});

async function createSuperAdminTable() {
  const client = await pool.connect();
  
  try {
    console.log('Creating superadmin table...');
    
    // Create superadmin table
    await client.query(`
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
    `);

    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_superadmins_email ON superadmins(email);
      CREATE INDEX IF NOT EXISTS idx_superadmins_role ON superadmins(role);
      CREATE INDEX IF NOT EXISTS idx_superadmins_status ON superadmins(status);
    `);

    console.log('Superadmin table created successfully!');

    // Check if default superadmin exists
    const existingAdmin = await client.query(
      'SELECT id FROM superadmins WHERE email = $1',
      ['admin@billboards.com']
    );

    if (existingAdmin.rows.length === 0) {
      console.log('Creating default superadmin user...');
      
      // Hash password
      const hashedPassword = await bcrypt.hash('admin123', 10);
      
      // Insert default superadmin
      await client.query(`
        INSERT INTO superadmins (email, password, full_name, phone_number, role, status, permissions)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        'admin@billboards.com',
        hashedPassword,
        'Super Administrator',
        '+1234567890',
        'superadmin',
        'active',
        JSON.stringify({
          viewDashboard: true,
          manageBillboards: true,
          approveCreatives: true,
          managePublishers: true,
          manageUsers: true,
          systemSettings: true
        })
      ]);

      console.log('Default superadmin user created successfully!');
      console.log('Email: admin@billboards.com');
      console.log('Password: admin123');
    } else {
      console.log('Default superadmin user already exists.');
    }

    // Create a sample manager user
    const existingManager = await client.query(
      'SELECT id FROM superadmins WHERE email = $1',
      ['manager@billboards.com']
    );

    if (existingManager.rows.length === 0) {
      console.log('Creating sample manager user...');
      
      const hashedManagerPassword = await bcrypt.hash('manager123', 10);
      
      await client.query(`
        INSERT INTO superadmins (email, password, full_name, phone_number, role, status, permissions)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        'manager@billboards.com',
        hashedManagerPassword,
        'John Manager',
        '+1234567891',
        'manager',
        'active',
        JSON.stringify({
          viewDashboard: true,
          manageBillboards: true,
          approveCreatives: true,
          managePublishers: false,
          manageUsers: false,
          systemSettings: false
        })
      ]);

      console.log('Sample manager user created successfully!');
      console.log('Email: manager@billboards.com');
      console.log('Password: manager123');
    }

    // Create a sample support user
    const existingSupport = await client.query(
      'SELECT id FROM superadmins WHERE email = $1',
      ['support@billboards.com']
    );

    if (existingSupport.rows.length === 0) {
      console.log('Creating sample support user...');
      
      const hashedSupportPassword = await bcrypt.hash('support123', 10);
      
      await client.query(`
        INSERT INTO superadmins (email, password, full_name, phone_number, role, status, permissions)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        'support@billboards.com',
        hashedSupportPassword,
        'Sarah Support',
        '+1234567892',
        'support',
        'active',
        JSON.stringify({
          viewDashboard: true,
          manageBillboards: false,
          approveCreatives: false,
          managePublishers: false,
          manageUsers: false,
          systemSettings: false
        })
      ]);

      console.log('Sample support user created successfully!');
      console.log('Email: support@billboards.com');
      console.log('Password: support123');
    }

    console.log('Setup completed successfully!');

  } catch (error) {
    console.error('Error creating superadmin table:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

createSuperAdminTable();
