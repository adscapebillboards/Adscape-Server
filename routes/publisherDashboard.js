const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const prisma = require('../db/db');

// Get publisher dashboard statistics
router.get('/publisher-dashboard-stats', auth, async (req, res) => {
  try {
    const user = req.user;
    
    // Log user info for debugging
    console.log('Publisher dashboard request - User:', {
      id: user?.id,
      email: user?.email,
      role: user?.role
    });
    
    // Allow both 'publisher' and 'admin' roles (admin is publisher account)
    // Also check if user exists in publisher table to verify they're a publisher
    if (!user || !user.email) {
      return res.status(403).json({ error: 'Access denied. User not authenticated.' });
    }
    
    // Check if user is a publisher by looking them up in the database
    const publisher = await prisma.publisher.findUnique({
      where: { email: user.email },
      select: { id: true, email: true, role: true, status: true }
    });
    
    if (!publisher) {
      console.log('Publisher not found in database:', user.email);
      return res.status(403).json({ error: 'Access denied. Publisher account not found.' });
    }
    
    // Allow if user role is publisher/admin OR if they exist in publisher table
    const allowedRoles = ['publisher', 'admin'];
    const userRole = (user.role || publisher.role || 'publisher').toLowerCase();
    
    if (!allowedRoles.includes(userRole)) {
      console.log('Role not allowed:', userRole, 'User role:', user.role, 'Publisher role:', publisher.role);
      return res.status(403).json({ 
        error: 'Access denied. Publisher or admin role required.',
        userRole: user.role,
        publisherRole: publisher.role
      });
    }

    // Use publisher email from database to ensure consistency
    const publisherEmail = publisher.email || user.email;
    
    // Get publisher's billboards (all statuses for stats calculation)
    // Filter by userId (which stores the billboard owner's email in the user_id column)
    console.log('Fetching billboards for publisher:', publisherEmail);
    const publisherBillboards = await prisma.billboard.findMany({
      where: {
        userId: publisherEmail
        // No status filter - get all billboards for accurate stats
      },
      select: {
        id: true,
        name: true,
        location: true,
        city: true,
        pricePerDay: true,
        dailyViewership: true,
        status: true,
        createdAt: true
      }
    });

    const billboardIds = publisherBillboards.map(bb => bb.id);
    console.log(`[publisherDashboard] Found ${publisherBillboards.length} billboards for publisher ${publisherEmail}`, {
      billboardIds: billboardIds.slice(0, 5) // Log first 5 IDs
    });

    // Get total revenue from campaigns that include publisher's billboards
    const campaigns = await prisma.campaign.findMany({
      select: {
        id: true,
        campaignName: true,
        totalAmount: true,
        billboards: true,
        createdAt: true,
        status: true
      }
    });

    let totalRevenue = 0;
    let totalBookings = 0;
    let activeBookings = 0;
    const revenueByMonth = new Map();
    const recentBookings = [];

    for (const campaign of campaigns) {
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
            totalBookings++;
            if (campaign.status === 'active' || campaign.status === 'approved') {
              activeBookings++;
            }
            
            const revenue = parseFloat(campaign.totalAmount || 0);
            totalRevenue += revenue;
            
            // Group revenue by month
            const month = new Date(campaign.createdAt).toISOString().slice(0, 7);
            revenueByMonth.set(month, (revenueByMonth.get(month) || 0) + revenue);
            
            // Add to recent bookings
            recentBookings.push({
              id: campaign.id,
              campaignName: campaign.campaignName || 'Unnamed Campaign',
              billboardName: billboard.name || billboard.location || 'Unknown Billboard',
              amount: revenue,
              status: campaign.status,
              createdAt: campaign.createdAt
            });
            
            break; // Only count each campaign once
          }
        }
      }
    }

    // Sort recent bookings by date
    recentBookings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Generate revenue data for charts (last 12 months)
    const revenueData = [];
    const currentDate = new Date();
    
    for (let i = 11; i >= 0; i--) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
      const monthKey = date.toISOString().slice(0, 7);
      const monthRevenue = revenueByMonth.get(monthKey) || 0;
      
      revenueData.push({
        month: date.toLocaleDateString('en-US', { month: 'short' }),
        amount: monthRevenue
      });
    }

    // Get billboard performance data
    const billboardPerformance = publisherBillboards.map(billboard => {
      let billboardRevenue = 0;
      let billboardBookings = 0;
      
      for (const campaign of campaigns) {
        let billboards = campaign.billboards;
        if (typeof billboards === 'string') {
          try {
            billboards = JSON.parse(billboards);
          } catch {
            continue;
          }
        }
        
        if (Array.isArray(billboards)) {
          for (const bb of billboards) {
            if (bb.id === billboard.id) {
              billboardRevenue += parseFloat(campaign.totalAmount || 0);
              billboardBookings++;
              break;
            }
          }
        }
      }
      
      return {
        id: billboard.id,
        name: billboard.name || 'Unnamed Billboard',
        location: billboard.location || 'Unknown Location',
        city: billboard.city || 'Unknown City',
        revenue: billboardRevenue,
        bookings: billboardBookings,
        pricePerDay: billboard.pricePerDay || 0,
        dailyViewership: billboard.dailyViewership || 0
      };
    });

    // Sort by revenue
    billboardPerformance.sort((a, b) => b.revenue - a.revenue);

    // Calculate billboard status counts
    const billboardStatusCounts = {
      active: publisherBillboards.filter(bb => (bb.status || '').toLowerCase() === 'approved').length,
      maintenance: publisherBillboards.filter(bb => (bb.status || '').toLowerCase() === 'maintenance').length,
      offline: publisherBillboards.filter(bb => (bb.status || '').toLowerCase() === 'offline').length,
      pending: publisherBillboards.filter(bb => (bb.status || '').toLowerCase() === 'pending').length,
      approved: publisherBillboards.filter(bb => (bb.status || '').toLowerCase() === 'approved').length,
      rejected: publisherBillboards.filter(bb => (bb.status || '').toLowerCase() === 'rejected').length
    };

    const stats = {
      totalBillboards: publisherBillboards.length,
      totalBookings,
      activeBookings,
      totalRevenue,
      billboardStatus: billboardStatusCounts,
      revenueData,
      recentBookings: recentBookings.slice(0, 5),
      billboardPerformance: billboardPerformance.slice(0, 5)
    };

    res.json(stats);
  } catch (error) {
    console.error('Error fetching publisher dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch publisher dashboard statistics' });
  }
});

