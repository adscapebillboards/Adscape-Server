const prisma = require('../db/db');
const logger = require('../config/logger');

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

      // Find expired slots (end_date < today)
      const expiredSlots = await prisma.generatedSlot.findMany({
        where: {
          endDate: {
            lt: today
          }
        },
        select: {
          id: true,
          campaignId: true,
          billboardId: true,
          assetUrl: true,
          endDate: true,
          slotNumber: true,
          screenId: true
        }
      });

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

      // Delete expired slots
      const deleteResult = await prisma.generatedSlot.deleteMany({
        where: {
          endDate: {
            lt: today
          }
        }
      });

      logger.info(`✅ Cleaned up ${deleteResult.count} expired assets`);

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

      const totalSlots = await prisma.generatedSlot.count();
      const expiredSlots = await prisma.generatedSlot.count({
        where: {
          endDate: {
            lt: today
          }
        }
      });
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
    const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 0);
    const firstOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    // Purge old cache
    await prisma.billboardAvailability.deleteMany({ where: { date: { lt: firstOfPrevMonth } } });

    // Precompute two months for all billboards
    const boards = await prisma.billboard.findMany({ select: { id: true } });
    for (const b of boards) {
      await precomputeBillboardAvailability(b.id, firstOfThisMonth, endOfNextMonth);
    }
    logger.info('Availability maintenance completed');
  } catch (e) {
    logger.warn('Availability maintenance failed:', e.message);
  }
}

async function precomputeBillboardAvailability(billboardId, start, end) {
  try {
    const TOTAL_SLOTS_PER_DAY = 8;
    const { startOfDay, endOfDay } = require('../controllers/availabilityController');
    const overlappingCampaigns = await prisma.campaign.findMany({
      where: { startDate: { lte: endOfDay(end) }, endDate: { gte: startOfDay(start) } },
      select: { billboards: true, startDate: true, endDate: true }
    });
    const counts = {};
    for (const camp of overlappingCampaigns) {
      let boards = camp.billboards;
      if (!boards) continue;
      if (typeof boards === 'string') { try { boards = JSON.parse(boards); } catch { continue; } }
      if (!Array.isArray(boards)) continue;
      const match = boards.find(b => String(b?.id) === String(billboardId));
      if (!match) continue;
      const bs = match.bookingDetails?.startDate || match.startDate || camp.startDate;
      const be = match.bookingDetails?.endDate || match.endDate || camp.endDate;
      if (!bs || !be) continue;
      const rs = startOfDay(new Date(bs)) > start ? startOfDay(new Date(bs)) : startOfDay(start);
      const re = endOfDay(new Date(be)) < end ? endOfDay(new Date(be)) : endOfDay(end);
      for (let d = new Date(rs); d <= re; d.setDate(d.getDate() + 1)) {
        const key = d.toISOString().slice(0,10);
        counts[key] = (counts[key] || 0) + 1;
      }
    }
    const ops = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0,10);
      const booked = Array.from({ length: Math.min(TOTAL_SLOTS_PER_DAY, counts[key] || 0) }, (_, i) => i + 1);
      const unbooked = [];
      for (let i = booked.length + 1; i <= TOTAL_SLOTS_PER_DAY; i++) unbooked.push(i);
      const day = new Date(key + 'T00:00:00Z');
      ops.push(prisma.billboardAvailability.upsert({
        where: { billboardId_date: { billboardId: String(billboardId), date: day } },
        update: { availability: { date: key, booked, unbooked, totalSlots: TOTAL_SLOTS_PER_DAY } },
        create: { billboardId: String(billboardId), date: day, availability: { date: key, booked, unbooked, totalSlots: TOTAL_SLOTS_PER_DAY } }
      }));
    }
    if (ops.length) await prisma.$transaction(ops);
  } catch (e) {
    logger.warn('Precompute availability failed:', e.message);
  }
}

module.exports.runAvailabilityMaintenance = runAvailabilityMaintenance;
