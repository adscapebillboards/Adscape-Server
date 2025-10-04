// Add this to your main server file (e.g., index.js or app.js)

// Import the superadmin email routes
const superadminEmailRoutes = require('./routes/superadminEmails');

// Add the routes to your app (after other middleware)
app.use('/api/superadmin-emails', superadminEmailRoutes);

// Example usage:
// GET /api/superadmin-emails - Get all superadmin emails
// GET /api/superadmin-emails/active - Get active superadmin emails
// POST /api/superadmin-emails - Add new superadmin email
// PUT /api/superadmin-emails/:id - Update superadmin email
// DELETE /api/superadmin-emails/:id - Delete superadmin email
// PATCH /api/superadmin-emails/:id/toggle - Toggle email status
// PUT /api/superadmin-emails/:id/notification-types - Update notification types
// GET /api/superadmin-emails/notification-type/:type - Get emails for notification type

