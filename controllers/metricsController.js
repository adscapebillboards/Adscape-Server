const prisma = require('../db/db');
const logger = require('../config/logger');

// Get campaign metrics
const getCampaignMetrics = async (req, res) => {
  const { campaignId } = req.params;

  try {
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    const dayAgo = new Date(today.getTime() - 24 * 60 * 60 * 1000);

    // Fetch metrics using Prisma
    const [daily, weekly, monthly, total, perHour, peakHours] = await Promise.all([
      // Daily displays (Today only)
      prisma.assetPlay.aggregate({
        where: {
          campaignId,
          playDate: {
            equals: today
          }
        },
        _sum: {
          playCount: true
        }
      }),

      // Weekly displays (Last 7 days)
      prisma.assetPlay.aggregate({
        where: {
          campaignId,
          playDate: {
            gte: weekAgo
          }
        },
        _sum: {
          playCount: true
        }
      }),

      // Monthly displays (Last 30 days)
      prisma.assetPlay.aggregate({
        where: {
          campaignId,
          playDate: {
            gte: monthAgo
          }
        },
        _sum: {
          playCount: true
        }
      }),

      // Total displays for campaign
      prisma.assetPlay.aggregate({
        where: {
          campaignId
        },
        _sum: {
          playCount: true
        }
      }),

      // Average per hour (last 24h)
      prisma.assetPlayLog.count({
        where: {
          campaignId,
          playedAt: {
            gte: dayAgo
          }
        }
      }),

      // Peak hours
      prisma.assetPlayLog.groupBy({
        by: ['playedAt'],
        where: {
          campaignId,
          playedAt: {
            gte: weekAgo
          }
        },
        _count: true
      }),
    ]);

    const metrics = {
      lastUpdated: new Date().toISOString(),
      dailyDisplays: daily._sum.playCount || 0,
      weeklyDisplays: weekly._sum.playCount || 0,
      monthlyDisplays: monthly._sum.playCount || 0,
      totalDisplays: total._sum.playCount || 0,
      averageDisplaysPerHour: Math.round(perHour / 24.0 || 0),
      peakHours: peakHours.map(row => ({
        hour: new Date(row.playedAt).getHours(),
        displays: row._count,
      })),
    };

    logger.campaign('Metrics fetched', `Campaign ${campaignId}:`, metrics);
    res.json(metrics);
  } catch (err) {
    logger.error("Error in campaign metrics:", err);
    res.status(500).send("Server Error");
  }
};

