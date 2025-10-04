# Campaign Approval Automation System

## Overview

The Campaign Approval Automation System is a comprehensive solution that automatically handles the complete workflow when all billboards in a campaign are approved by a superadmin. This system eliminates the need for manual intervention and ensures data consistency across the platform.

## What Happens Automatically

When all billboards in a campaign are approved, the system automatically:

1. **Updates Campaign Status** - Changes from `pending` to `APPROVED`
2. **Generates Billboard Slots** - Creates time slots for ad display on each approved billboard
3. **Updates User Metrics** - Increments total bookings, total spent, and last booking date
4. **Ensures Data Consistency** - Validates all required data before approval

## System Components

### 1. Database Triggers

The system uses PostgreSQL triggers to automatically execute functions when specific events occur:

#### `trigger_check_campaign_approval`
- **Triggered by**: Updates to the `billboards` field in the `campaigns` table
- **Function**: `check_campaign_approval_status()`
- **Purpose**: Monitors billboard approval status and updates campaign status accordingly

#### `trigger_generate_billboard_slots`
- **Triggered by**: Updates to the `status` field in the `campaigns` table
- **Function**: `generate_billboard_slots()`
- **Purpose**: Automatically generates time slots for approved billboards

#### `trigger_update_user_metrics`
- **Triggered by**: Updates to the `status` field in the `campaigns` table
- **Function**: `update_user_metrics_on_approval()`
- **Purpose**: Updates user statistics when campaigns are approved

### 2. Database Functions

#### `check_campaign_approval_status()`
```sql
-- Automatically checks if all billboards in a campaign are approved
-- Updates campaign status to 'APPROVED' when all billboards are approved
-- Reverts to 'pending' if any billboard is not approved
```

#### `generate_billboard_slots()`
```sql
-- Generates up to 8 time slots per day for each approved billboard
-- Covers the entire booking period (start date to end date)
-- Prevents duplicate slot generation
```

#### `update_user_metrics_on_approval()`
```sql
-- Increments user's total bookings count
-- Updates total amount spent
-- Sets last booking date to current timestamp
-- Ensures user status is 'active'
```

## How It Works

### Step-by-Step Process

1. **Superadmin Approves Billboards**
   - Individual billboards are approved one by one
   - Each approval updates the `billboards` JSON array in the campaign

2. **Database Trigger Activation**
   - `trigger_check_campaign_approval` fires when billboards are updated
   - System checks if all billboards now have `status: 'APPROVED'`

3. **Campaign Status Update**
   - If all billboards are approved, campaign status changes to `APPROVED`
   - This triggers `trigger_generate_billboard_slots`

4. **Slot Generation**
   - System generates time slots for each approved billboard
   - Slots cover the entire booking period
   - Up to 8 slots per day per billboard

5. **User Metrics Update**
   - `trigger_update_user_metrics` fires when campaign status becomes `APPROVED`
   - User's booking count and spending are updated

### Data Flow Diagram

```
Superadmin Approval → Billboard Status Update → Campaign Status Check → 
Campaign Approved → Slot Generation → User Metrics Update → Complete
```

## Database Schema Changes

### New Indexes
```sql
-- Performance optimization for campaign status queries
CREATE INDEX idx_campaigns_status_billboards ON campaigns(status, (billboards IS NOT NULL));

-- Performance optimization for slot queries
CREATE INDEX idx_generated_slots_campaign_billboard ON generated_slots(campaign_id, billboard_id);

-- Performance optimization for user queries
CREATE INDEX idx_users_email_status ON users(email, status);
```

### Required Fields for Approval

For a billboard to be approved, it must have:

- `status: 'APPROVED'`
- `bookingDetails.startDate` - Valid start date
- `bookingDetails.endDate` - Valid end date
- `files` - Array of asset URLs (not empty)
- `screen_id` - Valid screen identifier

## API Endpoints

### Update Billboard Status
```http
PUT /api/campaigns/:campaignId/billboards/:billboardId/status
Content-Type: application/json

{
  "status": "APPROVED"
}
```

