# Campaign Status Scheduler

This document describes the server-side campaign status management system that automatically updates campaign and billboard statuses based on their start and end dates.

## Overview

The campaign status scheduler automatically manages campaign and billboard statuses based on their booking dates:

- **SCHEDULED**: Campaign hasn't started yet (current date < start date)
- **LIVE**: Campaign is currently running (current date >= start date AND <= end date)
- **COMPLETED**: Campaign has ended (current date > end date)

## Components

### 1. Campaign Status Controller (`controllers/campaignStatusController.js`)

Core functions for updating campaign statuses:

- `updateCampaignStatusByDate(campaignId)`: Updates a single campaign's status
- `updateAllCampaignsStatusByDate()`: Updates all campaigns' statuses
- `getCampaignStatusSummary(campaignId)`: Gets detailed status information

### 2. Campaign Status Scheduler (`utils/campaignStatusScheduler.js`)

Automated scheduler that runs status updates at regular intervals:

- Automatically starts when the server starts
- Configurable interval (default: 15 minutes)
- Manual trigger capabilities
- Status monitoring

### 3. API Routes (`routes/campaignStatus.js`)

REST endpoints for campaign status management:

- `PUT /api/campaigns/:campaignId/status`: Update specific campaign
- `PUT /api/campaigns/status/batch`: Update all campaigns
- `GET /api/campaigns/:campaignId/status`: Get campaign status summary

### 4. Scheduler Control Endpoints

Built into `app-new.js`:

- `POST /api/scheduler/start`: Start the scheduler
- `POST /api/scheduler/stop`: Stop the scheduler
- `GET /api/scheduler/status`: Get scheduler status
- `POST /api/scheduler/run`: Run scheduler immediately

## Configuration

### Environment Variables

```bash
# Disable auto-starting the scheduler (default: false)
DISABLE_AUTO_SCHEDULER=true

# Set scheduler interval in minutes (default: 15)
CAMPAIGN_STATUS_INTERVAL_MINUTES=30
```

### Database Schema Requirements

The system requires the following database structure:

```sql
-- Campaigns table
campaigns {
  id: string
  status: string
  campaignName: string
  // ... other fields
}

-- Billboards table
billboards {
  id: string
  status: string
  campaignId: string
  // ... other fields
}

-- Booking details table
bookingDetails {
  id: string
  billboardId: string
  startDate: datetime
  endDate: datetime
  // ... other fields
}
```

## Usage

### Automatic Operation

The scheduler automatically starts when the server starts and runs every 15 minutes (configurable).

### Manual API Calls

```bash
# Update a specific campaign
curl -X PUT http://localhost:3000/api/campaigns/{campaignId}/status

# Update all campaigns
curl -X PUT http://localhost:3000/api/campaigns/status/batch

# Get campaign status summary
curl -X GET http://localhost:3000/api/campaigns/{campaignId}/status

# Start scheduler
curl -X POST http://localhost:3000/api/scheduler/start \
  -H "Content-Type: application/json" \
  -d '{"intervalMinutes": 30}'

# Stop scheduler
curl -X POST http://localhost:3000/api/scheduler/stop

# Get scheduler status
curl -X GET http://localhost:3000/api/scheduler/status

# Run scheduler immediately
curl -X POST http://localhost:3000/api/scheduler/run
```

### Programmatic Usage

```javascript
const { updateCampaignStatusByDate } = require('./controllers/campaignStatusController');
const scheduler = require('./utils/campaignStatusScheduler');

// Update a specific campaign
const result = await updateCampaignStatusByDate('campaign-id');

// Start scheduler with custom interval
scheduler.start(30); // 30 minutes

// Stop scheduler
scheduler.stop();

// Run immediately
const result = await scheduler.runImmediate();
```

## Status Logic

### Billboard Status Determination

1. **SCHEDULED**: Current date < start date
2. **LIVE**: Current date >= start date AND <= end date
3. **COMPLETED**: Current date > end date

### Campaign Status Determination

The overall campaign status is determined by the billboard statuses:

1. **LIVE**: If any billboard is LIVE
2. **COMPLETED**: If all billboards are COMPLETED
3. **SCHEDULED**: If all billboards are SCHEDULED
4. **SCHEDULED**: If some billboards are SCHEDULED (mixed statuses)

## Testing

Run the test script to verify functionality:

```bash
node test-campaign-status-scheduler.js
```

This will test:
- Individual campaign updates
- Batch updates
- Scheduler functionality
- Status summaries

## Logging

The system uses the existing logger configuration and logs:

- Scheduler start/stop events
- Campaign status changes
- Billboard status changes
- Error conditions
- Batch update summaries

## Error Handling

- Database connection errors are logged and handled gracefully
- Individual campaign failures don't stop batch processing
- Scheduler errors are logged but don't crash the application
- API endpoints return appropriate HTTP status codes

## Performance Considerations

- Batch updates process campaigns sequentially to avoid database overload
- Scheduler interval can be adjusted based on system load
- Database queries are optimized with proper includes
- Error handling prevents cascading failures

## Monitoring

Monitor the system using:

1. **Logs**: Check for scheduler activity and status changes
2. **API Endpoints**: Use status endpoints to check current state
3. **Database**: Monitor campaign and billboard status changes
4. **Scheduler Status**: Use `/api/scheduler/status` to check if scheduler is running

## Troubleshooting

### Common Issues

1. **Scheduler not starting**: Check `DISABLE_AUTO_SCHEDULER` environment variable
2. **Status not updating**: Verify booking details exist for billboards
3. **Database errors**: Check Prisma connection and schema
4. **Performance issues**: Increase scheduler interval or optimize queries

### Debug Commands

```bash
# Check scheduler status
curl -X GET http://localhost:3000/api/scheduler/status

# Force immediate run
curl -X POST http://localhost:3000/api/scheduler/run

# Check specific campaign
curl -X GET http://localhost:3000/api/campaigns/{campaignId}/status
```








