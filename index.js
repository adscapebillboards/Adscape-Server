const http = require('http');

// Capture startup/runtime crashes (including module-load errors) so they show up in admin logs.
process.on('uncaughtException', (err) => {
  try {
    // eslint-disable-next-line global-require
    const { persistError } = require('./services/errorLogService');
    persistError({
      level: 'error',
      message: err?.message || 'uncaughtException',
      stack: err?.stack || null,
      method: null,
      path: 'process:uncaughtException',
      statusCode: 500,
      meta: { name: err?.name, code: err?.code },
    }).catch(() => { });
  } catch { }
  // Give best-effort time for async persistence
  setTimeout(() => process.exit(1), 150);
});

process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? reason : new Error(typeof reason === 'string' ? reason : 'unhandledRejection');
  try {
    // eslint-disable-next-line global-require
    const { persistError } = require('./services/errorLogService');
    persistError({
      level: 'error',
      message: err?.message || 'unhandledRejection',
      stack: err?.stack || null,
      method: null,
      path: 'process:unhandledRejection',
      statusCode: 500,
      meta: { name: err?.name },
    }).catch(() => { });
  } catch { }
});

const app = require('./app-new'); // import your real app
const port = process.env.PORT || 4000;
const cors = require('cors');
const assetCleanupScheduler = require('./utils/assetCleanupScheduler');
const express = require('express');
const prisma = require('./db/db');
const pushRoutes = require('./routes/push');
const { getPlaylistForScreen } = require('./utils/socketHelpers');

// Socket.IO setup
const { Server } = require("socket.io");
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: [
            "http://localhost:3000",
            "http://localhost:3001",
            "http://localhost:3003",
            "http://localhost:5173",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:3003",
            "http://127.0.0.1:5173",
            "https://your-frontend-domain.com",
            "https://adscape.co.in",
            "https://www.adscape.co.in",
            "https://admin.adscape.co.in",
            "http://localhost:8080",
            "http://127.0.0.1:5500",
            "https://endearing-begonia-927b56.netlify.app"
        ],
        methods: ["GET", "POST"],
        allowedHeaders: ["ngrok-skip-browser-warning"],
        credentials: true
    },
    allowEIO3: true
});