**Response includes:**
- Updated campaign information
- Updated billboard information
- Whether all billboards are now approved
- Current campaign status

## Validation and Error Handling

### Pre-Approval Validation
The system validates billboard data before allowing approval:

1. **Required Fields Check**
   - Booking dates must be present
   - Asset files must be uploaded
   - Screen ID must be specified

2. **Data Integrity**
   - If validation fails, approval is rejected
   - Billboard status remains unchanged
   - Detailed error messages are returned

### Error Scenarios
- **Missing Data**: Returns validation errors with specific details
- **Database Errors**: Logs errors and returns appropriate HTTP status codes
- **Trigger Failures**: Fallback validation in the API layer

## Testing

### Automated Test Script
Run the comprehensive test script to verify the system:

```bash
cd server
node test-campaign-approval-automation.js
```

**Test Coverage:**
- Campaign creation with multiple billboards
- Sequential billboard approval
- Campaign status automation
- Slot generation verification
- User metrics validation
- Data cleanup

### Manual Testing
1. Create a campaign with multiple billboards
2. Approve billboards one by one via the API
3. Verify campaign status changes automatically
4. Check that slots are generated
5. Confirm user metrics are updated

## Monitoring and Logging

### Database Logs
The system uses PostgreSQL `RAISE NOTICE` for logging:
- Campaign status changes
- Slot generation details
- User metric updates

### Application Logs
Enhanced logging in the API controller:
- Billboard approval attempts
- Validation results
- Trigger verification

## Performance Considerations

### Database Optimization
- Indexes on frequently queried fields
- Efficient JSON queries for billboard status checks
- Batch operations for slot generation

### Trigger Efficiency
- Triggers only fire when necessary
- Minimal database operations per trigger
- Efficient data validation

## Troubleshooting

### Common Issues

1. **Campaign Status Not Updating**
   - Check if database triggers are installed
   - Verify billboard JSON structure
   - Check database logs for trigger errors

2. **Slots Not Generating**
   - Verify campaign status is `APPROVED`
   - Check billboard data completeness
   - Review database trigger logs

3. **User Metrics Not Updating**
   - Confirm campaign approval
   - Check user table structure
   - Verify trigger execution

### Debug Commands
```sql
-- Check trigger status
SELECT * FROM information_schema.triggers WHERE trigger_name LIKE '%campaign%';

-- Verify function definitions
SELECT routine_name, routine_definition FROM information_schema.routines 
WHERE routine_name LIKE '%campaign%';

-- Check campaign status
SELECT id, status, billboards FROM campaigns WHERE id = 'your-campaign-id';
```

## Migration and Deployment

### Database Migration
1. Run the migration file: `20250408000000_campaign_approval_automation.sql`
2. Verify triggers are created successfully
3. Test with sample data

### Application Updates
1. Deploy the enhanced controller
2. Update API documentation
3. Test the complete workflow

### Rollback Plan
If issues arise:
1. Disable triggers temporarily
2. Revert to previous controller version
3. Restore manual approval process

## Future Enhancements

### Planned Features
- **Real-time Notifications**: WebSocket updates for status changes
- **Audit Trail**: Comprehensive logging of all approval actions
- **Batch Operations**: Approve multiple billboards simultaneously
- **Advanced Validation**: Content compliance checks
- **Performance Metrics**: Approval time tracking

### Configuration Options
- Configurable slot generation rules
- Customizable validation criteria
- Flexible notification preferences

## Support and Maintenance

### Regular Maintenance
- Monitor trigger performance
- Review database logs
- Update validation rules as needed

### Support Contacts
- Database issues: Database Administrator
- API issues: Backend Development Team
- Business logic: Product Management Team

## Conclusion

The Campaign Approval Automation System provides a robust, efficient, and reliable solution for managing the complete campaign approval workflow. By automating critical processes and ensuring data consistency, it significantly reduces manual intervention while maintaining high standards of data integrity and user experience.

For questions or support, please refer to the troubleshooting section or contact the development team.
