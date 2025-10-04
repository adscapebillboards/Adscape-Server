const logger = require('../config/logger');

const roleAuth = (allowedRoles) => {
  return (req, res, next) => {
    try {
      // Check if user exists in request (set by auth middleware)
      if (!req.user) {
        logger.warn('No user found in request');
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Check if user has a role
      if (!req.user.role) {
        logger.warn('User has no role assigned', { userId: req.user.id });
        return res.status(403).json({ error: 'No role assigned' });
      }

      // Check if user's role is in allowed roles
      if (!allowedRoles.includes(req.user.role)) {
        logger.warn('User role not authorized', { 
          userId: req.user.id, 
          userRole: req.user.role, 
          allowedRoles 
        });
        return res.status(403).json({ 
          error: 'Insufficient permissions',
          required: allowedRoles,
          current: req.user.role
        });
      }

      logger.debug('Role authorization successful', { 
        userId: req.user.id, 
        role: req.user.role 
      });
      next();
    } catch (error) {
      logger.error('Error in roleAuth middleware:', error);
      return res.status(500).json({ error: 'Authorization error' });
    }
  };
};

module.exports = roleAuth;