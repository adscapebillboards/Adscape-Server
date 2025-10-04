-- Create email notifications table for tracking superadmin email notifications
CREATE TABLE IF NOT EXISTS email_notifications (
    id SERIAL PRIMARY KEY,
    notification_type VARCHAR(100) NOT NULL,
    recipient_email VARCHAR(255) NOT NULL,
    subject VARCHAR(500) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, sent, failed, disabled
    message_id VARCHAR(255), -- Email service message ID
    error_message TEXT, -- Error details if failed
    data JSONB, -- Notification data that was sent
    sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_email_notifications_type ON email_notifications(notification_type);
CREATE INDEX IF NOT EXISTS idx_email_notifications_status ON email_notifications(status);
CREATE INDEX IF NOT EXISTS idx_email_notifications_recipient ON email_notifications(recipient_email);
CREATE INDEX IF NOT EXISTS idx_email_notifications_created_at ON email_notifications(created_at);

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_email_notifications_updated_at 
    BEFORE UPDATE ON email_notifications 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Insert some sample notification types for reference
INSERT INTO email_notifications (notification_type, recipient_email, subject, status, data) VALUES
('campaignCreated', 'admin@billboards.com', '🎯 New Campaign Created - Action Required', 'sent', '{"sample": "data"}'),
('billboardApproved', 'user@example.com', '✅ Campaign Billboard Approved Successfully!', 'sent', '{"sample": "data"}'),
('billboardRejected', 'user@example.com', '❌ Campaign Billboard Rejected - Action Required', 'sent', '{"sample": "data"}'),
('publisherAccountCreated', 'admin@billboards.com', '🏢 New Publisher Account Created - Review Required', 'sent', '{"sample": "data"}'),
('billboardVerificationRequest', 'admin@billboards.com', '📺 New Billboard Verification Request - Review Required', 'sent', '{"sample": "data"}')
ON CONFLICT DO NOTHING;

