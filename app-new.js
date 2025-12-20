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
const adscapeRoutes = require('./routes/adscapeRoutes');
const prisma = require('./db/db');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

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
    to: () => ({ emit: () => {} }),
    sockets: { adapter: { rooms: new Map() }, sockets: new Map() },
    engine: null // Mark as unavailable
  };
}

// Make io available to other modules
app.set('io', io);

// Middleware
app.use(express.json());
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
  'https://admin.adscape.co.in',
  'http://127.0.0.1:5500',
  'https://endearing-begonia-927b56.netlify.app',
  'https://bmi-client.onrender.com',
  'https://admin.adscape.co.in'
]);



// CORS configuration - permissive for development
// Allow all headers to avoid CORS issues with browser-sent headers
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, file:// like Electron)
    if (!origin) return callback(null, true);
    if (allowedOrigins.has(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
  // Don't restrict headers - allow all headers sent by browser
  // This prevents CORS errors from browser-added headers like cache-control, pragma, expires, etc.
  allowedHeaders: [
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
  ],
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
app.use('/api/partners', partnersRoutes);

// BMI routes (old simple routes)
app.use('/api/bmi', bmiRoutes);

// Adscape routes
app.use('/api', adscapeRoutes);

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

// BMI helper functions and in-memory store
const bmiStore = new Map();

function computeBMI(heightCm, weightKg) {
    const h = Number(heightCm);
    const w = Number(weightKg);
    if (!h || !w) return { bmi: null, category: 'invalid' };
    const heightM = h / 100;
    const bmi = Number((w / (heightM * heightM)).toFixed(1));
    let category = 'Normal';
    if (bmi < 18.5) category = 'Underweight';
    else if (bmi < 25) category = 'Normal';
    else if (bmi < 30) category = 'Overweight';
    else category = 'Obese';
    return { bmi, category };
}

async function generateFortuneMessage(bmiData) {
    try {
        const grokApiKey = process.env.GROK_API_KEY;
        if (!grokApiKey) {
            return generateFallbackFortune(bmiData);
        }
        const prompt = `Generate a positive, motivational fortune cookie message for someone with BMI ${bmiData.bmi} (${bmiData.category}). Keep it short (1-2 sentences), uplifting, and health-focused. Don't mention specific BMI numbers.`;
        const response = await axios.post('https://api.x.ai/v1/chat/completions', {
            model: 'grok-beta',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 100,
            temperature: 0.8
        }, {
            headers: {
                'Authorization': `Bearer ${grokApiKey}`,
                'Content-Type': 'application/json'
            }
        });
        const message = response.data.choices[0]?.message?.content?.trim();
        return message || generateFallbackFortune(bmiData);
    } catch (error) {
        return generateFallbackFortune(bmiData);
    }
}

function generateFallbackFortune(bmiData) {
    const fortunes = [
        "Your journey to wellness is a beautiful adventure. Every step forward is progress worth celebrating.",
        "Health is not just about numbers, but about feeling strong and confident in your own skin.",
        "Small, consistent changes lead to big transformations. You're already on the right path.",
        "Your body is your temple. Treat it with love, respect, and gentle care every day."
    ];
    return fortunes[Math.floor(Math.random() * fortunes.length)];
}

// Calculate streak helper
function calculateStreak(bmiRecords) {
    if (!bmiRecords || bmiRecords.length === 0) return { currentStreak: 0, longestStreak: 0, isActive: false };
    const sortedRecords = bmiRecords.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    let currentStreak = 0, longestStreak = 0, tempStreak = 0, isActive = false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const recordsByDate = new Map();
    sortedRecords.forEach(record => {
        const dateKey = new Date(record.timestamp);
        dateKey.setHours(0, 0, 0, 0);
        const dateString = dateKey.toISOString().split('T')[0];
        if (!recordsByDate.has(dateString)) recordsByDate.set(dateString, record);
    });
    const uniqueDates = Array.from(recordsByDate.keys()).sort().reverse();
    if (uniqueDates.length === 0) return { currentStreak: 0, longestStreak: 0, isActive: false };
    const mostRecentDate = new Date(uniqueDates[0]);
    const daysDiff = Math.floor((today - mostRecentDate) / (1000 * 60 * 60 * 24));
    if (daysDiff <= 1) {
        isActive = true;
        currentStreak = 1;
        for (let i = 1; i < uniqueDates.length; i++) {
            const currentDate = new Date(uniqueDates[i]);
            const prevDate = new Date(uniqueDates[i - 1]);
            const diff = Math.floor((prevDate - currentDate) / (1000 * 60 * 60 * 24));
            if (diff === 1) currentStreak++; else break;
        }
    }
    tempStreak = 1;
    longestStreak = 1;
    for (let i = 1; i < uniqueDates.length; i++) {
        const currentDate = new Date(uniqueDates[i]);
        const prevDate = new Date(uniqueDates[i - 1]);
        const diff = Math.floor((prevDate - currentDate) / (1000 * 60 * 60 * 24));
        if (diff === 1) tempStreak++; else { longestStreak = Math.max(longestStreak, tempStreak); tempStreak = 1; }
    }
    longestStreak = Math.max(longestStreak, tempStreak);
    return { currentStreak, longestStreak, isActive };
}

// POST /api/bmi
app.post('/api/bmi', async (req, res) => {
    try {
        const { heightCm, weightKg, screenId, appVersion } = req.body || {};
        if (!heightCm || !weightKg || !screenId) return res.status(400).json({ error: 'heightCm, weightKg, screenId required' });
        
        // Get the registered player's flow type from database
        let playerFlowType = null;
        try {
            const player = await prisma.adscapePlayer.findUnique({ where: { screenId: String(screenId) } });
            playerFlowType = player?.flowType;
            logger.info('[BMI] Player found in DB:', { screenId, flowType: playerFlowType, appVersion: player?.appVersion });
        } catch (e) { 
            logger.warn('[BMI] Could not fetch player flow type:', e.message); 
        }
        
        // Determine effective flow type: DB flowType > request appVersion > default 'f1'
        const effectiveFlowType = playerFlowType || appVersion || 'f1';
        logger.info('[BMI] Flow determination:', { 
            playerFlowType, 
            requestAppVersion: appVersion, 
            effectiveFlowType 
        });
        
        const { bmi, category } = computeBMI(heightCm, weightKg);
        const bmiId = uuidv4();
        const timestamp = new Date().toISOString();
        
        // Generate fortune for F2 flow only (F1 generates after payment)
        const fortune = (effectiveFlowType === 'F2' || effectiveFlowType === 'f2') ? await generateFortuneMessage({ bmi, category }) : null;
        logger.info('[BMI] Fortune generation:', { effectiveFlowType, fortuneGenerated: !!fortune });
        
        const payload = { 
            bmiId, 
            screenId: String(screenId), 
            height: Number(heightCm), 
            weight: Number(weightKg), 
            bmi, 
            category, 
            timestamp, 
            fortune,
            flowType: effectiveFlowType // Include flowType in payload
        };
        bmiStore.set(bmiId, payload);
        
        await prisma.screen.upsert({ where: { id: String(screenId) }, create: { id: String(screenId) }, update: {} });
        await prisma.bMI.create({ 
            data: { 
                id: bmiId, 
                screenId: String(screenId), 
                heightCm: Number(heightCm), 
                weightKg: Number(weightKg), 
                bmi: Number(bmi), 
                category, 
                timestamp: new Date(timestamp), 
                deviceId: req.body.deviceId || null, 
                appVersion: effectiveFlowType, // Store effective flow type
                location: req.body.location || null, 
                fortune: fortune 
            } 
        });
        
        const clientBase = process.env.CLIENT_BASE_URL || 'https://bmi-client.onrender.com';
        const inferredProto = (req.headers['x-forwarded-proto'] || '').toString().split(',')[0] || req.protocol;
        const apiBase = process.env.API_PUBLIC_BASE || `${inferredProto}://${req.get('host')}`;
        const version = effectiveFlowType.toLowerCase();
        const webUrl = `${clientBase}?screenId=${encodeURIComponent(String(screenId))}&bmiId=${encodeURIComponent(bmiId)}&appVersion=${encodeURIComponent(version)}#server=${encodeURIComponent(apiBase)}`;
        
        const emitPayload = { 
            ...payload, 
            webUrl,
            appVersion: effectiveFlowType // Explicitly include for Android app
        };
        
        const io = app.get('io');
        if (io) {
            io.to(`screen:${String(screenId)}`).emit('bmi-data-received', emitPayload);
            logger.info('[BMI] Emitted to Android:', { 
                room: `screen:${String(screenId)}`, 
                bmiId, 
                flowType: effectiveFlowType,
                hasWebUrl: !!webUrl
            });
        } else {
            logger.warn('[BMI] Socket.IO not available, cannot emit to Android');
        }
        
        return res.status(201).json({ ok: true, bmiId, webUrl, flowType: effectiveFlowType });
    } catch (e) { 
        logger.error('[BMI] POST /api/bmi error', e); 
        return res.status(500).json({ error: 'internal_error' }); 
    }
});

// POST /api/user
app.post('/api/user', async (req, res) => {
    try {
        const { name, mobile } = req.body || {};
        if (!name || !mobile) return res.status(400).json({ error: 'name, mobile required' });
        let user = await prisma.userBMI.findFirst({ where: { mobile: String(mobile) } });
        if (!user) user = await prisma.userBMI.create({ data: { name: String(name), mobile: String(mobile) } });
        return res.json({ userId: user.id, name: user.name, mobile: user.mobile });
    } catch (e) { logger.error('[USER] POST /api/user error', e); return res.status(500).json({ error: 'internal_error' }); }
});

// POST /api/payment-success
app.post('/api/payment-success', async (req, res) => {
    try {
        const { userId, bmiId, appVersion } = req.body || {};
        if (!userId || !bmiId) return res.status(400).json({ error: 'userId, bmiId required' });
        const updatedBMI = await prisma.bMI.update({ where: { id: bmiId }, data: { userId: userId }, include: { user: true, screen: true } });
        if (appVersion !== 'f2') {
            logger.info('[PAYMENT] F1 Flow: Generating fortune immediately');
            const fortuneMessage = await generateFortuneMessage({ bmi: updatedBMI.bmi, category: updatedBMI.category });
            await prisma.bMI.update({ where: { id: bmiId }, data: { fortune: fortuneMessage } });
            logger.info('[PAYMENT] F1 Flow: Fortune generated and stored:', fortuneMessage);
        }
        const io = app.get('io');
        if (appVersion !== 'f2' && io) {
            io.to(`screen:${updatedBMI.screenId}`).emit('payment-success', { bmiId: updatedBMI.id, screenId: updatedBMI.screenId, userId: updatedBMI.userId, user: updatedBMI.user, bmi: updatedBMI.bmi, category: updatedBMI.category, height: updatedBMI.heightCm, weight: updatedBMI.weightKg, timestamp: updatedBMI.timestamp.toISOString() });
            logger.info('[PAYMENT] Success emitted to screen:', updatedBMI.screenId);
        } else logger.info('[PAYMENT] F2 version - skipping socket emission to Android');
        return res.json({ ok: true, message: 'Payment processed successfully' });
    } catch (e) { logger.error('[PAYMENT] POST /api/payment-success error', e); return res.status(500).json({ error: 'internal_error' }); }
});

// POST /api/progress-start
app.post('/api/progress-start', async (req, res) => {
    try {
        const { bmiId } = req.body || {};
        if (!bmiId) return res.status(400).json({ error: 'bmiId required' });
        const bmiData = await prisma.bMI.findUnique({ where: { id: bmiId }, include: { user: true, screen: true } });
        if (!bmiData) return res.status(404).json({ error: 'BMI data not found' });
        const io = app.get('io');
        if (io) io.to(`screen:${bmiData.screenId}`).emit('progress-start', { bmiId: bmiData.id, screenId: bmiData.screenId, userId: bmiData.userId, user: bmiData.user, bmi: bmiData.bmi, category: bmiData.category, height: bmiData.heightCm, weight: bmiData.weightKg, timestamp: bmiData.timestamp.toISOString(), progressComplete: true });
        logger.info('[PROGRESS] Start emitted to screen:', bmiData.screenId);
        return res.json({ ok: true, message: 'Progress started' });
    } catch (e) { logger.error('[PROGRESS] POST /api/progress-start error', e); return res.status(500).json({ error: 'internal_error' }); }
});

// POST /api/fortune-generate
app.post('/api/fortune-generate', async (req, res) => {
    try {
        const { bmiId, appVersion } = req.body || {};
        logger.info('[FORTUNE] Request body:', req.body);
        if (!bmiId) return res.status(400).json({ error: 'bmiId required' });
        const bmiData = await prisma.bMI.findUnique({ where: { id: bmiId }, include: { user: true, screen: true } });
        if (!bmiData) return res.status(404).json({ error: 'BMI data not found' });
        let fortuneMessage = bmiData.fortune;
        if (!fortuneMessage) {
            logger.info('[FORTUNE] No existing fortune, generating new one');
            fortuneMessage = await generateFortuneMessage({ bmi: bmiData.bmi, category: bmiData.category });
            await prisma.bMI.update({ where: { id: bmiId }, data: { fortune: fortuneMessage } });
        } else logger.info('[FORTUNE] Using existing fortune from database');
        const fortuneData = { bmiId: bmiData.id, screenId: bmiData.screenId, userId: bmiData.userId, user: bmiData.user, bmi: bmiData.bmi, category: bmiData.category, height: bmiData.heightCm, weight: bmiData.weightKg, timestamp: bmiData.timestamp.toISOString(), fortuneMessage: fortuneMessage };
        const io = app.get('io');
        if (appVersion !== 'f2' && io) {
            io.to(`screen:${bmiData.screenId}`).emit('fortune-ready', fortuneData);
            logger.info('[FORTUNE] Generated and emitted to screen:', bmiData.screenId);
        } else logger.info('[FORTUNE] F2 version - skipping socket emission to Android');
        return res.json({ ok: true, fortuneMessage, data: fortuneData });
    } catch (e) { logger.error('[FORTUNE] POST /api/fortune-generate error', e); return res.status(500).json({ error: 'internal_error' }); }
});

// GET /api/user/:userId/analytics
app.get('/api/user/:userId/analytics', async (req, res) => {
    try {
        const { userId } = req.params;
        const bmiRecords = await prisma.bMI.findMany({ where: { userId: userId }, orderBy: { timestamp: 'desc' }, include: { screen: true } });
        if (bmiRecords.length === 0) return res.json({ totalRecords: 0, recentBMI: null, streak: { currentStreak: 0, longestStreak: 0, isActive: false }, trends: [], categoryDistribution: {}, averageBMI: 0 });
        const streak = calculateStreak(bmiRecords);
        const recentBMI = { id: bmiRecords[0].id, bmi: bmiRecords[0].bmi, category: bmiRecords[0].category, height: bmiRecords[0].heightCm, weight: bmiRecords[0].weightKg, timestamp: bmiRecords[0].timestamp.toISOString(), screenId: bmiRecords[0].screenId, deviceId: bmiRecords[0].deviceId, location: bmiRecords[0].location, fortune: bmiRecords[0].fortune };
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const recentRecords = bmiRecords.filter(record => new Date(record.timestamp) >= thirtyDaysAgo);
        const trends = recentRecords.map(record => ({ date: record.timestamp.toISOString().split('T')[0], bmi: record.bmi, weight: record.weightKg, category: record.category })).reverse();
        const categoryDistribution = {};
        bmiRecords.forEach(record => { categoryDistribution[record.category] = (categoryDistribution[record.category] || 0) + 1; });
        const averageBMI = Number((bmiRecords.reduce((sum, record) => sum + record.bmi, 0) / bmiRecords.length).toFixed(1));
        return res.json({ totalRecords: bmiRecords.length, recentBMI, streak, trends, categoryDistribution, averageBMI, firstRecord: bmiRecords[bmiRecords.length - 1].timestamp.toISOString(), lastRecord: bmiRecords[0].timestamp.toISOString() });
    } catch (e) { logger.error('[ANALYTICS] GET /api/user/:userId/analytics error', e); return res.status(500).json({ error: 'internal_error' }); }
});

// POST /api/bmi/:id/link-user
app.post('/api/bmi/:id/link-user', async (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ error: 'userId required' });
        logger.info(`[BMI-LINK] Linking BMI ${id} to user ${userId}`);
        const updatedBMI = await prisma.bMI.update({ where: { id }, data: { userId }, include: { user: true, screen: true } });
        logger.info(`[BMI-LINK] Successfully linked BMI to user: ${updatedBMI.user?.name}`);
        return res.json({ ok: true, message: 'BMI record linked to user successfully', bmi: { bmiId: updatedBMI.id, screenId: updatedBMI.screenId, height: updatedBMI.heightCm, weight: updatedBMI.weightKg, bmi: updatedBMI.bmi, category: updatedBMI.category, timestamp: updatedBMI.timestamp.toISOString(), userId: updatedBMI.userId, user: updatedBMI.user ? { id: updatedBMI.user.id, name: updatedBMI.user.name, mobile: updatedBMI.user.mobile } : null } });
    } catch (e) { logger.error('[BMI-LINK] Error linking BMI to user:', e); return res.status(500).json({ error: 'internal_error' }); }
});

