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
const { attachLiveFeedP2PHandlers, onViewerJoined, registerPlayerSocket } = require('./services/liveFeedP2P');
const { resolveScreenContext, isPlayerOnlineInRooms } = require('./utils/screenIdResolver');
const playerRegistry = require('./services/playerConnectionRegistry');

/**
 * @typedef {import('../shared/types').AssetPayload} AssetPayload
 */

/**
 * In-memory last-known playing state per screen.
 * WHY: late-joining viewers must render instantly without waiting for the next asset transition.
 * NOTE: This is intentionally in-memory only (no Redis/DB) per constraints.
 * @type {Map<string, AssetPayload>}
 */
const screenState = new Map();

/** @param {string} screenId */
function getCachedAssetState(screenId) {
    const key = String(screenId || '');
    if (screenState.has(key)) return screenState.get(key);
    return null;
}

/** @param {string[]} aliases */
function getCachedFromAliases(aliases) {
    for (const id of aliases) {
        const cached = getCachedAssetState(id);
        if (cached) return cached;
    }
    return null;
}

// Socket.IO setup
const { Server } = require("socket.io");
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: (origin, callback) => {
            try {
                if (!origin) return callback(null, true);
                const o = String(origin).replace(/\/$/, '');

                // Allow any ngrok-free domain (subdomain changes frequently).
                if (o.endsWith('.ngrok-free.dev')) return callback(null, true);

                const allowed = new Set([
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
                ]);
                return callback(null, allowed.has(o));
            } catch {
                return callback(null, false);
            }
        },
        methods: ["GET", "POST"],
        allowedHeaders: ["ngrok-skip-browser-warning", "Content-Type", "Authorization"],
        // Live-feed sockets do not rely on cookies; keep CORS simple for dev/ngrok.
        credentials: false
    },
    transports: ["polling", "websocket"],
    allowEIO3: true
});


// Push Notifications APIs
app.use('/api', pushRoutes);

