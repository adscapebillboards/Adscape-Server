const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://avnadmin:AVNS_07USf4r803Jrdm6vAva@billboard-srinnivassh-7657.l.aivencloud.com:16921/defaultdb?sslmode=require',
  ssl: {
    rejectUnauthorized: false
  }
});

const createSuperAdminTable = async () => {
  console.log('🔧 Creating SuperAdmin table...\n');

  try {
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

    console.log('1. Creating superadmins table...');
    await pool.query(createTableQuery);
    console.log('✅ Superadmins table created successfully');

    // Create indexes
    const createIndexesQuery = `
      CREATE INDEX IF NOT EXISTS idx_superadmins_email ON superadmins(email);
      CREATE INDEX IF NOT EXISTS idx_superadmins_role ON superadmins(role);
      CREATE INDEX IF NOT EXISTS idx_superadmins_status ON superadmins(status);
    `;

    console.log('\n2. Creating indexes...');
    await pool.query(createIndexesQuery);
    console.log('✅ Indexes created successfully');

    // Insert default superadmin user
    const bcrypt = require('bcrypt');
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    const insertDefaultUserQuery = `
      INSERT INTO superadmins (email, password, full_name, phone_number, role, status, permissions)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (email) DO NOTHING;
    `;

    console.log('\n3. Creating default superadmin user...');
    await pool.query(insertDefaultUserQuery, [
      'admin@billboards.com',
      hashedPassword,
      'System Administrator',
      '+1234567890',
      'superadmin',
      'active',
      '{}'
    ]);
    console.log('✅ Default superadmin user created');

    // Insert default manager user
    const managerPassword = await bcrypt.hash('manager123', 10);
    await pool.query(insertDefaultUserQuery, [
      'manager@billboards.com',
      managerPassword,
      'System Manager',
      '+1234567891',
      'manager',
      'active',
      '{}'
    ]);
    console.log('✅ Default manager user created');

    // Insert default support user
    const supportPassword = await bcrypt.hash('support123', 10);
    await pool.query(insertDefaultUserQuery, [
      'support@billboards.com',
      supportPassword,
      'System Support',
      '+1234567892',
      'support',
      'active',
      '{}'
    ]);
    console.log('✅ Default support user created');

    // Verify the table was created
    console.log('\n4. Verifying table creation...');
    const result = await pool.query('SELECT COUNT(*) FROM superadmins');
    console.log(`✅ Table verified - ${result.rows[0].count} users found`);

    console.log('\n🎉 SuperAdmin table setup completed successfully!');
    console.log('\n📋 Default users created:');
    console.log('   - admin@billboards.com / admin123 (superadmin)');
    console.log('   - manager@billboards.com / manager123 (manager)');
    console.log('   - support@billboards.com / support123 (support)');

  } catch (error) {
    console.error('❌ Error creating superadmin table:', error.message);
  } finally {
    await pool.end();
  }
};

createSuperAdminTable();
