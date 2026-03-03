const http = require('http');
const app = require('./app-new'); // import your real app
const port = process.env.PORT || 4000;
const cors = require('cors');
const assetCleanupScheduler = require('./utils/assetCleanupScheduler');
const express = require('express');
const prisma = require('./db/db');
const pushRoutes = require('./routes/push');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
// Socket.IO setup
const { Server } = require("socket.io");
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: [
            "http://localhost:3000",
            "http://localhost:5173",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:5173",
            "https://your-frontend-domain.com",
            "https://adscape.co.in",
            "https://admin.adscape.co.in",
            "http://localhost:8080",
            "http://127.0.0.1:5500",
            "https://endearing-begonia-927b56.netlify.app",
            "https://bmi-client.onrender.com"
        ],
        methods: ["GET", "POST"],
        allowedHeaders: ["ngrok-skip-browser-warning"],
        credentials: true
    },
    allowEIO3: true
});

// CORS is already configured in app-new.js
// No need to add it again here as it would override the configuration

// JSON parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
    socket.on('player-join', (data) => {
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

    // Handle BMI data from test app
    socket.on('bmi-data', async (data) => {
        console.log('BMI data received:', data);

        try {
            // Store BMI data in database
            const bmiController = require('./controllers/bmiController');
            const storeResult = await bmiController.storeBMIData(data);

            if (storeResult.success) {
                console.log('BMI data stored successfully in database');
            } else {
                console.error('Failed to store BMI data:', storeResult.error);
            }
        } catch (error) {
            console.error('Error storing BMI data:', error);
        }

        // Broadcast BMI data to all connected players
        io.emit('bmi-data-received', {
            ...data,
            receivedAt: new Date().toISOString()
        });

        // Also send to specific player if device ID matches
        const targetPlayerRoom = `player-${data.deviceId}`;
        socket.to(targetPlayerRoom).emit('bmi-data-received', {
            ...data,
            receivedAt: new Date().toISOString()
        });
    });

    // -------------------------------------------------------------
    // Live Preview Support (Adscape Player -> Admin Dashboard)
    // -------------------------------------------------------------
    socket.on('request-live-preview', (data) => {
        // Dashboard client asks a given screen ID to send a snapshot
        const { screenId } = data;
        console.log(`[SOCKET] Admin requested live preview for screen: ${screenId}`);
        // Notify the specific screen to capture and send a frame
        if (screenId) {
            io.to(`screen:${screenId}`).emit('request-live-preview', { adminSocketId: socket.id });
        }
    });

    // Android App emits this back
    socket.on('live-preview-frame', (data) => {
        const { screenId, frameData, adminSocketId } = data;
        // console.log(`[SOCKET] Received live preview frame from screen: ${screenId}`);
        // Send it directly to the dashboard admin who requested it, or broadcast it to a specific admin room
        if (adminSocketId) {
            io.to(adminSocketId).emit('live-preview-frame-response', { screenId, frameData });
        } else {
            // Fallback: emit to all admins if we didn't track socket id
            io.emit('live-preview-frame-response', { screenId, frameData });
        }
    });


    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
    });
});





// Mount BMI flow routes with Socket.IO support
app.mountBMIFlowRoutes(io);
console.log('[SERVER] BMI Flow routes mounted with Socket.IO');

