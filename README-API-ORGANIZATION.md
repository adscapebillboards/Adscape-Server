# Billboard Hub API - Reorganized Structure

## Overview
The API has been reorganized to improve maintainability, with endpoints grouped by functionality and a centralized logging system.

## New Structure

### Controllers
- `controllers/billboardController.js` - Billboard CRUD operations
- `controllers/campaignsController.js` - Campaign management
- `controllers/userController.js` - User/publisher management
- `controllers/slotController.js` - Slot and asset management
- `controllers/metricsController.js` - Analytics and metrics
- `controllers/businessController.js` - Business profile operations

### Routes
- `routes/billboards.js` - Basic billboard operations
- `routes/billboardManagement.js` - Billboard management (status, connect/disconnect)
- `routes/campaignRoutes.js` - Campaign operations
- `routes/slots.js` - Slot and asset endpoints
- `routes/metrics.js` - Analytics and dashboard endpoints
- `routes/business.js` - Business profile endpoints
- `routes/api.js` - General API endpoints
- `routes/userRoutes.js` - User management
- `routes/auth.js` - Authentication
- `routes/customers.js` - Customer operations
- `routes/email.js` - Email functionality
- `routes/gst.js` - GST operations

### Utilities
- `utils/slotGenerator.js` - Slot generation logic
- `middleware/auth.js` - JWT authentication middleware

### Configuration
- `config/logger.js` - Centralized logging system
- `config/cloudinary.js` - Cloudinary configuration

## Logging System

### Configuration
The logging system can be controlled via environment variables:

```bash
# Enable/disable logging (default: true)
ENABLE_LOGGING=true

# Set log level (ERROR, WARN, INFO, DEBUG)
LOG_LEVEL=INFO
```

### Log Levels
- `ERROR` (0) - Only error messages
- `WARN` (1) - Warnings and errors
- `INFO` (2) - Info, warnings, and errors (default)
- `DEBUG` (3) - All messages including debug

### Usage Examples
```javascript
const logger = require('./config/logger');

// Basic logging
logger.error('Error message');
logger.warn('Warning message');
logger.info('Info message');
logger.debug('Debug message');

// Context-specific logging
logger.api('GET', '/api/users', 'User list fetched');
logger.db('SELECT', 'Users table', '5 rows returned');
logger.campaign('Created', 'Campaign ID: 123');
logger.billboard('Updated', 'Billboard ID: 456');
logger.user('Login', 'user@example.com');
logger.slot('Generated', 'Slot #3 for billboard 789');
logger.asset('Uploaded', 'image.jpg');
```

## API Endpoints Organization

### User & Authentication
- `POST /api/publishers` - Create publisher
- `GET /api/publishers` - Get all publishers
- `POST /api/publishers/login` - Publisher login
- `POST /auth/*` - Authentication endpoints

### Billboards
- `GET /billboards` - Get all billboards
- `GET /billboards/:id` - Get billboard by ID
- `POST /billboards` - Create billboard
- `PUT /billboards/:id` - Update billboard
- `DELETE /billboards/:id` - Delete billboard
- `PATCH /billboards/:id/status` - Update billboard status
- `PATCH /billboards/:id/connect` - Connect screen
- `PATCH /billboards/:id/disconnect` - Disconnect screen

### Campaigns
- `POST /api/campaigns` - Create campaign
- `GET /api/campaigns` - Get user campaigns
- `PUT /api/campaigns/update-campaign-name` - Update campaign name
- `PUT /api/campaigns/:id/status` - Update campaign status

### Slots & Assets
- `GET /api/slota` - Get all slots
- `GET /api/slotz` - Get slots by billboard
- `GET /api/assets/:screen_id` - Get assets by screen
- `POST /api/track-play` - Track asset play
- `GET /api/asset-logs` - Get asset logs

### Metrics & Analytics
- `GET /api/campaign-metrics/:campaignId` - Get campaign metrics
- `GET /api/admin-dashboard-stats` - Get admin dashboard stats
- `GET /api/states` - Get states
- `GET /api/city` - Get cities by state
- `GET /api/availability` - Check availability

### Business Profiles
- `POST /api/business-profile` - Update business profile
- `GET /api/business-profiler` - Get business profile

### General API
- `GET /api/data` - Basic data endpoint
- `POST /api/update` - Update endpoint
- `GET /api/userbillboards` - Get user billboards
- `POST /api/create-campaign` - Create campaign with files
- `GET /api/campaigns` - Get campaigns by user
- `GET /api/campaignsu` - Get all campaigns (admin)
- `GET /api/campaignsuz` - Get campaigns by user email
- `GET /api/billboards` - Get billboards list
- `POST /api/users` - Create admin user
- `POST /api/send-email` - Send email

## Migration Notes

### From Old Structure
1. All endpoints maintain the same URLs for backward compatibility
2. Console.log statements have been replaced with structured logging
3. Error handling is now centralized
4. Code is organized by functionality rather than scattered in app.js

### Environment Variables
Add these to your `.env` file:
```bash
# Logging
ENABLE_LOGGING=true
LOG_LEVEL=INFO

# Existing variables
JWT_SECRET=your_jwt_secret
# ... other existing variables
```

### Testing the New Structure
1. Replace `app.js` with `app-new.js` or update the existing `app.js`
2. Ensure all route files are properly imported
3. Test endpoints to ensure they work as expected
4. Monitor logs to verify logging is working correctly

## Benefits of New Structure

1. **Maintainability**: Code is organized by functionality
2. **Scalability**: Easy to add new features and endpoints
3. **Debugging**: Centralized logging with different levels
4. **Code Reusability**: Controllers can be reused across routes
5. **Error Handling**: Consistent error handling across the application
6. **Documentation**: Clear separation of concerns makes code self-documenting 