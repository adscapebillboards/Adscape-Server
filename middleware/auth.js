const jwt = require('jsonwebtoken');
const logger = require('../config/logger');

const JWT_SECRET = process.env.JWT_SECRET;

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.split(' ')[1];
  
  if (!token) {
    logger.warn('No token provided');
    return res.status(401).json({ error: 'No token provided' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      logger.warn('Invalid token');
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    logger.debug('Token verified for user:', user.id);
    next();
  });
};

module.exports = authenticateToken; 