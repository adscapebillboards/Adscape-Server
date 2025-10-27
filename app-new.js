const express = require('express');
require('dotenv').config();
const cors = require('cors');
const bodyParser = require('body-parser');
const logger = require('./config/logger');

// Import route files
const billboardRoutes = require('./routes/billboards');
const authRoutes = require('./routes/auth');
const emailRoutes = require('./routes/email');
const gstRoutes = require('./routes/gst');
const userRoutes = require('./routes/userRoutes');
const customerRoutes = require('./routes/customers');
const campaignRoutes = require('./routes/campaignRoutes');
const slotRoutes = require('./routes/slots');
const metricsRoutes = require('./routes/metrics');
const businessRoutes = require('./routes/business');
const billboardManagementRoutes = require('./routes/billboardManagement');
const campaignStatusRoutes = require('./routes/campaignStatus');
const assetCleanupRoutes = require('./routes/assetCleanup');

// Import schedulers
const campaignStatusScheduler = require('./utils/campaignStatusScheduler');

// New modularized API routes
const basicApiRoutes = require('./routes/basicApi');
const userBillboardRoutes = require('./routes/userBillboards');
const adminUserRoutes = require('./routes/adminUsers');
const billboardListRoutes = require('./routes/billboardList');
const campaignApiRoutes = require('./routes/campaignApi');
const contactEmailRoutes = require('./routes/contactEmail');
const registrationRoutes = require('./routes/registrations');
const publisherMetricsRoutes = require('./routes/publisherMetrics');
const publisherRoutes = require('./routes/publishers');
const dashboardRoutes = require('./routes/dashboard');
const publisherDashboardRoutes = require('./routes/publisherDashboard');
const superadminRoutes = require('./routes/superadminRoutes');
const setupRoutes = require('./routes/setup');
const superadminEmailRoutes = require('./routes/superadminEmails');
const notificationsRoutes = require('./routes/notifications');
const partnersRoutes = require('./routes/partners');
const bmiRoutes = require('./routes/bmiRoutes');
const path = require('path');
const fs = require('fs');
const playerRoutes = require('./routes/players');
const availabilityRoutes = require('./routes/availability');

const app = express();

const http = require('http');
const { Server } = require('socket.io');

// create the HTTP server first
const server = http.createServer(app);

// then attach Socket.IO to it
const io = new Server(server, {
  cors: {
    origin: '*'
  }
})

// Middleware
app.use(express.json());
app.use(bodyParser.json());
const allowedOrigins = new Set([
  'http://localhost:3000',
  'http://localhost:8080',
  'https://www.adscapebillboards.com',
  'https://billboard-frontend-development.vercel.app',
  'https://billboard-admin-x.vercel.app',
  'http://localhost:5173',
  'http://localhost:5174',
  'https://adscape-player.vercel.app',
  'https://adscape.co.in',
  'https://admin.adscape.co.in'
]);



app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, file:// like Electron)
    if (!origin) return callback(null, true);
    if (allowedOrigins.has(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: false
}));

// Request logging middleware
app.use((req, res, next) => {
  logger.api(req.method, req.url);
  next();
});

// Health check endpoint
app.get('/ping', (req, res) => {
  res.status(200).send('pong');
});

// Scheduler control endpoints
app.post('/api/scheduler/start', (req, res) => {
  try {
    const { intervalMinutes = 15 } = req.body;
    campaignStatusScheduler.start(intervalMinutes);
    res.json({ 
      success: true, 
      message: `Scheduler started with ${intervalMinutes} minute interval`,
      status: campaignStatusScheduler.getStatus()
    });
  } catch (error) {
    logger.error('Error starting scheduler:', error);
    res.status(500).json({ error: 'Failed to start scheduler' });
  }
});

app.post('/api/scheduler/stop', (req, res) => {
  try {
    campaignStatusScheduler.stop();
    res.json({ 
      success: true, 
      message: 'Scheduler stopped',
      status: campaignStatusScheduler.getStatus()
    });
  } catch (error) {
    logger.error('Error stopping scheduler:', error);
    res.status(500).json({ error: 'Failed to stop scheduler' });
  }
});

app.get('/api/scheduler/status', (req, res) => {
  try {
    res.json({ 
      success: true, 
      status: campaignStatusScheduler.getStatus()
    });
  } catch (error) {
    logger.error('Error getting scheduler status:', error);
    res.status(500).json({ error: 'Failed to get scheduler status' });
  }
});

