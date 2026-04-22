const prisma = require('../db/db');
const logger = require('../config/logger');
const { flattenGeneratedSlotRecords } = require('./generatedSlotFormat');

/**
 * Asset Cleanup Scheduler
 * Automatically removes expired assets from the database and notifies players
 */

class AssetCleanupScheduler {
  constructor() {
    this.isRunning = false;
    this.intervalId = null;
    this.availabilityIntervalId = null;
  }

  /**
   * Start the cleanup scheduler
   * Runs every hour to check for expired assets
   */
  start() {
    if (this.isRunning) {
      logger.info('Asset cleanup scheduler is already running');
      return;
    }

    logger.info('Starting asset cleanup scheduler...');
    this.isRunning = true;

    // Run cleanup immediately on start
    this.runCleanup();

    // Schedule cleanup every hour
    this.intervalId = setInterval(() => {
      this.runCleanup();
    }, 60 * 60 * 1000); // 1 hour

    logger.info('Asset cleanup scheduler started - will run every hour');

    // Run availability maintenance daily at 02:00 server time
    this.scheduleAvailabilityMaintenance();
  }

  /**
   * Stop the cleanup scheduler
   */
  stop() {
    if (!this.isRunning) {
      logger.info('Asset cleanup scheduler is not running');
      return;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;
    logger.info('Asset cleanup scheduler stopped');

    if (this.availabilityIntervalId) {
      clearInterval(this.availabilityIntervalId);
      this.availabilityIntervalId = null;
    }
  }

  /**
   * Run the cleanup process
   */
  async runCleanup() {
    try {
      logger.info('🧹 Starting asset cleanup process...');
      
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Start of today

      const slotRecords = await prisma.generatedSlot.findMany();
      const expiredSlots = flattenGeneratedSlotRecords(slotRecords)
        .filter(slot => slot.endDate < today);

      if (expiredSlots.length === 0) {
        logger.info('✅ No expired assets found');
        return;
      }

      logger.info(`🗑️ Found ${expiredSlots.length} expired assets to clean up`);

      // Fetch campaign details in a second query (no relation defined on GeneratedSlot)
      const campaignIds = Array.from(new Set(expiredSlots.map(s => s.campaignId).filter(Boolean)));
      const campaigns = campaignIds.length > 0
        ? await prisma.campaign.findMany({
            where: { id: { in: campaignIds } },
            select: { id: true, campaignName: true, userName: true }
          })
        : [];
      const campaignMap = new Map(campaigns.map(c => [c.id, c]));

      // Group by campaign for logging
      const campaignGroups = {};
      expiredSlots.forEach(slot => {
        const campaignId = slot.campaignId || 'unknown';
        if (!campaignGroups[campaignId]) {
          campaignGroups[campaignId] = {
            campaign: campaignMap.get(campaignId) || { id: campaignId, campaignName: '(unknown)', userName: '(unknown)' },
            slots: []
          };
        }
        campaignGroups[campaignId].slots.push(slot);
      });

      // Log cleanup details
      for (const [campaignId, group] of Object.entries(campaignGroups)) {
        logger.info(`📋 Campaign: ${group.campaign.campaignName} (${group.campaign.userName})`);
        logger.info(`   Expired slots: ${group.slots.length}`);
        group.slots.forEach(slot => {
          logger.info(`   - Slot ${slot.slotNumber}: ${slot.assetUrl} (expired: ${slot.endDate.toDateString()})`);
        });
      }

      let deletedCount = 0;
      for (const record of slotRecords) {
        const updatedSlots = {};
        let recordChanged = false;

        for (const [billboardId, billboardSlots] of Object.entries(record.slots || {})) {
          const activeSlots = (Array.isArray(billboardSlots) ? billboardSlots : []).filter(slot => {
            const endIso = slot.timerange?.endDateIso || slot.endDate || slot.end_date;
            const endDate = endIso ? new Date(endIso) : null;
            const isExpired = endDate && !Number.isNaN(endDate.getTime()) && endDate < today;
            if (isExpired) {
              deletedCount += 1;
              recordChanged = true;
            }
            return !isExpired;
          });

          if (activeSlots.length > 0) {
            updatedSlots[billboardId] = activeSlots;
          } else if (Array.isArray(billboardSlots) && billboardSlots.length > 0) {
            recordChanged = true;
          }
        }

        if (recordChanged) {
          if (Object.keys(updatedSlots).length === 0) {
            await prisma.generatedSlot.delete({ where: { id: record.id } });
          } else {
            await prisma.generatedSlot.update({
              where: { id: record.id },
              data: {
                slots: updatedSlots,
                billboardIds: Object.keys(updatedSlots)
              }
            });
          }
        }
      }

      logger.info(`✅ Cleaned up ${deletedCount} expired assets`);

      // TODO: Notify players to remove expired assets from local storage
      await this.notifyPlayersOfCleanup(expiredSlots);

    } catch (error) {
      logger.error('❌ Error during asset cleanup:', error);
    }
  }

  /**
   * Notify players about expired assets
   * @param {Array} expiredSlots - Array of expired slot objects
   */
  async notifyPlayersOfCleanup(expiredSlots) {
    try {
      // Group expired assets by screen_id
      const screenAssets = {};
      expiredSlots.forEach(slot => {
        if (slot.screenId) {
          if (!screenAssets[slot.screenId]) {
            screenAssets[slot.screenId] = [];
          }
          screenAssets[slot.screenId].push({
            slotNumber: slot.slotNumber,
            assetUrl: slot.assetUrl,
            endDate: slot.endDate
          });
        }
      });

      // Log notification details
      const screenCount = Object.keys(screenAssets).length;
      logger.info(`📢 Notifying ${screenCount} players about expired assets`);

      for (const [screenId, assets] of Object.entries(screenAssets)) {
        logger.info(`   Screen ${screenId}: ${assets.length} expired assets`);
        // TODO: Implement actual player notification
      }

    } catch (error) {
      logger.error('❌ Error notifying players of cleanup:', error);
    }
  }

  /**
   * Get cleanup statistics
   */
  async getCleanupStats() {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const slotRecords = await prisma.generatedSlot.findMany();
      const allSlots = flattenGeneratedSlotRecords(slotRecords);
      const totalSlots = allSlots.length;
      const expiredSlots = allSlots.filter(slot => slot.endDate < today).length;
      const activeSlots = totalSlots - expiredSlots;

      return {
        total: totalSlots,
        active: activeSlots,
        expired: expiredSlots,
        lastCleanup: this.lastCleanupTime || null
      };
    } catch (error) {
      logger.error('❌ Error getting cleanup stats:', error);
      return null;
    }
  }

