const prisma = require('../db/db');
const logger = require('../config/logger');

class EmailNotificationLogger {
  /**
   * Log a new email notification attempt
   */
  static async logNotification(notificationData) {
    try {
      const {
        notificationType,
        recipientEmail,
        subject,
        data = null
      } = notificationData;

      const logEntry = await prisma.emailNotification.create({
        data: {
          notificationType,
          recipientEmail,
          subject,
          status: 'pending',
          data: data ? JSON.stringify(data) : null
        }
      });

      logger.info(`Email notification logged: ${notificationType} to ${recipientEmail}`, { logId: logEntry.id });
      return logEntry;
    } catch (error) {
      logger.error('Error logging email notification:', error);
      return null;
    }
  }

  /**
   * Update notification status to sent
   */
  static async markAsSent(logId, messageId) {
    try {
      const updated = await prisma.emailNotification.update({
        where: { id: logId },
        data: {
          status: 'sent',
          messageId,
          sentAt: new Date()
        }
      });

      logger.info(`Email notification marked as sent: ${logId}`, { messageId });
      return updated;
    } catch (error) {
      logger.error('Error marking email notification as sent:', error);
      return null;
    }
  }

  /**
   * Update notification status to failed
   */
  static async markAsFailed(logId, errorMessage) {
    try {
      const updated = await prisma.emailNotification.update({
        where: { id: logId },
        data: {
          status: 'failed',
          errorMessage
        }
      });

      logger.error(`Email notification marked as failed: ${logId}`, { errorMessage });
      return updated;
    } catch (error) {
      logger.error('Error marking email notification as failed:', error);
      return null;
    }
  }

  /**
   * Update notification status to disabled
   */
  static async markAsDisabled(logId, reason = 'Notifications disabled') {
    try {
      const updated = await prisma.emailNotification.update({
        where: { id: logId },
        data: {
          status: 'disabled',
          errorMessage: reason
        }
      });

      logger.info(`Email notification marked as disabled: ${logId}`, { reason });
      return updated;
    } catch (error) {
      logger.error('Error marking email notification as disabled:', error);
      return null;
    }
  }

  /**
   * Get notification statistics
   */
  static async getStatistics(filters = {}) {
    try {
      const whereClause = {};
      
      if (filters.notificationType) {
        whereClause.notificationType = filters.notificationType;
      }
      
      if (filters.recipientEmail) {
        whereClause.recipientEmail = filters.recipientEmail;
      }
      
      if (filters.status) {
        whereClause.status = filters.status;
      }
      
      if (filters.dateFrom) {
        whereClause.createdAt = {
          gte: new Date(filters.dateFrom)
        };
      }
      
      if (filters.dateTo) {
        whereClause.createdAt = {
          ...whereClause.createdAt,
          lte: new Date(filters.dateTo)
        };
      }

      const [total, sent, failed, pending, disabled] = await Promise.all([
        prisma.emailNotification.count({ where: whereClause }),
        prisma.emailNotification.count({ where: { ...whereClause, status: 'sent' } }),
        prisma.emailNotification.count({ where: { ...whereClause, status: 'failed' } }),
        prisma.emailNotification.count({ where: { ...whereClause, status: 'pending' } }),
        prisma.emailNotification.count({ where: { ...whereClause, status: 'disabled' } })
      ]);

      return {
        total,
        sent,
        failed,
        pending,
        disabled,
        successRate: total > 0 ? ((sent / total) * 100).toFixed(2) : 0
      };
    } catch (error) {
      logger.error('Error getting email notification statistics:', error);
      return null;
    }
  }

  /**
   * Get recent notifications
   */
  static async getRecentNotifications(limit = 50, filters = {}) {
    try {
      const whereClause = {};
      
      if (filters.notificationType) {
        whereClause.notificationType = filters.notificationType;
      }
      
      if (filters.recipientEmail) {
        whereClause.recipientEmail = filters.recipientEmail;
      }
      
      if (filters.status) {
        whereClause.status = filters.status;
      }

      const notifications = await prisma.emailNotification.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          notificationType: true,
          recipientEmail: true,
          subject: true,
          status: true,
          messageId: true,
          errorMessage: true,
          sentAt: true,
          createdAt: true
        }
      });

      return notifications;
    } catch (error) {
      logger.error('Error getting recent email notifications:', error);
      return [];
    }
  }

  /**
   * Get failed notifications for retry analysis
   */
  static async getFailedNotifications(limit = 100) {
    try {
      const failedNotifications = await prisma.emailNotification.findMany({
        where: { status: 'failed' },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          notificationType: true,
          recipientEmail: true,
          subject: true,
          errorMessage: true,
          createdAt: true,
          data: true
        }
      });

      return failedNotifications;
    } catch (error) {
      logger.error('Error getting failed email notifications:', error);
      return [];
    }
  }

  /**
   * Clean up old notification logs (optional)
   */
  static async cleanupOldLogs(daysToKeep = 90) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const deleted = await prisma.emailNotification.deleteMany({
        where: {
          createdAt: {
            lt: cutoffDate
          },
          status: {
            in: ['sent', 'failed', 'disabled']
          }
        }
      });

      logger.info(`Cleaned up ${deleted.count} old email notification logs older than ${daysToKeep} days`);
      return deleted.count;
    } catch (error) {
      logger.error('Error cleaning up old email notification logs:', error);
      return 0;
    }
  }

  /**
   * Resend failed notification (for admin retry)
   */
  static async resendFailedNotification(logId) {
    try {
      const notification = await prisma.emailNotification.findUnique({
        where: { id: logId }
      });

      if (!notification || notification.status !== 'failed') {
        throw new Error('Notification not found or not failed');
      }

      // Reset status to pending for retry
      const updated = await prisma.emailNotification.update({
        where: { id: logId },
        data: {
          status: 'pending',
          errorMessage: null,
          messageId: null,
          sentAt: null
        }
      });

      logger.info(`Failed notification ${logId} reset for retry`);
      return updated;
    } catch (error) {
      logger.error('Error resetting failed notification for retry:', error);
      return null;
    }
  }
}

module.exports = EmailNotificationLogger;