// Get admin dashboard stats (superadmin/global)
const getAdminDashboardStats = async (req, res) => {
  try {
    // Global totals for superadmin
    const [totalCampaigns, revenueResult, totalBillboards, billboardStatus, totalPublishers, recentActivity] = await Promise.all([
      prisma.campaign.count(),
      prisma.campaign.aggregate({ _sum: { totalAmount: true } }),
      prisma.billboard.count(),
      prisma.billboard.groupBy({ by: ['status'], _count: { status: true } }),
      prisma.publisher.count({ where: { status: 'active' } }),
      prisma.campaign.findMany({
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
      })
    ]);

    const statusCounts = {
      active: 0,
      maintenance: 0,
      offline: 0,
      pending: 0,
      approved: 0,
      rejected: 0
    };

    billboardStatus.forEach(item => {
      const key = item.status?.toLowerCase();
      if (statusCounts.hasOwnProperty(key)) {
        statusCounts[key] = item._count.status;
      }
    });

    // Get revenue data for charts (last 12 months) - optimized to use single query
    const revenueData = [];
    const currentDate = new Date();
    const twelveMonthsAgo = new Date(currentDate.getFullYear(), currentDate.getMonth() - 11, 1);
    
    // Fetch all campaigns from the last 12 months in a single query
    const campaigns = await prisma.campaign.findMany({
      where: {
        createdAt: {
          gte: twelveMonthsAgo
        }
      },
      select: {
        totalAmount: true,
        createdAt: true
      }
    });
    
    // Group by month
    const monthlyRevenue = {};
    campaigns.forEach(campaign => {
      const date = new Date(campaign.createdAt);
      const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
      if (!monthlyRevenue[monthKey]) {
        monthlyRevenue[monthKey] = 0;
      }
      monthlyRevenue[monthKey] += parseFloat(campaign.totalAmount || 0);
    });
    
    // Build revenue data array for last 12 months
    for (let i = 11; i >= 0; i--) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
      const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
      revenueData.push({
        month: date.toLocaleDateString('en-US', { month: 'short' }),
        amount: monthlyRevenue[monthKey] || 0
      });
    }

    const activityData = recentActivity.map(campaign => ({
      id: campaign.id,
      type: 'campaign',
      title: 'New campaign created',
      description: `${campaign.campaignName} was created by ${campaign.userName}`,
      amount: campaign.totalAmount,
      status: campaign.status,
      timestamp: campaign.createdAt
    }));

    const stats = {
      totalBookings: totalCampaigns,
      totalRevenue: parseFloat(revenueResult._sum.totalAmount || 0),
      totalBillboards: totalBillboards,
      totalPublishers: totalPublishers,
      billboardStatus: statusCounts,
      recentActivity: activityData,
      revenueData: revenueData
    };

    logger.info('Admin dashboard stats fetched:', stats);
    res.json(stats);

  } catch (err) {
    logger.error('Error fetching admin dashboard stats:', err);
    res.status(500).send('Error fetching admin dashboard stats');
  }
};

// Top performers by revenue (billboards aggregated by revenue from campaigns)
const getTopPerformingBillboards = async (req, res) => {
  try {
    // Aggregate revenue by billboard from campaign billboards JSON
    // Fallback to 5 items
    const campaigns = await prisma.campaign.findMany({ select: { billboards: true } });
    const revenueByBillboard = new Map();

    for (const c of campaigns) {
      let bbs = c.billboards;
      if (!bbs) continue;
      if (typeof bbs === 'string') {
        try { bbs = JSON.parse(bbs); } catch { continue; }
      }
      for (const b of bbs) {
        const key = b.id || b.location || b.screen_id || Math.random().toString();
        const amount = Number(b.pricePerDay || 0);
        const days = b.bookingDetails?.startDate && b.bookingDetails?.endDate
          ? (new Date(b.bookingDetails.endDate) - new Date(b.bookingDetails.startDate)) / (1000*60*60*24) + 1
          : 0;
        const revenue = Math.max(0, Math.round(amount * days));
        const prev = revenueByBillboard.get(key) || { id: key, name: b.name || b.location || key, city: b.city || '', revenue: 0 };
        prev.revenue += revenue;
        revenueByBillboard.set(key, prev);
      }
    }

    const items = Array.from(revenueByBillboard.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)
      .map(x => ({ id: x.id, name: x.name, location: x.city, revenue: x.revenue, growth: 0 }));

    res.json({ items });
  } catch (err) {
    logger.error('Error fetching top performers:', err);
    res.status(500).send('Error fetching top performers');
  }
};