// Socket.IO connection handling
io.on('connection', (socket) => {
    attachLiveFeedP2PHandlers(io, socket);

    console.log('Player connected:', socket.id, {
        origin: socket.handshake?.headers?.origin,
        ua: socket.handshake?.headers?.['user-agent'],
        transport: socket.conn?.transport?.name
    });

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
        const machineId = String(data.machineId || data.screenId || '').trim();
        const screenId = String(data.screenId || data.machineId || '').trim();
        const { aliases, canonicalScreenId } = await resolveScreenContext(screenId);
        const allAliases = [...new Set([...aliases, machineId, screenId, canonicalScreenId].filter(Boolean))];

        socket.data.isPlayer = true;
        socket.data.screenId = canonicalScreenId || screenId;
        socket.data.machineId = machineId;

        if (machineId) socket.join(`player-${machineId}`);
        for (const id of allAliases) {
            socket.join(`screen:${id}`);
        }

        playerRegistry.registerPlayer(socket.id, {
            screenId: canonicalScreenId || screenId,
            machineId,
            aliases: allAliases,
        });

        registerPlayerSocket(canonicalScreenId || screenId, socket.id);
        socket.emit('p2p-registered', { screenId: canonicalScreenId || screenId, socketId: socket.id, role: 'player' });

        console.log('[SOCKET] Player joined rooms:', {
            socketId: socket.id,
            machineId,
            screenId,
            canonicalScreenId,
            aliases: allAliases,
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
                    where: {
                        OR: [
                            { id: String(canonicalScreenId || screenId) },
                            { screen_id: String(screenId) },
                        ],
                    },
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
    socket.on('asset-playing', (data, ack) => {
        try {
            playerRegistry.touch(socket.id);
            const screenId = String(data?.screenId || '');
            const currentAsset = data?.currentAsset || {};
            const url = String(currentAsset?.url || '');
            const fallbackImageUrl = String(currentAsset?.fallbackImageUrl || '');
            const startedAtMs = Number(currentAsset?.startedAtMs);
            const durationSec = Number(currentAsset?.durationSec);

            const hasRenderable = url.length > 0 || fallbackImageUrl.length > 0;
            const valid = !!screenId &&
                hasRenderable &&
                Number.isFinite(startedAtMs) &&
                Number.isFinite(durationSec) &&
                durationSec > 0;

            if (!valid) {
                console.warn('[asset-playing] Malformed payload (ignored):', {
                    screenId,
                    hasRenderable,
                    startedAtMs,
                    durationSec
                });
                try { if (typeof ack === 'function') ack({ ok: false }); } catch { }
                return;
            }

            /** @type {AssetPayload} */
            const payload = {
                screenId,
                currentAsset: {
                    url,
                    type: String(currentAsset?.type || 'image') === 'video' ? 'video' : 'image',
                    slotNumber: Number(currentAsset?.slotNumber || 0),
                    startedAtMs,
                    durationSec,
                    ...(fallbackImageUrl ? { fallbackImageUrl } : {})
                },
                timestamp: Date.now()
            };

            screenState.set(screenId, payload);
            // Mirror under canonical aliases so cache hits regardless of id format.
            resolveScreenContext(screenId).then(({ aliases }) => {
                for (const id of aliases) {
                    screenState.set(id, payload);
                }
            }).catch(() => {});

            const broadcast = (aliases) => {
                io.emit('asset-status-update', payload);
                io.emit('live-feed-state', payload);
                for (const id of aliases) {
                    io.to(`viewer:${id}`).emit('asset-status-update', payload);
                    io.to(`viewer:${id}`).emit('live-feed-state', payload);
                }
            };
            resolveScreenContext(screenId).then(({ aliases }) => broadcast(aliases)).catch(() => broadcast([screenId]));

            try { if (typeof ack === 'function') ack({ ok: true }); } catch { }
        } catch (err) {
            console.warn('[asset-playing] Handler error (ignored):', err?.message || err);
            try { if (typeof ack === 'function') ack({ ok: false }); } catch { }
        }
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
    // Live Feed Support (Client browser <-> Android Player)
    // -------------------------------------------------------------

    // Client browser joins viewer rooms (all ID aliases) for screen-specific events
    socket.on('viewer-join', async (data) => {
        const { screenId } = data || {};
        if (!screenId) return;
        const { aliases, canonicalScreenId } = await resolveScreenContext(screenId);
        for (const id of aliases) {
            socket.join(`viewer:${id}`);
        }
        console.log(`[SOCKET] Viewer joined rooms for aliases (socketId=${socket.id})`, {
            requested: screenId,
            canonicalScreenId,
            aliases,
        });
        socket.emit('viewer-joined', { screenId, canonicalScreenId, aliases });
        onViewerJoined(io, socket, canonicalScreenId || screenId);

        const cached = getCachedFromAliases(aliases);
        if (cached) {
            socket.emit('live-feed-state', cached);
            socket.emit('asset-status-update', cached);
        }

        // Ask the Android player to push its current asset immediately.
        for (const id of aliases) {
            io.to(`screen:${id}`).emit('request-live-state', {
                screenId: canonicalScreenId || screenId,
                viewerSocketId: socket.id,
            });
        }
    });

    // Explicit subscribe (re-join + pull + nudge player) — used after reconnect.
    socket.on('live-feed-subscribe', async (data) => {
        const { screenId } = data || {};
        if (!screenId) return;
        const { aliases, canonicalScreenId } = await resolveScreenContext(screenId);
        for (const id of aliases) {
            socket.join(`viewer:${id}`);
        }
        const cached = getCachedFromAliases(aliases);
        if (cached) {
            socket.emit('live-feed-state', cached);
            socket.emit('asset-status-update', cached);
        }
        for (const id of aliases) {
            io.to(`screen:${id}`).emit('request-live-state', {
                screenId: canonicalScreenId || screenId,
                viewerSocketId: socket.id,
            });
        }
    });

    // Viewer can pull the cached state on demand (after a hiccup).
    socket.on('request-current-state', async (data) => {
        const { screenId } = data || {};
        if (!screenId) return;
        const { aliases, canonicalScreenId } = await resolveScreenContext(screenId);
        const cached = getCachedFromAliases(aliases);
        if (cached) {
            socket.emit('live-feed-state', cached);
            socket.emit('asset-status-update', cached);
        }
        for (const id of aliases) {
            io.to(`screen:${id}`).emit('request-live-state', {
                screenId: canonicalScreenId || screenId,
                viewerSocketId: socket.id,
            });
        }
    });

    // NOTE: Screen-capture live preview removed. Live feed mirrors `asset-playing` events.


    socket.on('disconnect', (reason) => {
        playerRegistry.unregister(socket.id);
        console.log('Socket disconnected:', socket.id, {
            reason,
            transport: socket.conn?.transport?.name,
            wasPlayer: !!socket.data?.isPlayer,
        });
    });
});

// Periodic heartbeat to all active viewer rooms.
// WHY: helps clients detect stale rooms even when a single asset plays for a long time.
setInterval(() => {
    try {
        const now = Date.now();
        for (const [screenId] of screenState.entries()) {
            io.to(`viewer:${screenId}`).emit('screen-heartbeat', { screenId, timestamp: now });
        }
    } catch (e) {
        // Never crash the server for a heartbeat.
    }
}, 30_000);





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