// GET /api/bmi/:id
app.get('/api/bmi/:id', async (req, res) => {
    const id = req.params.id;
    logger.info(`[BMI] GET request for id: ${id}`);
    try {
        const mem = bmiStore.get(id);
        if (mem) { logger.info(`[BMI] Found in memory:`, mem); return res.json(mem); }
        logger.info(`[BMI] Searching database for id: ${id}`);
        const row = await prisma.bMI.findUnique({ where: { id }, include: { user: true, screen: true } });
        if (!row) { logger.info(`[BMI] Not found in database: ${id}`); return res.status(404).json({ error: 'not_found', message: `BMI record ${id} not found`, id: id }); }
        const result = { bmiId: row.id, screenId: row.screenId, height: row.heightCm, weight: row.weightKg, bmi: row.bmi, category: row.category, timestamp: row.timestamp.toISOString(), fortune: row.fortune, userId: row.userId, user: row.user ? { id: row.user.id, name: row.user.name, mobile: row.user.mobile } : null };
        logger.info(`[BMI] Found in database:`, result);
        return res.json(result);
    } catch (e) { logger.error('[BMI] GET error', e); return res.status(500).json({ error: 'internal_error', message: e.message, stack: e.stack }); }
});

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

// Function to mount BMI flow routes with Socket.IO (defined before middleware)
app.mountBMIFlowRoutes = (io) => {
  // Remove the last two handlers (error handler and 404 handler)
  const stack = app._router.stack;
  logger.info(`[BMI-MOUNT] Current stack length: ${stack.length}`);
  
  const notFoundHandler = stack.pop(); // Remove 404 handler
  const errorHandler = stack.pop(); // Remove error handler
  
  logger.info(`[BMI-MOUNT] Removed handlers, new stack length: ${stack.length}`);
  
  // Mount BMI flow routes
  const bmiFlowRoutes = require('./routes/bmiFlowRoutes')(io);
  app.use('/api', bmiFlowRoutes);
  logger.info('[BMI-MOUNT] BMI Flow routes mounted with Socket.IO support');
  
  logger.info(`[BMI-MOUNT] After mounting, stack length: ${app._router.stack.length}`);
  
  // Re-add handlers in correct order
  stack.push(errorHandler);
  stack.push(notFoundHandler);
  
  logger.info(`[BMI-MOUNT] Final stack length: ${stack.length}`);
  logger.info('[BMI-MOUNT] ✅ BMI routes successfully mounted before error/404 handlers');
};

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