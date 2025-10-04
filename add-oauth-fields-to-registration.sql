-- Add OAuth fields to registrations table
ALTER TABLE registrations 
ADD COLUMN google_id VARCHAR(255),
ADD COLUMN google_picture TEXT;

-- Add index for google_id for faster lookups
CREATE INDEX idx_registrations_google_id ON registrations(google_id);

-- Add googleId field to publishers table if not exists
ALTER TABLE publishers 
ADD COLUMN IF NOT EXISTS google_id VARCHAR(255);

-- Add index for google_id in publishers table
CREATE INDEX IF NOT EXISTS idx_publishers_google_id ON publishers(google_id);