// Get publisher bookings (for publisher notifications)
const getPublisherBookings = async (req, res) => {
  try {
    const user = req.user;
    
    if (!user || user.role !== 'publisher') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get the publisher's billboards
    const publisherBillboards = await prisma.billboard.findMany({
      where: {
        userId: user.email,
        status: 'approved'
      },
      select: {
        id: true,
        name: true
      }
    });

    const billboardIds = publisherBillboards.map(bb => bb.id);

    // Get recent campaigns that include the publisher's billboards
    const recentCampaigns = await prisma.campaign.findMany({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
        }
      },
      select: {
        id: true,
        campaignName: true,
        createdAt: true,
        billboards: true,
        status: true
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 10
    });

    // Filter campaigns that include the publisher's billboards
    const relevantBookings = [];
    
    for (const campaign of recentCampaigns) {
      let billboards = campaign.billboards;
      if (typeof billboards === 'string') {
        try {
          billboards = JSON.parse(billboards);
        } catch {
          continue;
        }
      }
      
      if (Array.isArray(billboards)) {
        for (const billboard of billboards) {
          if (billboardIds.includes(billboard.id)) {
            relevantBookings.push({
              id: campaign.id,
              campaignName: campaign.campaignName || 'Unnamed Campaign',
              billboardName: billboard.name || billboard.location || 'Unknown Billboard',
              createdAt: campaign.createdAt,
              status: campaign.status
            });
            break; // Only count each campaign once
          }
        }
      }
    }

    logger.info(`Publisher bookings fetched for ${user.email}:`, relevantBookings.length);
    res.json({ bookings: relevantBookings });
  } catch (err) {
    logger.error('Error fetching publisher bookings:', err);
    res.status(500).json({ error: 'Failed to fetch publisher bookings' });
  }
};

// Revenue time-series for dashboard chart
// period=week -> last 7 days, period=month -> last 12 months
const getAdminRevenueSeries = async (req, res) => {
  try {
    const period = (req.query.period || 'month').toString();

    if (period === 'week') {
      const today = new Date();
      const start = new Date(today);
      start.setDate(today.getDate() - 6); // last 7 days including today

      const campaigns = await prisma.campaign.findMany({
        where: {
          createdAt: {
            gte: start,
          },
        },
        select: { createdAt: true, totalAmount: true },
      });

      const byDay = new Map();
      for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        const key = d.toISOString().slice(0, 10);
        byDay.set(key, 0);
      }

      for (const c of campaigns) {
        const key = (c.createdAt || new Date()).toISOString().slice(0, 10);
        const amount = Number(c.totalAmount || 0);
        if (byDay.has(key)) byDay.set(key, (byDay.get(key) || 0) + amount);
      }

      const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      const series = Array.from(byDay.entries()).map(([iso, revenue]) => {
        const d = new Date(iso);
        return { name: dayNames[d.getDay()], revenue: Math.max(0, Math.round(revenue)) };
      });
      return res.json({ period: 'week', data: series });
    }

    // Default: last 12 months
    const end = new Date();
    const start = new Date(end);
    start.setMonth(end.getMonth() - 11);

    const campaigns = await prisma.campaign.findMany({
      where: {
        createdAt: {
          gte: start,
        },
      },
      select: { createdAt: true, totalAmount: true },
      orderBy: { createdAt: 'asc' },
    });

    const byMonth = new Map();
    for (let i = 0; i < 12; i++) {
      const d = new Date(start);
      d.setMonth(start.getMonth() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      byMonth.set(key, 0);
    }

    for (const c of campaigns) {
      const dt = c.createdAt || new Date();
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
      const amount = Number(c.totalAmount || 0);
      if (byMonth.has(key)) byMonth.set(key, (byMonth.get(key) || 0) + amount);
    }

    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const series = Array.from(byMonth.entries()).map(([ym, revenue]) => {
      const [y, m] = ym.split('-').map(Number);
      return { name: monthNames[m - 1], revenue: Math.max(0, Math.round(revenue)) };
    });

    res.json({ period: 'month', data: series });
  } catch (err) {
    logger.error('Error fetching revenue series:', err);
    res.status(500).send('Error fetching revenue series');
  }
};

