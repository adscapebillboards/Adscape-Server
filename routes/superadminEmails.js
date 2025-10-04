const express = require('express');
const router = express.Router();
const SuperAdminEmailService = require('../services/superadminEmailService');
const auth = require('../middleware/auth');
const roleAuth = require('../middleware/roleAuth');
const logger = require('../config/logger');

// All routes require authentication and superadmin role
router.use(auth);
router.use(roleAuth(['superadmin']));

/**
 * GET /api/superadmin-emails
 * Get all superadmin emails
 */
router.get('/', async (req, res) => {
  try {
    const emails = await SuperAdminEmailService.getAllEmails();
    res.json({
      success: true,
      data: emails
    });
  } catch (error) {
    logger.error('Error fetching superadmin emails:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch superadmin emails',
      error: error.message
    });
  }
});

/**
 * GET /api/superadmin-emails/active
 * Get only active superadmin emails
 */
router.get('/active', async (req, res) => {
  try {
    const emails = await SuperAdminEmailService.getActiveEmails();
    res.json({
      success: true,
      data: emails
    });
  } catch (error) {
    logger.error('Error fetching active superadmin emails:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch active superadmin emails',
      error: error.message
    });
  }
});

/**
 * GET /api/superadmin-emails/statistics
 * Get email statistics
 */
router.get('/statistics', async (req, res) => {
  try {
    const stats = await SuperAdminEmailService.getEmailStatistics();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Error fetching email statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch email statistics',
      error: error.message
    });
  }
});

/**
 * POST /api/superadmin-emails
 * Add a new superadmin email
 */
router.post('/', async (req, res) => {
  try {
    const { email, name, notificationTypes } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Check if email already exists
    const emailExists = await SuperAdminEmailService.emailExists(email);
    if (emailExists) {
      return res.status(400).json({
        success: false,
        message: 'Email already exists'
      });
    }

    const newEmail = await SuperAdminEmailService.addEmail({
      email,
      name,
      notificationTypes
    });

    res.status(201).json({
      success: true,
      message: 'Superadmin email added successfully',
      data: newEmail
    });
  } catch (error) {
    logger.error('Error adding superadmin email:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add superadmin email',
      error: error.message
    });
  }
});

/**
 * PUT /api/superadmin-emails/:id
 * Update an existing superadmin email
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const updatedEmail = await SuperAdminEmailService.updateEmail(id, updateData);

    res.json({
      success: true,
      message: 'Superadmin email updated successfully',
      data: updatedEmail
    });
  } catch (error) {
    logger.error('Error updating superadmin email:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update superadmin email',
      error: error.message
    });
  }
});

/**
 * DELETE /api/superadmin-emails/:id
 * Delete a superadmin email
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const deletedEmail = await SuperAdminEmailService.deleteEmail(id);

    res.json({
      success: true,
      message: 'Superadmin email deleted successfully',
      data: deletedEmail
    });
  } catch (error) {
    logger.error('Error deleting superadmin email:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete superadmin email',
      error: error.message
    });
  }
});

/**
 * PATCH /api/superadmin-emails/:id/toggle
 * Toggle email active status
 */
router.patch('/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;

    const updatedEmail = await SuperAdminEmailService.toggleEmailStatus(id);

    res.json({
      success: true,
      message: `Email status toggled successfully. ${updatedEmail.email} is now ${updatedEmail.isActive ? 'active' : 'inactive'}`,
      data: updatedEmail
    });
  } catch (error) {
    logger.error('Error toggling email status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle email status',
      error: error.message
    });
  }
});

/**
 * PUT /api/superadmin-emails/:id/notification-types
 * Update notification types for an email
 */
router.put('/:id/notification-types', async (req, res) => {
  try {
    const { id } = req.params;
    const { notificationTypes } = req.body;

    if (!Array.isArray(notificationTypes)) {
      return res.status(400).json({
        success: false,
        message: 'Notification types must be an array'
      });
    }

    const updatedEmail = await SuperAdminEmailService.updateNotificationTypes(id, notificationTypes);

    res.json({
      success: true,
      message: 'Notification types updated successfully',
      data: updatedEmail
    });
  } catch (error) {
    logger.error('Error updating notification types:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update notification types',
      error: error.message
    });
  }
});

/**
 * GET /api/superadmin-emails/notification-type/:type
 * Get emails for a specific notification type
 */
router.get('/notification-type/:type', async (req, res) => {
  try {
    const { type } = req.params;

    const emails = await SuperAdminEmailService.getEmailsByNotificationType(type);

    res.json({
      success: true,
      data: emails
    });
  } catch (error) {
    logger.error('Error fetching emails for notification type:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch emails for notification type',
      error: error.message
    });
  }
});

module.exports = router;