app.post('/api/scheduler/run', async (req, res) => {
  try {
    const result = await campaignStatusScheduler.runImmediate();
    res.json({ 
      success: true, 
      message: 'Manual scheduler run completed',
      data: result
    });
  } catch (error) {
    logger.error('Error running scheduler manually:', error);
    res.status(500).json({ error: 'Failed to run scheduler' });
  }
});

// Route organization by functionality

// User and Authentication routes
app.use('/api', userRoutes);
app.use('/api/customers', customerRoutes);
// Mount auth on both /api/auth and /auth for compatibility
app.use('/api/auth', authRoutes);
app.use('/auth', authRoutes);

// Billboard routes
app.use('/api/billboards', billboardRoutes);
app.use('/api/billboards', billboardManagementRoutes); // Management operations

// Campaign routes
app.use('/api/campaigns', campaignRoutes);

// Campaign Status routes
app.use('/api', campaignStatusRoutes);

// Asset Cleanup routes
app.use('/api/asset-cleanup', assetCleanupRoutes);

// Slot and Asset routes
app.use('/api', slotRoutes);
// Player registration routes
app.use('/api', playerRoutes);
// Availability routes
app.use('/api', availabilityRoutes);

// Metrics and Analytics routes
app.use('/api', metricsRoutes);

// Business Profile routes
app.use('/api', businessRoutes);

// Modularized API routes
app.use('/api', basicApiRoutes);
app.use('/api', userBillboardRoutes);
app.use('/api', adminUserRoutes);
// Public, non-auth billboard endpoints
app.use('/api/public', billboardListRoutes);
app.use('/api', campaignApiRoutes);
app.use('/api', contactEmailRoutes);

// Email and GST routes
app.use('/email', emailRoutes);
app.use('/gst', gstRoutes);

// Registration routes
app.use('/api/registrations', registrationRoutes);

// Publisher Metrics routes
app.use('/api/publisher-metrics', publisherMetricsRoutes);

// Publisher routes
app.use('/api/publishers', publisherRoutes);

// Dashboard routes
app.use('/api', dashboardRoutes);

// Publisher Dashboard routes
app.use('/api', publisherDashboardRoutes);

// Superadmin routes
app.use('/api', superadminRoutes);

// Setup routes
app.use('/api', setupRoutes);

// Superadmin Email Management routes
app.use('/api/superadmin-emails', superadminEmailRoutes);

// Notifications routes
app.use('/api/notifications', notificationsRoutes);
app.use('/api/partners', partnersRoutes);

// BMI routes
app.use('/api/bmi', bmiRoutes);

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve live dashboard
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'live-dashboard.html'));
});

// Serve client build for SPA routes in production (if present)
try {
  const clientBuildPath = path.resolve(__dirname, '../client/dist');
  if (fs.existsSync(clientBuildPath)) {
    // Serve static assets from Vite build
    app.use('/assets', express.static(path.join(clientBuildPath, 'assets')));
    app.use(express.static(clientBuildPath));
    app.get(/^(?!\/api|\/auth|\/email|\/gst|\/dashboard).*/, (req, res) => {
      res.sendFile(path.join(clientBuildPath, 'index.html'));
    });
  }
} catch (e) {
  logger.warn('Client build not found for SPA fallback:', e.message);
}

// Start the scheduler automatically when the app starts
// You can disable this by setting DISABLE_AUTO_SCHEDULER=true in environment
// Avoid auto-starting scheduler on serverless platforms (Vercel/AWS Lambda)
const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY || process.env.GOOGLE_CLOUD_PROJECT);
if (process.env.DISABLE_AUTO_SCHEDULER !== 'true' && !isServerless) {
  const intervalMinutes = parseInt(process.env.CAMPAIGN_STATUS_INTERVAL_MINUTES) || 15;
  logger.info(`Auto-starting campaign status scheduler with ${intervalMinutes} minute interval`);
  campaignStatusScheduler.start(intervalMinutes);
} else if (isServerless) {
  logger.info('Skipping auto-start of campaign status scheduler in serverless environment');
}

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use('*', (req, res) => {
  logger.warn('Route not found:', req.originalUrl);
  res.status(404).json({ error: 'Route not found' });
});




module.exports = app; 