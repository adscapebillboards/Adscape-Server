const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();

// Middleware
app.use(express.json());
app.use(bodyParser.json());
app.use(cors({ 
  origin: [
    'http://localhost:3000',
    'http://localhost:8080',
    'https://www.adscapebillboards.com',
    'https://billboard-frontend-development.vercel.app',
    'https://billboard-admin-x.vercel.app',
    'http://localhost:5173',
    'http://localhost:5174',
    'https://adscape-player.vercel.app'
  ] 
}));

// Health check endpoint
app.get('/ping', (req, res) => {
  res.status(200).send('pong');
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use('*', (req, res) => {
  console.warn('Route not found:', req.originalUrl);
  res.status(404).json({ error: 'Route not found' });
});

module.exports = app; 