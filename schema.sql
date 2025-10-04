-- Add registration table for account verification
CREATE TABLE IF NOT EXISTS registrations (
  id SERIAL PRIMARY KEY,
  personal_info JSONB NOT NULL,
  business_info JSONB NOT NULL,
  documents JSONB NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason TEXT,
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add superadmin table for admin users
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

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_registrations_status ON registrations(status);
CREATE INDEX IF NOT EXISTS idx_registrations_submitted_at ON registrations(submitted_at);
CREATE INDEX IF NOT EXISTS idx_superadmins_email ON superadmins(email);
CREATE INDEX IF NOT EXISTS idx_superadmins_role ON superadmins(role);
CREATE INDEX IF NOT EXISTS idx_superadmins_status ON superadmins(status); 