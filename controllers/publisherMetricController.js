const prisma = require('../db/db');
const logger = require('../config/logger');

// Automatically create PublisherMetric entry when publisher is created/approved
const createPublisherMetricEntry = async (publisherId, publisherData = {}) => {
  try {
    const existingMetric = await prisma.publisherMetric.findUnique({
      where: { publisherId: parseInt(publisherId) }
    });

    if (existingMetric) {
      logger.info('PublisherMetric already exists for publisher', { publisherId });
      return existingMetric;
    }

    const metric = await prisma.publisherMetric.create({
      data: {
        publisherId: parseInt(publisherId),
        totalBillboards: publisherData.totalBillboards || 0,
        totalBookings: 0,
        totalRevenue: 0,
        joinDate: publisherData.joinDate || new Date(),
        lastBooking: null,
        status: publisherData.status || 'active',
        settings: {
          language: 'en',
          timezone: 'est',
          notifications: {
            email: true,
            sms: false,
            push: true
          },
          theme: 'light'
        }
      }
    });

    logger.info('PublisherMetric entry created automatically', { publisherId });
    return metric;
  } catch (error) {
    logger.error('Error creating PublisherMetric entry:', error);
    throw error;
  }
};

// Get publisher metrics by publisher ID
const getPublisherMetrics = async (req, res) => {
  try {
    const { publisherId } = req.params;
    
    const metrics = await prisma.publisherMetric.findUnique({
      where: { publisherId: parseInt(publisherId) },
      include: { publisher: true }
    });

    if (!metrics) {
      return res.status(404).json({ error: 'Publisher metrics not found' });
    }

    logger.info('Publisher metrics fetched', { publisherId });
    res.json(metrics);
  } catch (error) {
    logger.error('Error fetching publisher metrics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Create or update publisher metrics
const upsertPublisherMetrics = async (req, res) => {
  try {
    const { publisherId, totalBillboards, totalBookings, totalRevenue, joinDate, lastBooking, status, settings } = req.body;

    const metrics = await prisma.publisherMetric.upsert({
      where: { publisherId: parseInt(publisherId) },
      update: {
        totalBillboards,
        totalBookings,
        totalRevenue,
        lastBooking,
        status,
        settings
      },
      create: {
        publisherId: parseInt(publisherId),
        totalBillboards: totalBillboards || 0,
        totalBookings: totalBookings || 0,
        totalRevenue: totalRevenue || 0,
        joinDate: joinDate || new Date(),
        lastBooking,
        status,
        settings
      }
    });

    logger.info('Publisher metrics upserted', { publisherId });
    res.json(metrics);
  } catch (error) {
    logger.error('Error upserting publisher metrics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get dashboard data for a publisher
const getPublisherDashboard = async (req, res) => {
  try {
    const { publisherId } = req.params;
    
    // Get metrics
    const metrics = await prisma.publisherMetric.findUnique({
      where: { publisherId: parseInt(publisherId) }
    });

    // Get billboards count
    const billboardsCount = await prisma.billboard.count({
      where: { userId: publisherId.toString() }
    });

    // Get campaigns count (bookings)
    const campaignsCount = await prisma.campaign.count({
      where: { owner: publisherId.toString() }
    });

    // Calculate total revenue from campaigns
    const campaigns = await prisma.campaign.findMany({
      where: { owner: publisherId.toString() },
      select: { totalAmount: true }
    });

    const totalRevenue = campaigns.reduce((sum, campaign) => {
      return sum + (parseFloat(campaign.totalAmount) || 0);
    }, 0);

    const dashboardData = {
      metrics: metrics || {
        totalBillboards: 0,
        totalBookings: 0,
        totalRevenue: 0,
        joinDate: new Date(),
        status: 'active'
      },
      currentStats: {
        billboardsCount,
        campaignsCount,
        totalRevenue
      }
    };

    logger.info('Publisher dashboard data fetched', { publisherId });
    res.json(dashboardData);
  } catch (error) {
    logger.error('Error fetching publisher dashboard:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Update publisher settings
const updatePublisherSettings = async (req, res) => {
  try {
    const { publisherId } = req.params;
    const { settings } = req.body;

    const updatedMetrics = await prisma.publisherMetric.update({
      where: { publisherId: parseInt(publisherId) },
      data: { settings }
    });

    logger.info('Publisher settings updated', { publisherId });
    res.json(updatedMetrics);
  } catch (error) {
    logger.error('Error updating publisher settings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get all publisher metrics (for admin)
const getAllPublisherMetrics = async (req, res) => {
  try {
    const metrics = await prisma.publisherMetric.findMany({
      include: { publisher: true }
    });

    logger.info('All publisher metrics fetched');
    res.json(metrics);
  } catch (error) {
    logger.error('Error fetching all publisher metrics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  createPublisherMetricEntry,
  getPublisherMetrics,
  upsertPublisherMetrics,
  getPublisherDashboard,
  updatePublisherSettings,
  getAllPublisherMetrics
};
