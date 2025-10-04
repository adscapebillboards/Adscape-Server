# Email Notification System

This document describes the email notification system implemented for the Billboard Hub application using Nodemailer.

## Overview

The email notification system provides automated email notifications for various events in the system:

- **Campaign Creation**: Notifies superadmins when a new campaign is created
- **Billboard Approval**: Notifies users when their billboard is approved
- **Billboard Rejection**: Notifies users when their billboard is rejected with rejection reason
- **Publisher Account Creation**: Notifies superadmins when a new publisher account is created
- **Billboard Verification Request**: Notifies superadmins when a new billboard needs verification

## Features

- ✅ **Configurable**: Enable/disable notifications globally or per notification type
- ✅ **Beautiful Templates**: Professional HTML email templates with responsive design
- ✅ **Error Handling**: Graceful fallback if email sending fails
- ✅ **Logging**: Comprehensive logging for debugging and monitoring
- ✅ **Environment Variables**: Easy configuration via environment variables
- ✅ **Superadmin Management**: API endpoints to manage notification settings

## Configuration

### Environment Variables

Create a `.env` file in your server directory with the following variables:

```env
# Email Service Configuration
EMAIL_SERVICE=gmail
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password

# Email Notifications (optional - defaults to true)
EMAIL_NOTIFICATIONS_ENABLED=true

# Individual notification types (optional - defaults to true)
CAMPAIGN_CREATION_NOTIFICATIONS=true
BILLBOARD_APPROVAL_NOTIFICATIONS=true
BILLBOARD_REJECTION_NOTIFICATIONS=true
PUBLISHER_ACCOUNT_NOTIFICATIONS=true
BILLBOARD_VERIFICATION_NOTIFICATIONS=true

# Support and Company Information (optional)
SUPPORT_EMAIL=support@billboardhub.com
ADMIN_PANEL_URL=https://admin.billboardhub.com
```

### Gmail Setup

To use Gmail as your email service:

1. Enable 2-factor authentication on your Gmail account
2. Generate an App Password:
   - Go to Google Account settings
   - Security → 2-Step Verification → App passwords
   - Generate a password for "Mail"
3. Use the generated password as `EMAIL_PASS`

## API Endpoints

### Email Settings Management

All endpoints require superadmin authentication.

#### Get Current Settings
```
GET /api/email/settings
```

#### Enable/Disable Global Notifications
```
PUT /api/email/settings/enable
Body: { "enabled": true/false }
```

#### Enable/Disable Specific Notification Types
```
PUT /api/email/settings/notifications/:type
Body: { "enabled": true/false }
```

Available types:
- `campaignCreated`
- `billboardApproved`
- `billboardRejected`
- `publisherAccountCreated`
- `billboardVerificationRequest`

#### Test Email Functionality
```
POST /api/email/test
Body: { "email": "test@example.com", "template": "campaignCreated" }
```

## Usage Examples

### JavaScript/Node.js

```javascript
const EmailService = require('./services/emailService');

// Check if notifications are enabled
if (EmailService.isEnabled()) {
  console.log('Email notifications are enabled');
}

// Get current configuration
const config = EmailService.getConfig();
console.log('Current config:', config);

// Enable/disable notifications
EmailService.setEnabled(false);
EmailService.setNotificationEnabled('campaignCreated', false);

// Send notifications manually
await EmailService.notifyCampaignCreated(campaignData);
await EmailService.notifyBillboardApproved(campaignData, billboardData);
await EmailService.notifyBillboardRejected(campaignData, billboardData, 'Invalid content');
```

### cURL Examples

#### Test Email Notifications
```bash
curl -X POST http://localhost:3000/api/email/test \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "email": "test@example.com",
    "template": "campaignCreated"
  }'
```

#### Disable Campaign Creation Notifications
```bash
curl -X PUT http://localhost:3000/api/email/settings/notifications/campaignCreated \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"enabled": false}'
```

#### Disable All Email Notifications
```bash
curl -X PUT http://localhost:3000/api/email/settings/enable \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"enabled": false}'
```

## Email Templates

The system includes professionally designed HTML email templates for each notification type:

### Campaign Creation Template
- **Recipients**: Superadmins
- **Content**: Campaign details, user information, action required
- **Design**: Blue theme with warning call-to-action

### Billboard Approval Template
- **Recipients**: Campaign users
- **Content**: Campaign and billboard details, next steps
- **Design**: Green success theme with information boxes

### Billboard Rejection Template
- **Recipients**: Campaign users
- **Content**: Campaign and billboard details, rejection reason, next steps
- **Design**: Red warning theme with rejection details

### Publisher Account Creation Template
- **Recipients**: Superadmins
- **Content**: Publisher information, documents, action required
- **Design**: Professional business theme

### Billboard Verification Template
- **Recipients**: Superadmins
- **Content**: Billboard details, verification required
- **Design**: Information theme with action required

## Integration Points

The email notifications are automatically triggered at these points:

### Campaign API Controller
- `createCampaign()` → `notifyCampaignCreated()`
- `updateBillboardStatus()` → `notifyBillboardApproved()` / `notifyBillboardRejected()`

### Billboard Controller
- `approveBillboard()` → `notifyBillboardApproved()`
- `rejectBillboard()` → `notifyBillboardRejected()`

### Registration Routes
- `POST /registrations` → `notifyPublisherAccountCreated()`

## Error Handling

The system is designed to be fault-tolerant:

- Email failures don't affect the main application flow
- All email operations are wrapped in try-catch blocks
- Errors are logged for debugging
- Failed emails return error details but don't throw exceptions

## Monitoring and Debugging

### Logs
Check your application logs for email-related messages:
- `Email sent successfully to...`
- `Error sending email to...`
- `Email notifications disabled. Skipping...`

### Configuration Status
Use the settings API to check current configuration:
```bash
curl http://localhost:3000/api/email/settings \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Test Emails
Use the test endpoint to verify email functionality:
```bash
curl -X POST http://localhost:3000/api/email/test \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"email": "your-email@example.com", "template": "campaignCreated"}'
```

## Troubleshooting

### Common Issues

1. **Authentication Failed**
   - Verify Gmail credentials
   - Check if 2FA is enabled
   - Ensure app password is correct

2. **Emails Not Sending**
   - Check if notifications are enabled
   - Verify environment variables
   - Check application logs for errors

3. **Template Errors**
   - Verify template data structure
   - Check for missing required fields
   - Review email template syntax

### Debug Mode

Enable detailed logging by setting:
```env
LOG_LEVEL=debug
```

## Security Considerations

- All email settings endpoints require superadmin authentication
- Email credentials are stored in environment variables
- No sensitive data is logged in email operations
- Rate limiting should be implemented for production use

## Performance

- Email sending is asynchronous and non-blocking
- Templates are pre-compiled for efficiency
- Database queries for superadmin users are optimized
- Failed emails don't retry automatically (implement if needed)

## Future Enhancements

- [ ] Email queue system for high-volume scenarios
- [ ] Retry mechanism for failed emails
- [ ] Email templates customization via admin panel
- [ ] Email analytics and delivery tracking
- [ ] Multiple email service providers support
- [ ] Email preferences per user
- [ ] Bulk email notifications
- [ ] Email scheduling and delayed sending