// Get publisher revenue series for charts
router.get('/publisher-revenue-series', auth, async (req, res) => {
  try {
    const user = req.user;
    const period = req.query.period || 'month';
    
    if (!user || !user.email) {
      return res.status(403).json({ error: 'Access denied. User not authenticated.' });
    }
    
    // Check if user is a publisher by looking them up in the database
    const publisher = await prisma.publisher.findUnique({
      where: { email: user.email },
      select: { id: true, email: true, role: true }
    });
    
    if (!publisher) {
      return res.status(403).json({ error: 'Access denied. Publisher account not found.' });
    }
    
    // Use publisher email from database to ensure consistency
    const publisherEmail = publisher.email || user.email;

    // Get publisher's billboards (all statuses for revenue calculation)
    // Filter by userId (which stores the billboard owner's email in the user_id column)
    const publisherBillboards = await prisma.billboard.findMany({
      where: {
        userId: publisherEmail
        // No status filter - include all billboards for revenue calculation
      },
      select: { id: true }
    });

    const billboardIds = publisherBillboards.map(bb => bb.id);

    if (period === 'week') {
      const today = new Date();
      const start = new Date(today);
      start.setDate(today.getDate() - 6);

      const campaigns = await prisma.campaign.findMany({
        where: {
          createdAt: {
            gte: start,
          },
        },
        select: { createdAt: true, totalAmount: true, billboards: true },
      });

      const byDay = new Map();
      for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        const key = d.toISOString().slice(0, 10);
        byDay.set(key, 0);
      }

      for (const c of campaigns) {
        let billboards = c.billboards;
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
              const key = (c.createdAt || new Date()).toISOString().slice(0, 10);
              const amount = Number(c.totalAmount || 0);
              if (byDay.has(key)) byDay.set(key, (byDay.get(key) || 0) + amount);
              break;
            }
          }
        }
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
      select: { createdAt: true, totalAmount: true, billboards: true },
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
      let billboards = c.billboards;
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
            const dt = c.createdAt || new Date();
            const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
            const amount = Number(c.totalAmount || 0);
            if (byMonth.has(key)) byMonth.set(key, (byMonth.get(key) || 0) + amount);
            break;
          }
        }
      }
    }

    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const series = Array.from(byMonth.entries()).map(([ym, revenue]) => {
      const [y, m] = ym.split('-').map(Number);
      return { name: monthNames[m - 1], revenue: Math.max(0, Math.round(revenue)) };
    });

    res.json({ period: 'month', data: series });
  } catch (error) {
    console.error('Error fetching publisher revenue series:', error);
    res.status(500).json({ error: 'Failed to fetch publisher revenue series' });
  }
});

module.exports = router;
