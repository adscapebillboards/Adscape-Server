const { updateAllCampaignsStatusByDate } = require('../controllers/campaignStatusController');
const logger = require('../config/logger');

class CampaignStatusScheduler {
  constructor() {
    this.interval = null;
    this.isRunning = false;
  }

  // Start the scheduler to run every specified interval (in minutes)
  start(intervalMinutes = 15) {
    if (this.isRunning) {
      logger.warn('Campaign status scheduler is already running');
      return;
    }

    logger.info(`Starting campaign status scheduler with ${intervalMinutes} minute interval`);
    
    this.isRunning = true;
    this.interval = setInterval(async () => {
      try {
        logger.info('Running scheduled campaign status update...');
        await updateAllCampaignsStatusByDate();
        logger.info('Scheduled campaign status update completed');
      } catch (error) {
        logger.error('Error in scheduled campaign status update:', error);
      }
    }, intervalMinutes * 60 * 1000); // Convert minutes to milliseconds

    // Run immediately on start
    this.runImmediate();
  }

  // Stop the scheduler
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      this.isRunning = false;
      logger.info('Campaign status scheduler stopped');
    }
  }

  // Run the update immediately
  async runImmediate() {
    try {
      logger.info('Running immediate campaign status update...');
      const result = await updateAllCampaignsStatusByDate();
      logger.info(`Immediate campaign status update completed. ${result.updatedCampaigns} campaigns updated out of ${result.totalCampaigns} total`);
      return result;
    } catch (error) {
      logger.error('Error in immediate campaign status update:', error);
      throw error;
    }
  }

  // Get scheduler status
  getStatus() {
    return {
      isRunning: this.isRunning,
      hasInterval: !!this.interval
    };
  }
}

// Create a singleton instance
const scheduler = new CampaignStatusScheduler();

module.exports = scheduler;