// Publisher data table: for each publisher, include their billboards (JSON with created date),
// total bookings with dates, and revenue by campaign with dates
const getPublisherDataTable = async (req, res) => {
  try {
    // Get publishers
    const publishers = await prisma.publisher.findMany({
      select: { id: true, name: true, email: true, joinDate: true },
      orderBy: { id: 'desc' },
    });

    // Get billboards grouped by publisher email
    const billboards = await prisma.billboard.findMany({
      select: { id: true, name: true, location: true, city: true, userId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });

    // Get campaigns to compute bookings and revenue per publisher
    const campaigns = await prisma.campaign.findMany({
      select: { id: true, campaignName: true, totalAmount: true, createdAt: true, billboards: true },
      orderBy: { createdAt: 'desc' },
    });

    const billboardByOwner = new Map();
    for (const b of billboards) {
      const key = b.userId || 'unknown';
      const list = billboardByOwner.get(key) || [];
      list.push({ id: b.id, name: b.name, location: b.location, city: b.city, createdAt: b.createdAt });
      billboardByOwner.set(key, list);
    }

    const data = publishers.map(p => ({
      id: p.id,
      name: p.name,
      email: p.email,
      joinDate: p.joinDate,
      billboards: billboardByOwner.get(p.email) || [],
      totalBookings: 0,
      bookings: [],
      revenueByCampaign: [],
    }));

    // Index by publisher email for quick updates
    const byEmail = new Map(data.map(d => [d.email, d]));

    for (const c of campaigns) {
      let bbArray = c.billboards;
      if (!bbArray) continue;
      if (typeof bbArray === 'string') {
        try { bbArray = JSON.parse(bbArray); } catch { continue; }
      }
      const campaignRevenue = Number(c.totalAmount || 0);
      const campaignDate = c.createdAt;
      const campaignName = c.campaignName || `Campaign ${c.id}`;
      const seenOwners = new Set();

      for (const b of bbArray) {
        const ownerEmail = b.owner?.email || b.userId || b.owner || null;
        if (!ownerEmail) continue;
        if (seenOwners.has(ownerEmail)) continue;
        seenOwners.add(ownerEmail);

        const row = byEmail.get(ownerEmail);
        if (!row) continue;
        // Count booking occurrence
        row.totalBookings += 1;
        row.bookings.push({ campaignId: c.id, date: campaignDate, name: campaignName });
        row.revenueByCampaign.push({ campaignId: c.id, name: campaignName, amount: campaignRevenue, date: campaignDate });
      }
    }

    res.json({ publishers: data });
  } catch (err) {
    logger.error('Error building publisher data table:', err);
    res.status(500).json({ error: 'Error building publisher data table' });
  }
};

// Get states
const getStates = async (req, res) => {
  try {
    const states = await prisma.billboard.findMany({
      select: {
        state: true
      },
      distinct: ['state'],
      orderBy: {
        state: 'asc'
      }
    });
    const stateList = states.map(row => row.state);
    logger.db('SELECT', 'States fetched:', stateList.length);
    res.json(stateList);
  } catch (err) {
    logger.error('Error fetching states:', err);
    res.status(500).send('Server Error');
  }
};

// Get cities by state
const getCitiesByState = async (req, res) => {
  const { state } = req.query;
  try {
    const cities = await prisma.billboard.findMany({
      where: {
        state
      },
      select: {
        city: true
      },
      distinct: ['city'],
      orderBy: {
        city: 'asc'
      }
    });
    const cityList = cities.map(row => row.city);
    logger.db('SELECT', `Cities fetched for state ${state}:`, cityList.length);
    res.json(cityList);
  } catch (err) {
    logger.error('Error fetching cities:', err);
    res.status(500).send('Server Error');
  }
};

// Check availability
const checkAvailability = async (req, res) => {
  const { state, city } = req.query;
  try {
    let count;
    if (city) {
      count = await prisma.billboard.count({
        where: {
          city
        }
      });
    } else if (state) {
      count = await prisma.billboard.count({
        where: {
          state
        }
      });
    }
    const available = count > 0;
    logger.db('SELECT', `Availability check - ${city || state}:`, available);
    res.json({ available });
  } catch (err) {
    logger.error('Error checking availability:', err);
    res.status(500).json({ error: 'Server error' });
  }
};



module.exports = {
  getCampaignMetrics,
  getAdminDashboardStats,
  getTopPerformingBillboards,
  getAdminRevenueSeries,
  getPublisherBookings,
  getPublisherDataTable,
  getStates,
  getCitiesByState,
  checkAvailability,
};