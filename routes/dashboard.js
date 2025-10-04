const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const roleAuth = require('../middleware/roleAuth');
const prisma = require('../db/db');

// GET dashboard statistics
router.get('/admin-dashboard-stats', auth, roleAuth(['superadmin']), async (req, res) => {
  try {
    // Get total billboards
    const totalBillboards = await prisma.billboard.count();
    
    // Get billboard status counts
    const billboardStatus = await prisma.billboard.groupBy({
      by: ['status'],
      _count: {
        status: true
      }
    });
    
    const statusCounts = {
      active: 0,
      maintenance: 0,
      offline: 0,
      pending: 0,
      approved: 0,
      rejected: 0
    };
    
    billboardStatus.forEach(status => {
      if (status.status) {
        const statusKey = status.status.toLowerCase();
        if (statusCounts.hasOwnProperty(statusKey)) {
          statusCounts[statusKey] = status._count.status;
        }
      }
    });
    
    // Get total publishers
    const totalPublishers = await prisma.publisher.count({
      where: { status: 'active' }
    });
    
    // Get total bookings (campaigns)
    const totalBookings = await prisma.campaign.count();
    
    // Calculate total revenue from campaigns
    const campaigns = await prisma.campaign.findMany({
      select: {
        totalAmount: true
      }
    });
    
    const totalRevenue = campaigns.reduce((sum, campaign) => {
      return sum + (parseFloat(campaign.totalAmount || 0));
    }, 0);
    
    // Get recent activity data
    const recentCampaigns = await prisma.campaign.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        campaignName: true,
        status: true,
        totalAmount: true,
        createdAt: true,
        userName: true
      }
    });
    
    const recentActivity = recentCampaigns.map(campaign => ({
      id: campaign.id,
      type: 'campaign',
      title: 'New campaign created',
      description: `${campaign.campaignName} was created by ${campaign.userName}`,
      amount: campaign.totalAmount,
      status: campaign.status,
      timestamp: campaign.createdAt
    }));
    
    // Get revenue data for charts (last 12 months)
    const revenueData = [];
    const currentDate = new Date();
    
    for (let i = 11; i >= 0; i--) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
      const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      
      const monthCampaigns = await prisma.campaign.findMany({
        where: {
          createdAt: {
            gte: monthStart,
            lte: monthEnd
          }
        },
        select: {
          totalAmount: true
        }
      });
      
      const monthRevenue = monthCampaigns.reduce((sum, campaign) => {
        return sum + (parseFloat(campaign.totalAmount || 0));
      }, 0);
      
      revenueData.push({
        month: date.toLocaleDateString('en-US', { month: 'short' }),
        amount: monthRevenue
      });
    }
    
    res.json({
      totalBillboards,
      totalPublishers,
      totalBookings,
      totalRevenue,
      billboardStatus: statusCounts,
      recentActivity,
      revenueData
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  }
});

// GET top performing billboards
router.get('/admin-top-performers', auth, roleAuth(['superadmin']), async (req, res) => {
  try {
    // Get billboards with highest price per day
    const topBillboards = await prisma.billboard.findMany({
      where: {
        status: 'approved',
        pricePerDay: {
          not: null
        }
      },
      orderBy: {
        pricePerDay: 'desc'
      },
      take: 10,
      select: {
        id: true,
        name: true,
        location: true,
        city: true,
        pricePerDay: true,
        dailyViewership: true
      }
    });
    
    const performers = topBillboards.map(billboard => ({
      id: billboard.id,
      name: billboard.name || 'Unnamed Billboard',
      location: billboard.location || 'Unknown Location',
      revenue: (billboard.pricePerDay || 0) * 30, // Monthly revenue estimate
      growth: Math.floor(Math.random() * 20) + 1 // Random growth for demo
    }));
    
    res.json({ items: performers });
  } catch (error) {
    console.error('Error fetching top performers:', error);
    res.status(500).json({ error: 'Failed to fetch top performers' });
  }
});

module.exports = router;









