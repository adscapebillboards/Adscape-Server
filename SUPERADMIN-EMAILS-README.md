# 🎯 SuperAdmin Email Management System

This system allows you to easily manage which email addresses receive superadmin notifications without hardcoding them in the application.

## 🗄️ Database Tables

### 1. `superadmin_emails` Table
Stores superadmin email addresses and their notification preferences.

```sql
CREATE TABLE superadmin_emails (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255), -- Optional name for the superadmin
    is_active BOOLEAN DEFAULT true, -- Enable/disable this email
    notification_types TEXT[], -- Array of notification types
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 2. `email_notifications` Table
Logs all email notification attempts for tracking and debugging.

```sql
CREATE TABLE email_notifications (
    id SERIAL PRIMARY KEY,
    notification_type VARCHAR(100) NOT NULL,
    recipient_email VARCHAR(255) NOT NULL,
    subject VARCHAR(500) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    message_id VARCHAR(255),
    error_message TEXT,
    data JSONB,
    sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## 🚀 Features

- **Dynamic Email Management**: Add/remove superadmin emails without code changes
- **Notification Type Control**: Specify which notification types each email receives
- **Active/Inactive Status**: Enable/disable emails without deleting them
- **Comprehensive Logging**: Track all email attempts, successes, and failures
- **Statistics & Analytics**: Monitor email delivery success rates
- **Retry Mechanism**: Reset failed notifications for retry
- **Cleanup Tools**: Remove old logs automatically

## 📧 Notification Types

The system supports these notification types:

1. **`campaignCreated`** - New campaign created by user
2. **`billboardApproved`** - Billboard approved (sent to user)
3. **`billboardRejected`** - Billboard rejected (sent to user)
4. **`publisherAccountCreated`** - New publisher account created
5. **`billboardVerificationRequest`** - New billboard verification request

## 🔧 API Endpoints

### SuperAdmin Email Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/superadmin-emails` | Get all superadmin emails |
| `GET` | `/api/superadmin-emails/active` | Get only active emails |
| `GET` | `/api/superadmin-emails/statistics` | Get email statistics |
| `POST` | `/api/superadmin-emails` | Add new superadmin email |
| `PUT` | `/api/superadmin-emails/:id` | Update existing email |
| `DELETE` | `/api/superadmin-emails/:id` | Delete email |
| `PATCH` | `/api/superadmin-emails/:id/toggle` | Toggle email status |
| `PUT` | `/api/superadmin-emails/:id/notification-types` | Update notification types |
| `GET` | `/api/superadmin-emails/notification-type/:type` | Get emails for notification type |

### Email Notification Logs

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/email/notifications` | Get notification logs |
| `GET` | `/api/email/notifications/statistics` | Get notification statistics |
| `POST` | `/api/email/notifications/:id/retry` | Retry failed notification |

## 💻 Usage Examples

### Adding a New SuperAdmin Email

```bash
curl -X POST http://localhost:3000/api/superadmin-emails \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "email": "newadmin@company.com",
    "name": "New Admin",
    "notificationTypes": ["campaignCreated", "publisherAccountCreated"]
  }'
```

### Updating Notification Types

```bash
curl -X PUT http://localhost:3000/api/superadmin-emails/1/notification-types \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "notificationTypes": ["campaignCreated", "billboardVerificationRequest"]
  }'
```

### Toggling Email Status

```bash
curl -X PATCH http://localhost:3000/api/superadmin-emails/1/toggle \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Getting Email Statistics

```bash
curl -X GET http://localhost:3000/api/superadmin-emails/statistics \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 🔄 Integration with Email Service

The `EmailService` now automatically fetches superadmin emails from the database:

```javascript
// Before (hardcoded)
const superadmins = await prisma.superAdmin.findMany({
  where: { role: 'superadmin', status: 'active' }
});

// After (dynamic)
const superadminEmails = await SuperAdminEmailService.getEmailsForNotificationType('campaignCreated');
```

## 📊 Monitoring & Analytics

### Email Statistics
- Total emails
- Active vs inactive emails
- Success rates
- Notification type distribution

### Notification Logs
- Delivery status tracking
- Error analysis
- Performance metrics
- Retry management

## 🛠️ Setup Instructions

### 1. Run Database Migrations

```bash
# Run the SQL migrations
psql -d your_database -f supabase/migrations/20250108000000_create_email_notifications_table.sql
psql -d your_database -f supabase/migrations/20250108000001_create_superadmin_emails_table.sql
```

### 2. Add Routes to Server

```javascript
// In your main server file
const superadminEmailRoutes = require('./routes/superadminEmails');
app.use('/api/superadmin-emails', superadminEmailRoutes);
```

### 3. Add Default SuperAdmin Emails

The migration automatically adds these default emails:
- `adscapebillboards@gmail.com` (Main Admin)
- `admin@billboards.com` (Secondary Admin)

### 4. Update Prisma Schema (Optional)

Add these models to your `schema.prisma`:

```prisma
model SuperAdminEmail {
  id               Int      @id @default(autoincrement())
  email            String   @unique
  name             String?
  isActive         Boolean  @default(true)
  notificationTypes String[]
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@map("superadmin_emails")
}

model EmailNotification {
  id                Int      @id @default(autoincrement())
  notificationType  String
  recipientEmail   String
  subject          String
  status           String   @default("pending")
  messageId        String?
  errorMessage     String?
  data             Json?
  sentAt           DateTime?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@map("email_notifications")
}
```

## 🔒 Security Features

- **Authentication Required**: All endpoints require valid JWT token
- **Role-Based Access**: Only superadmins can manage email settings
- **Input Validation**: Email format and data validation
- **Audit Logging**: All changes are logged for security

## 🚨 Error Handling

The system gracefully handles:
- Database connection issues
- Invalid email formats
- Duplicate email addresses
- Missing notification types
- Email service failures

## 🔧 Maintenance

### Cleanup Old Logs
```javascript
// Clean up logs older than 90 days
await EmailNotificationLogger.cleanupOldLogs(90);
```

### Monitor Failed Notifications
```javascript
// Get failed notifications for analysis
const failedNotifications = await EmailNotificationLogger.getFailedNotifications();
```

## 📈 Future Enhancements

- **Email Templates**: Customizable email templates per admin
- **Scheduling**: Send notifications at specific times
- **Webhooks**: Integrate with external notification services
- **Bulk Operations**: Manage multiple emails at once
- **Advanced Filtering**: Filter notifications by date, type, status
- **Export/Import**: Backup and restore email configurations

## 🆘 Troubleshooting

### Common Issues

1. **No emails received**: Check if emails are active and have correct notification types
2. **Database errors**: Verify Prisma connection and table existence
3. **Authentication failures**: Ensure JWT token is valid and user has superadmin role
4. **Email service errors**: Check SMTP configuration and credentials

### Debug Commands

```bash
# Check email status
curl -X GET http://localhost:3000/api/superadmin-emails/active

# View notification logs
curl -X GET http://localhost:3000/api/email/notifications

# Test email service
curl -X POST http://localhost:3000/api/email/test
```

## 📞 Support

For issues or questions:
1. Check the logs in `server/logs/`
2. Verify database table structure
3. Test API endpoints with Postman/cURL
4. Review email service configuration

---

**Note**: This system replaces the hardcoded superadmin email approach with a flexible, database-driven solution that allows easy management of notification recipients.

