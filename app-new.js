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
const pushRoutes = require('./routes/push');
const partnersRoutes = require('./routes/partners');
const path = require('path');
const fs = require('fs');
const playerRoutes = require('./routes/players');
const playerV1Routes = require('./routes/playerV1Routes');
const availabilityRoutes = require('./routes/availability');
const adscapeRoutes = require('./routes/adscapeRoutes');
const signageRoutes = require('./signage/signageRoutes');
const updateRoutes = require('./routes/update');
const prisma = require('./db/db');

const app = express();

const http = require('http');
const { Server } = require('socket.io');

// Check if running in serverless environment (Vercel, AWS Lambda, etc.)
const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY || process.env.GOOGLE_CLOUD_PROJECT);

// create the HTTP server first (only if not serverless)
let server;
let io;

if (!isServerless) {
  server = http.createServer(app);

  // then attach Socket.IO to it
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
      credentials: true
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true
  });

  // Socket.IO connection handling
  io.on('connection', (socket) => {
    logger.info('Socket.IO client connected:', socket.id);

    socket.on('disconnect', () => {
      logger.info('Socket.IO client disconnected:', socket.id);
    });
  });

  logger.info('Socket.IO server initialized');
} else {
  logger.info('Socket.IO disabled - running in serverless environment');
  // Create a mock io object for compatibility
  io = {
    emit: () => { logger.warn('Socket.IO emit called but Socket.IO is disabled in serverless environment'); },
    to: () => ({ emit: () => { } }),
    sockets: { adapter: { rooms: new Map() }, sockets: new Map() },
    engine: null // Mark as unavailable
  };
}

// Make io available to other modules
app.set('io', io);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());
const allowedOrigins = new Set([
  'http://localhost:3000',
  'http://localhost:3003',
  'http://localhost:8080',
  'https://www.adscapebillboards.com',
  'https://billboard-frontend-development.vercel.app',
  'https://billboard-admin-x.vercel.app',
  'http://localhost:5173',
  'http://localhost:5174',
  'https://adscape-player.vercel.app',
  'https://adscape.co.in',
  'https://www.adscape.co.in',
  'https://admin.adscape.co.in',
  'http://127.0.0.1:5500',
  'https://endearing-begonia-927b56.netlify.app',
]);

const normalizeOrigin = (origin) => origin?.replace(/\/$/, '');
const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  return allowedOrigins.has(normalizeOrigin(origin));
};

const corsAllowedHeaders = [
  'Content-Type',
  'Authorization',
  'X-Requested-With',
  'Accept',
  'Accept-Language',
  'Accept-Encoding',
  'Origin',
  'Referer',
  'User-Agent',
  'Cache-Control',
  'Pragma',
  'Expires',
  'If-Modified-Since',
  'If-None-Match',
  'If-Range',
  'Range',
  'X-CSRF-Token',
  'ngrok-skip-browser-warning',
  'Last-Modified',
  'ETag',
  'Date'
];

// Set CORS response headers explicitly so serverless/CDN responses consistently
// include them for allowed origins, including OPTIONS and cached responses.
app.use((req, res, next) => {
  const requestOrigin = normalizeOrigin(req.headers.origin);

  if (isAllowedOrigin(requestOrigin)) {
    if (requestOrigin) {
      res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    }
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD');

    const requestedHeaders = req.headers['access-control-request-headers'];
    res.setHeader(
      'Access-Control-Allow-Headers',
      requestedHeaders || corsAllowedHeaders.join(', ')
    );
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Type, Authorization');
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(isAllowedOrigin(requestOrigin) ? 200 : 403);
  }

  next();
});

app.use(cors({
  origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
  allowedHeaders: corsAllowedHeaders,
  exposedHeaders: ['Content-Length', 'Content-Type', 'Authorization'],
  preflightContinue: false,
  optionsSuccessStatus: 200
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

// Socket.IO endpoint handler - handle requests gracefully
// Note: Socket.IO requires persistent connections, which don't work in serverless environments
app.use('/socket.io/', (req, res, next) => {
  const ioInstance = app.get('io');
  // If Socket.IO is not available (serverless), return helpful error instead of 400
  if (!ioInstance || !ioInstance.engine) {
    logger.warn('Socket.IO request received but Socket.IO is not available (serverless environment)');
    return res.status(503).json({
      error: 'Socket.IO is not available',
      message: 'WebSocket connections require persistent connections. In serverless environments, please use HTTP polling or REST API endpoints.',
      alternative: 'Use HTTP polling or REST API endpoints for real-time updates'
    });
  }
  next();
});

// Socket.IO endpoint handler - handle requests gracefully
// Note: Socket.IO requires persistent connections, which don't work in serverless environments
app.use('/socket.io/', (req, res, next) => {
  // If Socket.IO is not available (serverless), return helpful error
  const io = app.get('io');
  if (!io || !io.engine) {
    return res.status(503).json({
      error: 'Socket.IO is not available',
      message: 'WebSocket connections require persistent connections. In serverless environments, please use HTTP polling or REST API endpoints.',
      alternative: 'Use HTTP polling or REST API endpoints for real-time updates'
    });
  }
  next();
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
app.use('/api/v1', playerV1Routes);
// Availability routes
app.use('/api', availabilityRoutes);

// Metrics and Analytics routes
app.use('/api', metricsRoutes);

// Business Profile routes
app.use('/api', businessRoutes);

// Modularized API routes
// Register campaignApiRoutes BEFORE basicApiRoutes to ensure proper status update handling
// campaignApiRoutes has the correct PAYMENT_COMPLETED -> SCHEDULED logic
app.use('/api', campaignApiRoutes);
app.use('/api', basicApiRoutes);
app.use('/api', userBillboardRoutes);
app.use('/api', adminUserRoutes);
// Public, non-auth billboard endpoints
app.use('/api/public', billboardListRoutes);
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
app.use('/api', pushRoutes);
app.use('/api/partners', partnersRoutes);

// Adscape routes
app.use('/api', adscapeRoutes);
app.use('/api/signage', signageRoutes);
app.use('/api', updateRoutes);

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
// Note: isServerless is already declared at the top of the file
if (process.env.DISABLE_AUTO_SCHEDULER !== 'true' && !isServerless) {
  const intervalMinutes = parseInt(process.env.CAMPAIGN_STATUS_INTERVAL_MINUTES) || 15;
  logger.info(`Auto-starting campaign status scheduler with ${intervalMinutes} minute interval`);
  campaignStatusScheduler.start(intervalMinutes);
} else if (isServerless) {
  logger.info('Skipping auto-start of campaign status scheduler in serverless environment');
}

// GET /api/debug/connections
app.get('/api/debug/connections', (_req, res) => {
  try {
    const rooms = [];
    const io = app.get('io');
    if (io) {
      io.sockets.adapter.rooms.forEach((socketsSet, room) => { rooms.push({ room, size: socketsSet.size }); });
      const sockets = [];
      io.sockets.sockets.forEach((sock) => sockets.push(sock.id));
      return res.json({ rooms, sockets });
    }
    res.json({ rooms: [], sockets: [] });
  } catch (e) { res.status(500).json({ error: 'debug_error' }); }
});

// Note: OPTIONS requests are handled by cors middleware above
// This manual handler is removed to avoid conflicts

// Error handling middleware
app.use((err, req, res, next) => {
  // Don't send error response for OPTIONS requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler (must be last)
app.use('*', (req, res) => {
  // Don't send 404 for OPTIONS requests (handled by cors middleware)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  logger.warn('Route not found:', req.originalUrl);
  res.status(404).json({ error: 'Route not found' });
});

module.exports = app; 