// Push Notifications APIs
app.use('/api', pushRoutes);

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    // Send immediate welcome message
    socket.emit('connected', { message: 'Connected to server', socketId: socket.id });

    // Handle test events
    socket.on('test', (data) => {
        console.log('Test event received:', data);
        socket.emit('test-response', { message: 'Test response from server', received: data });
    });

    // Handle player joining
    socket.on('player-join', async (data) => {
        console.log('[SOCKET] Player joined:', data);
        const machineId = data.machineId || data.screenId;
        const screenId = data.screenId || data.machineId;

        // Join multiple rooms for compatibility
        socket.join(`player-${machineId}`);
        socket.join(`screen:${screenId}`);

        console.log('[SOCKET] Player joined rooms:', {
            socketId: socket.id,
            machineId,
            screenId,
            rooms: [`player-${machineId}`, `screen:${screenId}`]
        });

        socket.emit('connected', {
            message: 'Connected to server',
            socketId: socket.id,
            rooms: [`player-${machineId}`, `screen:${screenId}`]
        });

        // Lookup billboard details and emit them to the player
        if (screenId) {
            try {
                const billboard = await prisma.billboard.findFirst({
                    where: { screen_id: screenId }
                });

                if (billboard) {
                    // Resolve correct default asset (Billboard Specific or Global)
                    const globalDefault = await prisma.defaultAsset.findFirst({
                        where: { isActive: true },
                        orderBy: { updatedAt: 'desc' }
                    });
                    const globalUrl = globalDefault ? globalDefault.assetUrl : 'https://res.cloudinary.com/dh0ehlpkp/image/upload/v1772717423/Logo_ssxriy.png';
                    const defaultAssetUrl = billboard.defaultAssetUrl || globalUrl;

                    socket.emit('billboard-details', {
                        screenId,
                        name: billboard.name,
                        location: billboard.location,
                        city: billboard.city,
                        defaultImage: defaultAssetUrl
                    });
                    console.log(`[SOCKET] Emitted billboard-details for screen: ${screenId}. Default: ${defaultAssetUrl}`);
                }

                // Emit playlist and assets automatically on join
                const { playlist, assets, date } = await getPlaylistForScreen(screenId);
                socket.emit('playlist', { screenId, playlist, date });
                socket.emit('assets', { screenId, assets });
                console.log(`[SOCKET] Emitted playlist and assets for screen: ${screenId}`);

            } catch (err) {
                console.error('[SOCKET] Error fetching billboard details or playlist for player-join:', err);
            }
        }
    });

    // Handle request for playlist
    socket.on('request-playlist', async (data) => {
        const screenId = data.screenId || data.machineId;
        console.log(`[SOCKET] Playlist requested for screen: ${screenId}`);
        if (screenId) {
            const { playlist } = await getPlaylistForScreen(screenId);
            socket.emit('playlist', { screenId, playlist });
        }
    });

    // Handle request for assets
    socket.on('request-assets', async (data) => {
        const screenId = data.screenId || data.machineId;
        console.log(`[SOCKET] Assets requested for screen: ${screenId}`);
        if (screenId) {
            const { assets } = await getPlaylistForScreen(screenId);
            socket.emit('assets', { screenId, assets });
        }
    });

    // Handle asset playing status updates
    socket.on('asset-playing', (data) => {
        console.log('Asset playing:', data);
        // Broadcast to all connected clients (for admin dashboard)
        io.emit('asset-status-update', {
            machineId: data.machineId,
            screenId: data.screenId,
            currentAsset: data.currentAsset,
            isPlaying: data.isPlaying,
            timestamp: new Date().toISOString()
        });
    });

    // Handle player status updates
    socket.on('player-status', (data) => {
        console.log('Player status update:', data);
        io.emit('player-status-update', {
            machineId: data.machineId,
            screenId: data.screenId,
            status: data.status,
            lastActive: new Date().toISOString()
        });
    });

    // -------------------------------------------------------------
    // Live Preview Support (Client browser <-> Android Player)
    // -------------------------------------------------------------

    // Client browser joins a viewer room so it gets screen-specific events
    socket.on('viewer-join', (data) => {
        const { screenId } = data || {};
        if (!screenId) return;
        socket.join(`viewer:${screenId}`);
        console.log(`[SOCKET] Viewer joined room viewer:${screenId} (socketId=${socket.id})`);
        socket.emit('viewer-joined', { screenId });
    });

    // Client browser (or admin) requests the player to send a snapshot
    socket.on('request-live-preview', (data) => {
        const { screenId } = data || {};
        if (screenId) {
            io.to(`screen:${screenId}`).emit('request-live-preview', { adminSocketId: socket.id, screenId });
        }
    });

    // Android player relays a frame back — route to requesting socket AND viewer room
    socket.on('live-preview-frame', (data) => {
        const { screenId, frameData, adminSocketId } = data || {};
        if (!frameData) return;
        const payload = { screenId, frameData };
        if (adminSocketId) io.to(adminSocketId).emit('live-preview-frame-response', payload);
        if (screenId) io.to(`viewer:${screenId}`).emit('live-preview-frame-response', payload);
    });


    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
    });
});





// Global error handler to ensure JSON responses
app.use((err, req, res, next) => {
    console.error('[SERVER] Global error:', err);
    res.status(500).json({
        error: 'internal_server_error',
        message: err.message,
        path: req.path
    });
});

// Catch-all route for undefined endpoints
// app.use('*', (req, res) => {
//     console.log(`[SERVER] 404 for ${req.method} ${req.originalUrl}`);
//     res.status(404).json({ 
//         error: 'not_found', 
//         message: `Endpoint ${req.method} ${req.originalUrl} not found`,
//         path: req.originalUrl
//     });
// });



// Make io available to other modules
app.set('io', io);

// Test database connection on startup
async function testDatabaseConnection() {
    try {
        console.log('🔌 Testing database connection...');
        await prisma.$connect();
        console.log('✅ Database connected successfully');

        // Test a simple query
        await prisma.$queryRaw`SELECT 1`;
        console.log('✅ Database query test passed');
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        console.error('Error details:', {
            code: error.code,
            meta: error.meta,
            message: error.message
        });
        console.error('\n⚠️  Please check your .env file and ensure:');
        console.error('   - DATABASE_URL is set, OR');
        console.error('   - PGHOST, PGUSER, PGPASSWORD, PGPORT, PGDATABASE are all set');
        process.exit(1);
    }
}

// Start server with database connection test
async function startServer() {
    await testDatabaseConnection();

    server.listen(port, () => {
        console.log(`🚀 Server running on http://localhost:${port}`);
        console.log(`🔌 Socket.IO server ready`);

        // Start asset cleanup scheduler
        assetCleanupScheduler.start();
        console.log(`🧹 Asset cleanup scheduler started`);
    });
}

startServer().catch((error) => {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
});
