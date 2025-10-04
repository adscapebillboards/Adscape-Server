const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const logger = require('../config/logger');

class SuperAdminEmailService {
  /**
   * Get all active superadmin emails
   */
  static async getActiveEmails() {
    try {
      const emails = await prisma.superAdminEmail.findMany({
        where: { isActive: true },
        select: {
          id: true,
          email: true,
          name: true,
          notificationTypes: true
        }
      });

      return emails;
    } catch (error) {
      logger.error('Error fetching active superadmin emails:', error);
      return [];
    }
  }

  /**
   * Get superadmin emails for a specific notification type
   */
  static async getEmailsForNotificationType(notificationType) {
    try {
      const emails = await prisma.superAdminEmail.findMany({
        where: {
          isActive: true,
          notificationTypes: {
            has: notificationType
          }
        },
        select: {
          id: true,
          email: true,
          name: true
        }
      });

      return emails;
    } catch (error) {
      logger.error(`Error fetching superadmin emails for ${notificationType}:`, error);
      return [];
    }
  }

  /**
   * Add a new superadmin email
   */
  static async addEmail(emailData) {
    try {
      const { email, name, notificationTypes = [] } = emailData;

      // Validate email format
      if (!email || !email.includes('@')) {
        throw new Error('Invalid email address');
      }

      const newEmail = await prisma.superAdminEmail.create({
        data: {
          email: email.toLowerCase().trim(),
          name: name?.trim(),
          notificationTypes: notificationTypes.length > 0 ? notificationTypes : [
            'campaignCreated',
            'publisherAccountCreated',
            'billboardVerificationRequest'
          ]
        }
      });

      logger.info(`Superadmin email added: ${email}`, { id: newEmail.id });
      return newEmail;
    } catch (error) {
      logger.error('Error adding superadmin email:', error);
      throw error;
    }
  }

  /**
   * Update an existing superadmin email
   */
  static async updateEmail(id, updateData) {
    try {
      const { email, name, isActive, notificationTypes } = updateData;

      // Validate email format if provided
      if (email && !email.includes('@')) {
        throw new Error('Invalid email address');
      }

      const updatedEmail = await prisma.superAdminEmail.update({
        where: { id: parseInt(id) },
        data: {
          ...(email && { email: email.toLowerCase().trim() }),
          ...(name !== undefined && { name: name?.trim() }),
          ...(isActive !== undefined && { isActive }),
          ...(notificationTypes && { notificationTypes })
        }
      });

      logger.info(`Superadmin email updated: ${updatedEmail.email}`, { id: updatedEmail.id });
      return updatedEmail;
    } catch (error) {
      logger.error('Error updating superadmin email:', error);
      throw error;
    }
  }

  /**
   * Delete a superadmin email
   */
  static async deleteEmail(id) {
    try {
      const deletedEmail = await prisma.superAdminEmail.delete({
        where: { id: parseInt(id) }
      });

      logger.info(`Superadmin email deleted: ${deletedEmail.email}`, { id: deletedEmail.id });
      return deletedEmail;
    } catch (error) {
      logger.error('Error deleting superadmin email:', error);
      throw error;
    }
  }

  /**
   * Toggle email active status
   */
  static async toggleEmailStatus(id) {
    try {
      const currentEmail = await prisma.superAdminEmail.findUnique({
        where: { id: parseInt(id) }
      });

      if (!currentEmail) {
        throw new Error('Email not found');
      }

      const updatedEmail = await prisma.superAdminEmail.update({
        where: { id: parseInt(id) },
        data: { isActive: !currentEmail.isActive }
      });

      logger.info(`Superadmin email status toggled: ${updatedEmail.email} is now ${updatedEmail.isActive ? 'active' : 'inactive'}`);
      return updatedEmail;
    } catch (error) {
      logger.error('Error toggling email status:', error);
      throw error;
    }
  }

  /**
   * Get all superadmin emails (including inactive)
   */
  static async getAllEmails() {
    try {
      const emails = await prisma.superAdminEmail.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          isActive: true,
          notificationTypes: true,
          createdAt: true,
          updatedAt: true
        }
      });

      return emails;
    } catch (error) {
      logger.error('Error fetching all superadmin emails:', error);
      return [];
    }
  }

  /**
   * Check if an email exists
   */
  static async emailExists(email) {
    try {
      const existingEmail = await prisma.superAdminEmail.findUnique({
        where: { email: email.toLowerCase().trim() }
      });

      return !!existingEmail;
    } catch (error) {
      logger.error('Error checking if email exists:', error);
      return false;
    }
  }

  /**
   * Get email statistics
   */
  static async getEmailStatistics() {
    try {
      const [total, active, inactive] = await Promise.all([
        prisma.superAdminEmail.count(),
        prisma.superAdminEmail.count({ where: { isActive: true } }),
        prisma.superAdminEmail.count({ where: { isActive: false } })
      ]);

      return {
        total,
        active,
        inactive,
        activePercentage: total > 0 ? ((active / total) * 100).toFixed(2) : 0
      };
    } catch (error) {
      logger.error('Error getting email statistics:', error);
      return null;
    }
  }

  /**
   * Bulk update notification types for an email
   */
  static async updateNotificationTypes(id, notificationTypes) {
    try {
      const updatedEmail = await prisma.superAdminEmail.update({
        where: { id: parseInt(id) },
        data: { notificationTypes }
      });

      logger.info(`Notification types updated for ${updatedEmail.email}`, { notificationTypes });
      return updatedEmail;
    } catch (error) {
      logger.error('Error updating notification types:', error);
      throw error;
    }
  }

  /**
   * Get emails by notification type
   */
  static async getEmailsByNotificationType(notificationType) {
    try {
      const emails = await prisma.superAdminEmail.findMany({
        where: {
          isActive: true,
          notificationTypes: {
            has: notificationType
          }
        },
        select: {
          id: true,
          email: true,
          name: true
        }
      });

      return emails;
    } catch (error) {
      logger.error(`Error fetching emails for notification type ${notificationType}:`, error);
      return [];
    }
  }
}

module.exports = SuperAdminEmailService;
