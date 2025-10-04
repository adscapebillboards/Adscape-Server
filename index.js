const http = require('http');
const app = require('./app-new');
const port = 4000;
const assetCleanupScheduler = require('./utils/assetCleanupScheduler');

const server = http.createServer(app);

// Socket.IO setup
const { Server } = require("socket.io");
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:3000", "http://127.0.0.1:5173"],
    methods: ["GET", "POST"],
    allowedHeaders: ["ngrok-skip-browser-warning"],
    credentials: true
  },
  allowEIO3: true
});

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
    console.log('Player joined:', data);
    socket.join(`player-${data.machineId}`);
    socket.emit('connected', { message: 'Connected to server' });
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
  
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
  });
});

// Make io available to other modules
app.set('io', io);

server.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
  console.log(`🔌 Socket.IO server ready`);
  
  // Start asset cleanup scheduler
  assetCleanupScheduler.start();
  console.log(`🧹 Asset cleanup scheduler started`);
});