// Old code placeholder for reference
/*
async function generateFortuneMessage(bmiData) {
  try {
    const grokApiKey = process.env.GROK_API_KEY;
    if (!grokApiKey) {
      console.log('[GROK] No API key found, using fallback message');
      return generateFallbackFortune(bmiData);
    }

    const prompt = `Generate a positive, motivational fortune cookie message for someone with BMI ${bmiData.bmi} (${bmiData.category}). 
    Keep it short (1-2 sentences), uplifting, and health-focused. Don't mention specific BMI numbers.`;
    
    const response = await axios.post('https://api.x.ai/v1/chat/completions', {
      model: 'grok-beta',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
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
    console.error('[GROK] API error:', error.message);
    return generateFallbackFortune(bmiData);
  }
}

function generateFallbackFortune(bmiData) {
  const fortunes = [
    "Your journey to wellness is a beautiful adventure. Every step forward is progress worth celebrating.",
    "Health is not just about numbers, but about feeling strong and confident in your own skin.",
    "Small, consistent changes lead to big transformations. You're already on the right path.",
    "Your body is your temple. Treat it with love, respect, and gentle care every day.",
    "Wellness is a journey, not a destination. Enjoy the process of becoming your best self.",
    "Every healthy choice you make is an investment in your future happiness and vitality.",
    "Your commitment to health shows incredible self-love. Keep nurturing that beautiful spirit.",
    "Balance is the key to lasting wellness. Listen to your body and honor its wisdom."
  ];
  
  return fortunes[Math.floor(Math.random() * fortunes.length)];
}

// Players join rooms by screenId
io.on('connection', (socket) => {
    console.log('[SOCKET] connected', socket.id, 'from', socket.handshake.address);

    socket.on('player-join', (data) => {
        try {
            const screenId = String(data?.screenId || '');
            console.log('[SOCKET] player-join', { socketId: socket.id, screenId, data });
            if (screenId) {
                socket.join(`screen:${screenId}`);
                console.log(`[SOCKET] joined room screen:${screenId}`);
            }
        } catch (e) {
            console.error('[SOCKET] player-join error', e);
        }
    });

    socket.on('disconnect', (reason) => {
        console.log('[SOCKET] disconnected', socket.id, 'reason:', reason);
    });
});

// Health
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// POST /api/adscape/register -> Register Adscape player
app.post('/api/adscape/register', async (req, res) => {
    try {
        const { 
            screenId, 
            appVersion, 
            flowType, 
            deviceName, 
            screenWidth, 
            screenHeight, 
            ipAddress, 
            location, 
            osVersion, 
            appVersionCode 
        } = req.body || {};
        
        if (!screenId || !appVersion) {
            return res.status(400).json({ error: 'screenId and appVersion required' });
        }
        
        // Upsert Adscape player registration
        const player = await prisma.adscapePlayer.upsert({
            where: { screenId: String(screenId) },
            update: {
                appVersion: String(appVersion),
                // Only update flowType if provided, otherwise keep existing value
                ...(flowType !== undefined && flowType !== null ? { flowType: String(flowType) } : {}),
                deviceName: deviceName ? String(deviceName) : null,
                screenWidth: screenWidth ? Number(screenWidth) : null,
                screenHeight: screenHeight ? Number(screenHeight) : null,
                ipAddress: ipAddress ? String(ipAddress) : null,
                location: location ? String(location) : null,
                osVersion: osVersion ? String(osVersion) : null,
                appVersionCode: appVersionCode ? String(appVersionCode) : null,
                lastSeen: new Date(),
                isActive: true,
                updatedAt: new Date()
            },
            create: {
                screenId: String(screenId),
                appVersion: String(appVersion),
                flowType: flowType ? String(flowType) : null,
                deviceName: deviceName ? String(deviceName) : null,
                screenWidth: screenWidth ? Number(screenWidth) : null,
                screenHeight: screenHeight ? Number(screenHeight) : null,
                ipAddress: ipAddress ? String(ipAddress) : null,
                location: location ? String(location) : null,
                osVersion: osVersion ? String(osVersion) : null,
                appVersionCode: appVersionCode ? String(appVersionCode) : null,
                lastSeen: new Date(),
                isActive: true
            }
        });
        
        console.log('[ADSCAPE] Player registered:', { screenId, appVersion, flowType });
        
        return res.json({ 
            ok: true, 
            player: {
                id: player.id,
                screenId: player.screenId,
                appVersion: player.appVersion,
                flowType: player.flowType,
                isActive: player.isActive
            }
        });
    } catch (e) {
        console.error('[ADSCAPE] Registration error:', e);
        return res.status(500).json({ error: 'internal_error' });
    }
});

// GET /api/adscape/player/:screenId -> Get player flow type
app.get('/api/adscape/player/:screenId', async (req, res) => {
    try {
        const { screenId } = req.params;
        
        const player = await prisma.adscapePlayer.findUnique({
            where: { screenId: String(screenId) }
        });
        
        if (!player) {
            return res.status(404).json({ error: 'Player not found' });
        }
        
        return res.json({
            ok: true,
            player: {
                screenId: player.screenId,
                appVersion: player.appVersion,
                flowType: player.flowType,
                isActive: player.isActive
            }
        });
    } catch (e) {
        console.error('[ADSCAPE] Get player error:', e);
        return res.status(500).json({ error: 'internal_error' });
    }
});

// GET /api/adscape/players -> Get all players
app.get('/api/adscape/players', async (req, res) => {
    try {
        console.log('[ADSCAPE] Getting all players');
        
        const players = await prisma.adscapePlayer.findMany({
            orderBy: { lastSeen: 'desc' }
        });
        
        res.json({ 
            success: true, 
            players 
        });
    } catch (error) {
        console.error('[ADSCAPE] Get players error:', error);
        res.status(500).json({ error: 'Failed to get players' });
    }
});

// PUT /api/adscape/player/:screenId/flow-type -> Update player flow type
app.put('/api/adscape/player/:screenId/flow-type', async (req, res) => {
    try {
        const { screenId } = req.params;
        const { flowType } = req.body;
        
        console.log('[ADSCAPE] Updating flow type for player:', screenId, 'to:', flowType);
        
        const player = await prisma.adscapePlayer.update({
            where: { screenId },
            data: { flowType }
        });
        
        res.json({ 
            success: true, 
            player 
        });
    } catch (error) {
        console.error('[ADSCAPE] Update flow type error:', error);
        res.status(500).json({ error: 'Failed to update flow type' });
    }
});

// DELETE /api/adscape/player/:screenId -> Delete player
app.delete('/api/adscape/player/:screenId', async (req, res) => {
    try {
        const { screenId } = req.params;
        console.log('[ADSCAPE] Deleting player:', screenId);
        
        await prisma.adscapePlayer.delete({
            where: { screenId }
        });
        
        res.json({ 
            success: true, 
            message: 'Player deleted successfully' 
        });
    } catch (error) {
        console.error('[ADSCAPE] Delete player error:', error);
        res.status(500).json({ error: 'Failed to delete player' });
    }
});

// Compute BMI helper
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

// Calculate streak helper
function calculateStreak(bmiRecords) {
    if (!bmiRecords || bmiRecords.length === 0) return { currentStreak: 0, longestStreak: 0, isActive: false };
    
    // Sort records by date (newest first)
    const sortedRecords = bmiRecords.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;
    let isActive = false;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Group records by date (ignore time)
    const recordsByDate = new Map();
    sortedRecords.forEach(record => {
        const dateKey = new Date(record.timestamp);
        dateKey.setHours(0, 0, 0, 0);
        const dateString = dateKey.toISOString().split('T')[0];
        if (!recordsByDate.has(dateString)) {
            recordsByDate.set(dateString, record);
        }
    });
    
    const uniqueDates = Array.from(recordsByDate.keys()).sort().reverse();
    
    if (uniqueDates.length === 0) return { currentStreak: 0, longestStreak: 0, isActive: false };
    
    // Check if most recent record is today or yesterday
    const mostRecentDate = new Date(uniqueDates[0]);
    const daysDiff = Math.floor((today - mostRecentDate) / (1000 * 60 * 60 * 24));
    
    if (daysDiff <= 1) {
        isActive = true;
        currentStreak = 1;
        
        // Calculate current streak
        for (let i = 1; i < uniqueDates.length; i++) {
            const currentDate = new Date(uniqueDates[i]);
            const prevDate = new Date(uniqueDates[i - 1]);
            const diff = Math.floor((prevDate - currentDate) / (1000 * 60 * 60 * 24));
            
            if (diff === 1) {
                currentStreak++;
            } else {
                break;
            }
        }
    }
    
    // Calculate longest streak
    tempStreak = 1;
    longestStreak = 1;
    
    for (let i = 1; i < uniqueDates.length; i++) {
        const currentDate = new Date(uniqueDates[i]);
        const prevDate = new Date(uniqueDates[i - 1]);
        const diff = Math.floor((prevDate - currentDate) / (1000 * 60 * 60 * 24));
        
        if (diff === 1) {
            tempStreak++;
        } else {
            longestStreak = Math.max(longestStreak, tempStreak);
            tempStreak = 1;
        }
    }
    longestStreak = Math.max(longestStreak, tempStreak);
    
    return { currentStreak, longestStreak, isActive };
}

// POST /api/bmi -> { heightCm, weightKg, screenId, appVersion }
app.post('/api/bmi', async (req, res) => {
    try {
        const { heightCm, weightKg, screenId, appVersion } = req.body || {};
        if (!heightCm || !weightKg || !screenId) {
            return res.status(400).json({ error: 'heightCm, weightKg, screenId required' });
        }
    	
        // Get the registered player's flow type from database
        let playerFlowType = null;
        try {
            const player = await prisma.adscapePlayer.findUnique({
                where: { screenId: String(screenId) }
            });
            playerFlowType = player?.flowType;
            console.log('[BMI] Player flow type from DB:', playerFlowType, 'for screenId:', screenId);
        } catch (e) {
            console.log('[BMI] Could not fetch player flow type:', e.message);
        }
    	
        const { bmi, category } = computeBMI(heightCm, weightKg);
        const bmiId = uuidv4();
        const timestamp = new Date().toISOString();
        // Generate fortune cookie message for F2 flow, null for F1 (will be generated after payment)
        // Use player's flow type from DB, fallback to appVersion from request
        const effectiveFlowType = playerFlowType || appVersion;
        const fortune = (effectiveFlowType === 'F2' || effectiveFlowType === 'f2') ? await generateFortuneMessage({ bmi, category }) : null;
        console.log('[BMI] Effective flow type:', effectiveFlowType, 'fortune generated:', !!fortune);
        
        const payload = {
            bmiId,
            screenId: String(screenId),
            height: Number(heightCm),
            weight: Number(weightKg),
            bmi,
            category,
            timestamp,
            fortune
        };
        bmiStore.set(bmiId, payload);

        // Upsert Screen and create BMI record
        await prisma.screen.upsert({
            where: { id: String(screenId) },
            create: { id: String(screenId) },
            update: {}
        });
        
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
                appVersion: appVersion || null,
                location: req.body.location || null,
                fortune: fortune
            }
        });

        // Build web client URL (adjust if you host client elsewhere)
        const clientBase = process.env.CLIENT_BASE_URL || 'https://bmi-client.onrender.com';
        // Provide API base in URL hash so SPA can call backend even when hosted elsewhere
        const inferredProto = (req.headers['x-forwarded-proto'] || '').toString().split(',')[0] || req.protocol;
        const apiBase = process.env.API_PUBLIC_BASE || `${inferredProto}://${req.get('host')}`;
        // Use effective flow type for web URL (convert to lowercase for client compatibility)
        const version = (effectiveFlowType || appVersion || 'f1').toLowerCase();
        const webUrl = `${clientBase}?screenId=${encodeURIComponent(String(screenId))}&bmiId=${encodeURIComponent(bmiId)}&appVersion=${encodeURIComponent(version)}#server=${encodeURIComponent(apiBase)}`;

        // Emit to the Android player room so it can open a modal
        const emitPayload = {
            ...payload,
            webUrl
        };
        io.to(`screen:${String(screenId)}`).emit('bmi-data-received', emitPayload);
        console.log('[BMI] created and emitted', emitPayload);

        return res.status(201).json({ ok: true, bmiId, webUrl });
    } catch (e) {
        console.error('[BMI] POST /api/bmi error', e);
        return res.status(500).json({ error: 'internal_error' });
    }
});

// POST /api/user -> { name, mobile } -> create or find user
app.post('/api/user', async (req, res) => {
    try {
        const { name, mobile } = req.body || {};
        if (!name || !mobile) {
            return res.status(400).json({ error: 'name, mobile required' });
        }
        
        // Try to find existing user by mobile, otherwise create new
        let user = await prisma.user.findFirst({
            where: { mobile: String(mobile) }
        });
        
        if (!user) {
            user = await prisma.user.create({
                data: {
                    name: String(name),
                    mobile: String(mobile)
                }
            });
        }
        
        return res.json({ userId: user.id, name: user.name, mobile: user.mobile });
    } catch (e) {
        console.error('[USER] POST /api/user error', e);
        return res.status(500).json({ error: 'internal_error' });
    }
});

// POST /api/payment-success -> { userId, bmiId } -> link user to BMI and emit to Android
app.post('/api/payment-success', async (req, res) => {
    try {
        const { userId, bmiId, appVersion } = req.body || {};
        if (!userId || !bmiId) {
            return res.status(400).json({ error: 'userId, bmiId required' });
        }
        
        // Update BMI record with user
        const updatedBMI = await prisma.bMI.update({
            where: { id: bmiId },
            data: { userId: userId },
            include: { user: true, screen: true }
        });
        
        // Generate fortune immediately for F1 flow
        if (appVersion !== 'f2') {
            console.log('[PAYMENT] F1 Flow: Generating fortune immediately');
            const fortuneMessage = await generateFortuneMessage({
                bmi: updatedBMI.bmi,
                category: updatedBMI.category
            });
            
            // Update BMI record with generated fortune
            await prisma.bMI.update({
                where: { id: bmiId },
                data: { fortune: fortuneMessage }
            });
            
            console.log('[PAYMENT] F1 Flow: Fortune generated and stored:', fortuneMessage);
        }
        
       // Emit payment success to Android screen (only for non-F2 versions)
        if (appVersion !== 'f2') {
            io.to(`screen:${updatedBMI.screenId}`).emit('payment-success', {
                bmiId: updatedBMI.id,
                screenId: updatedBMI.screenId,
                userId: updatedBMI.userId,
                user: updatedBMI.user,
                bmi: updatedBMI.bmi,
                category: updatedBMI.category,
                height: updatedBMI.heightCm,
                weight: updatedBMI.weightKg,
                timestamp: updatedBMI.timestamp.toISOString()
            });
            console.log('[PAYMENT] Success emitted to screen:', updatedBMI.screenId);
        } else {
            console.log('[PAYMENT] F2 version - skipping socket emission to Android');
        }
        
        console.log('[PAYMENT] Success emitted to screen:', updatedBMI.screenId);
        
        return res.json({ ok: true, message: 'Payment processed successfully' });
    } catch (e) {
        console.error('[PAYMENT] POST /api/payment-success error', e);
        return res.status(500).json({ error: 'internal_error' });
    }
});

// POST /api/progress-start -> { bmiId } -> emit progress start to both web and Android
app.post('/api/progress-start', async (req, res) => {
    try {
        const { bmiId } = req.body || {};
        if (!bmiId) {
            return res.status(400).json({ error: 'bmiId required' });
        }
        
        // Get BMI data
        const bmiData = await prisma.bMI.findUnique({
            where: { id: bmiId },
            include: { user: true, screen: true }
        });
        
        if (!bmiData) {
            return res.status(404).json({ error: 'BMI data not found' });
        }
        
        // Emit progress start to Android screen
        io.to(`screen:${bmiData.screenId}`).emit('progress-start', {
            bmiId: bmiData.id,
            screenId: bmiData.screenId,
            userId: bmiData.userId,
            user: bmiData.user,
            bmi: bmiData.bmi,
            category: bmiData.category,
            height: bmiData.heightCm,
            weight: bmiData.weightKg,
            timestamp: bmiData.timestamp.toISOString(),
            progressComplete: true // Flag to indicate this is progress start data
        });
        
        console.log('[PROGRESS] Start emitted to screen:', bmiData.screenId);
        
        return res.json({ ok: true, message: 'Progress started' });
    } catch (e) {
        console.error('[PROGRESS] POST /api/progress-start error', e);
        return res.status(500).json({ error: 'internal_error' });
    }
});

// POST /api/fortune-generate -> { bmiId } -> generate fortune and emit to both web and Android
app.post('/api/fortune-generate', async (req, res) => {
    try {
        console.log('[FORTUNE] Request body:', req.body);
        console.log('[FORTUNE] Request body type:', typeof req.body);
        
        const { bmiId, appVersion } = req.body || {};
        console.log('[FORTUNE] Extracted bmiId:', bmiId, 'appVersion:', appVersion);
        
        if (!bmiId) {
            console.log('[FORTUNE] Missing bmiId in request');
            return res.status(400).json({ error: 'bmiId required' });
        }
        
        // Get BMI data
        const bmiData = await prisma.bMI.findUnique({
            where: { id: bmiId },
            include: { user: true, screen: true }
        });
        
        if (!bmiData) {
            return res.status(404).json({ error: 'BMI data not found' });
        }
        
        // Use existing fortune if available, otherwise generate new one
        let fortuneMessage = bmiData.fortune;
        if (!fortuneMessage) {
            console.log('[FORTUNE] No existing fortune, generating new one');
            fortuneMessage = await generateFortuneMessage({
                bmi: bmiData.bmi,
                category: bmiData.category
            });
            
            // Update BMI record with generated fortune
            await prisma.bMI.update({
                where: { id: bmiId },
                data: { fortune: fortuneMessage }
            });
        } else {
            console.log('[FORTUNE] Using existing fortune from database');
        }
        
        const fortuneData = {
            bmiId: bmiData.id,
            screenId: bmiData.screenId,
            userId: bmiData.userId,
            user: bmiData.user,
            bmi: bmiData.bmi,
            category: bmiData.category,
            height: bmiData.heightCm,
            weight: bmiData.weightKg,
            timestamp: bmiData.timestamp.toISOString(),
            fortuneMessage: fortuneMessage
        };
        
        // Emit fortune to Android screen (only for non-F2 versions)
        if (appVersion !== 'f2') {
            io.to(`screen:${bmiData.screenId}`).emit('fortune-ready', fortuneData);
            console.log('[FORTUNE] Generated and emitted to screen:', bmiData.screenId);
        } else {
            console.log('[FORTUNE] F2 version - skipping socket emission to Android');
        }
        
        console.log('[FORTUNE] Message:', fortuneMessage);
        
        return res.json({ ok: true, fortuneMessage, data: fortuneData });
    } catch (e) {
        console.error('[FORTUNE] POST /api/fortune-generate error', e);
        return res.status(500).json({ error: 'internal_error' });
    }
});

// GET /api/user/:userId/analytics -> return user analytics data
app.get('/api/user/:userId/analytics', async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Get all BMI records for user
        const bmiRecords = await prisma.bMI.findMany({
            where: { userId: userId },
            orderBy: { timestamp: 'desc' },
            include: {
                screen: true
            }
        });
        
        if (bmiRecords.length === 0) {
            return res.json({
                totalRecords: 0,
                recentBMI: null,
                streak: { currentStreak: 0, longestStreak: 0, isActive: false },
                trends: [],
                categoryDistribution: {},
                averageBMI: 0
            });
        }
        
        // Calculate streak
        const streak = calculateStreak(bmiRecords);
        
        // Get recent BMI (most recent record)
        const recentBMI = {
            id: bmiRecords[0].id,
            bmi: bmiRecords[0].bmi,
            category: bmiRecords[0].category,
            height: bmiRecords[0].heightCm,
            weight: bmiRecords[0].weightKg,
            timestamp: bmiRecords[0].timestamp.toISOString(),
            screenId: bmiRecords[0].screenId,
            deviceId: bmiRecords[0].deviceId,
            location: bmiRecords[0].location,
            fortune: bmiRecords[0].fortune
        };
        
        // Calculate trends (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const recentRecords = bmiRecords.filter(record => 
            new Date(record.timestamp) >= thirtyDaysAgo
        );
        
        const trends = recentRecords.map(record => ({
            date: record.timestamp.toISOString().split('T')[0],
            bmi: record.bmi,
            weight: record.weightKg,
            category: record.category
        })).reverse(); // Oldest first for chart
        
        // Category distribution
        const categoryDistribution = {};
        bmiRecords.forEach(record => {
            categoryDistribution[record.category] = (categoryDistribution[record.category] || 0) + 1;
        });
        
        // Average BMI
        const averageBMI = Number((bmiRecords.reduce((sum, record) => sum + record.bmi, 0) / bmiRecords.length).toFixed(1));
        
        return res.json({
            totalRecords: bmiRecords.length,
            recentBMI,
            streak,
            trends,
            categoryDistribution,
            averageBMI,
            firstRecord: bmiRecords[bmiRecords.length - 1].timestamp.toISOString(),
            lastRecord: bmiRecords[0].timestamp.toISOString()
        });
    } catch (e) {
        console.error('[ANALYTICS] GET /api/user/:userId/analytics error', e);
        return res.status(500).json({ error: 'internal_error' });
    }
});

// POST /api/bmi/:id/link-user -> link BMI record to user
app.post('/api/bmi/:id/link-user', async (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = req.body;
        
        if (!userId) {
            return res.status(400).json({ error: 'userId required' });
        }
        
        console.log(`[BMI-LINK] Linking BMI ${id} to user ${userId}`);
        
        // Update BMI record with user ID
        const updatedBMI = await prisma.bMI.update({
            where: { id },
            data: { userId },
            include: {
                user: true,
                screen: true
            }
        });
        
        console.log(`[BMI-LINK] Successfully linked BMI to user: ${updatedBMI.user?.name}`);
        
        return res.json({ 
            ok: true, 
            message: 'BMI record linked to user successfully',
            bmi: {
                bmiId: updatedBMI.id,
                screenId: updatedBMI.screenId,
                height: updatedBMI.heightCm,
                weight: updatedBMI.weightKg,
                bmi: updatedBMI.bmi,
                category: updatedBMI.category,
                timestamp: updatedBMI.timestamp.toISOString(),
                userId: updatedBMI.userId,
                user: updatedBMI.user ? {
                    id: updatedBMI.user.id,
                    name: updatedBMI.user.name,
                    mobile: updatedBMI.user.mobile
                } : null
            }
        });
    } catch (e) {
        console.error('[BMI-LINK] Error linking BMI to user:', e);
        return res.status(500).json({ error: 'internal_error' });
    }
});

// GET /api/bmi/:id -> return stored payload
app.get('/api/bmi/:id', async (req, res) => {
    const id = req.params.id;
    console.log(`[BMI] GET request for id: ${id}`);
    
    try {
        // Try in-memory store first
        const mem = bmiStore.get(id);
        if (mem) {
            console.log(`[BMI] Found in memory:`, mem);
            return res.json(mem);
        }
        
        console.log(`[BMI] Searching database for id: ${id}`);
        const row = await prisma.bMI.findUnique({ 
            where: { id },
            include: {
                user: true,
                screen: true
            }
        });
        
        if (!row) {
            console.log(`[BMI] Not found in database: ${id}`);
            return res.status(404).json({ 
                error: 'not_found', 
                message: `BMI record ${id} not found`,
                id: id
            });
        }
        
        const result = {
            bmiId: row.id,
            screenId: row.screenId,
            height: row.heightCm,
            weight: row.weightKg,
            bmi: row.bmi,
            category: row.category,
            timestamp: row.timestamp.toISOString(),
            fortune: row.fortune,
            userId: row.userId,
            user: row.user ? {
                id: row.user.id,
                name: row.user.name,
                mobile: row.user.mobile
            } : null
        };
        
        console.log(`[BMI] Found in database:`, result);
        return res.json(result);
    } catch (e) {
        console.error('[BMI] GET error', e);
        return res.status(500).json({ 
            error: 'internal_error', 
            message: e.message,
            stack: e.stack
        });
    }
});

// Debug connections
app.get('/api/debug/connections', (_req, res) => {
    try {
        const rooms = [];
        io.sockets.adapter.rooms.forEach((socketsSet, room) => {
            rooms.push({ room, size: socketsSet.size });
        });
        const sockets = [];
        io.sockets.sockets.forEach((sock) => sockets.push(sock.id));
        res.json({ rooms, sockets });
    } catch (e) {
        res.status(500).json({ error: 'debug_error' });
    }
});

*/

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