  /**
   * Manual cleanup trigger
   */
  async manualCleanup() {
    logger.info('🔧 Manual asset cleanup triggered');
    await this.runCleanup();
  }

  scheduleAvailabilityMaintenance() {
    try {
      // Compute ms until next 02:00
      const now = new Date();
      const next = new Date();
      next.setHours(2, 0, 0, 0);
      if (next <= now) next.setDate(next.getDate() + 1);
      const delay = next.getTime() - now.getTime();
      setTimeout(async () => {
        await runAvailabilityMaintenance();
        // Then every 24h
        this.availabilityIntervalId = setInterval(runAvailabilityMaintenance, 24 * 60 * 60 * 1000);
      }, delay);
      logger.info('Availability maintenance scheduled for daily 02:00');
    } catch (e) {
      logger.warn('Failed scheduling availability maintenance:', e.message);
    }
  }
}

// Create singleton instance
const assetCleanupScheduler = new AssetCleanupScheduler();

module.exports = assetCleanupScheduler;

// Availability maintenance runner
async function runAvailabilityMaintenance() {
  try {
    const now = new Date();
    const firstOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    // Purge old cache
    await prisma.billboardAvailability.deleteMany({ where: { date: { lt: firstOfPrevMonth } } });

    const { generateAvailabilityForAllBillboards } = require('../controllers/availabilityController');
    await generateAvailabilityForAllBillboards(2);
    logger.info('Availability maintenance completed');
  } catch (e) {
    logger.warn('Availability maintenance failed:', e.message);
  }
}

module.exports.runAvailabilityMaintenance = runAvailabilityMaintenance;
