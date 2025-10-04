-- Create superadmin emails table for managing notification recipients
CREATE TABLE IF NOT EXISTS superadmin_emails (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255), -- Optional name for the superadmin
    is_active BOOLEAN DEFAULT true, -- Enable/disable this email from receiving notifications
    notification_types TEXT[], -- Array of notification types this email should receive
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_superadmin_emails_active ON superadmin_emails(is_active);
CREATE INDEX IF NOT EXISTS idx_superadmin_emails_email ON superadmin_emails(email);

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_superadmin_emails_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_superadmin_emails_updated_at 
    BEFORE UPDATE ON superadmin_emails 
    FOR EACH ROW 
    EXECUTE FUNCTION update_superadmin_emails_updated_at();

-- Insert default superadmin emails (you can modify these)
INSERT INTO superadmin_emails (email, name, notification_types) VALUES
('adscapebillboards@gmail.com', 'Main Admin', ARRAY['campaignCreated', 'publisherAccountCreated', 'billboardVerificationRequest']),
('admin@billboards.com', 'Secondary Admin', ARRAY['campaignCreated', 'publisherAccountCreated', 'billboardVerificationRequest'])
ON CONFLICT (email) DO NOTHING;

