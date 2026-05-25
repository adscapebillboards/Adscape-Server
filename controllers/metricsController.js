const prisma = require('../db/db');
const logger = require('../config/logger');
const { Prisma } = require('@prisma/client');

// Per-campaign slot analytics (plays + minutes per day, optionally filtered by screenId)
// Primary source: PlaybackAnalytics batch payloads (from Android player sync).
// Fallback / supplement: asset_play_logs structured table.
const getCampaignSlotAnalytics = async (req, res) => {
  const { campaignId } = req.params;
  const screenId = String(req.query?.screenId || '').trim();
  const campaignIdShort = String(campaignId || '').slice(0, 8);
  const debugTag = `[slot-analytics][campaign=${campaignId}][short=${campaignIdShort}][screen=${screenId || 'all'}]`;

  try {
    if (!campaignId) {
      return res.status(400).json({ error: 'campaignId is required' });
    }

    // ── 1. Scan PlaybackAnalytics batch payloads ──────────────────────────────
    // The Android player syncs rows as JSON batches into this table.
    // Each payload.rows[] entry looks like:
    //   { table: 'slot_playback', row: { campaign_id, asset_url, start_time, end_time, duration, slot_id } }
    // Android app can write either screenId or deviceId depending on sync path.
    const batchWhere = screenId
      ? {
          OR: [
            { screenId: { in: [screenId] } },
            { deviceId: { in: [screenId] } }
          ]
        }
      : {};

    const batches = await prisma.playbackAnalytics.findMany({
      where: batchWhere,
      orderBy: { receivedAt: 'asc' },
      take: 500 // cap to avoid OOM on large history
    });
    logger.info(`${debugTag} batches=${batches.length}`);

    // Collect: dailyMap[dateStr] = {plays, durationMs}
    //          assetMap[url]    = {assetUrl, plays, durationMs, lastPlayedAt}
    const dailyMap = {};
    const assetMap = {};
    let batchTotalPlays = 0;
    let batchTotalDurationMs = 0;
    let batchRowsSeen = 0;
    let batchRowsCampaignMatched = 0;

    for (const batch of batches) {
      const payload = batch.payload || {};
      const rows = Array.isArray(payload.rows) ? payload.rows : [];
      batchRowsSeen += rows.length;

      for (const r of rows) {
        if (!r || r.table !== 'slot_playback' || !r.row) continue;
        const row = r.row;

        // Match campaign using Android-compatible heuristics:
        // 1) row.campaign_id can be full or short id
        // 2) row.slot_id often starts with campaign short id
        const rowCid = String(row.campaign_id || '').trim();
        const rowSlotId = String(row.slot_id || '').trim();
        const cidShort = campaignId.slice(0, 8);
        const campaignMatch =
          rowCid === campaignId ||
          rowCid === cidShort ||
          rowSlotId.startsWith(`${cidShort}-`) ||
          rowSlotId === cidShort;
        if (!campaignMatch) continue;
        batchRowsCampaignMatched += 1;

        const playedAt = row.end_time ? new Date(row.end_time) : new Date(batch.receivedAt);
        const durMs = Number.isFinite(row.duration) ? Math.round(row.duration * 1000) : 15000;
        const dateKey = playedAt.toISOString().slice(0, 10); // YYYY-MM-DD
        const assetUrl = String(row.asset_url || '').trim();

        // daily aggregate
        if (!dailyMap[dateKey]) dailyMap[dateKey] = { plays: 0, durationMs: 0 };
        dailyMap[dateKey].plays += 1;
        dailyMap[dateKey].durationMs += durMs;

        // per-asset aggregate
        if (!assetMap[assetUrl]) assetMap[assetUrl] = { assetUrl, plays: 0, durationMs: 0, lastPlayedAt: null };
        assetMap[assetUrl].plays += 1;
        assetMap[assetUrl].durationMs += durMs;
        if (!assetMap[assetUrl].lastPlayedAt || playedAt > new Date(assetMap[assetUrl].lastPlayedAt)) {
          assetMap[assetUrl].lastPlayedAt = playedAt.toISOString();
        }

        batchTotalPlays += 1;
        batchTotalDurationMs += durMs;
      }
    }
    logger.info(`${debugTag} batchRowsSeen=${batchRowsSeen} matched=${batchRowsCampaignMatched} batchPlays=${batchTotalPlays} batchDurationMs=${batchTotalDurationMs}`);

    // ── 2. Also query asset_play_logs (legacy / structured path) ─────────────
    let legacyDailyPlays = 0;
    let legacyDurationMs = 0;
    let legacyAssetPlays = 0;
    let legacyAssetDurationMs = 0;
    try {
      const whereScreen = screenId ? Prisma.sql`AND screen_id = ${screenId}` : Prisma.empty;

      const legacyRows = await prisma.$queryRaw(Prisma.sql`
        SELECT
          DATE(played_at)::text AS date,
          COUNT(1)::int AS plays,
          COALESCE(SUM(COALESCE(duration_ms, 0)), 0)::bigint AS duration_ms
        FROM asset_play_logs
        WHERE campaign_id IN (${campaignId}, ${campaignIdShort})
        ${whereScreen}
        GROUP BY DATE(played_at)
        ORDER BY DATE(played_at) ASC;
      `);

      for (const row of (Array.isArray(legacyRows) ? legacyRows : [])) {
        const dk = String(row.date).slice(0, 10);
        const p = Number(row.plays || 0);
        const d = Number(row.duration_ms || 0);
        if (!dailyMap[dk]) dailyMap[dk] = { plays: 0, durationMs: 0 };
        dailyMap[dk].plays += p;
        dailyMap[dk].durationMs += d;
        legacyDailyPlays += p;
        legacyDurationMs += d;
      }
      logger.info(`${debugTag} legacyDailyRows=${Array.isArray(legacyRows) ? legacyRows.length : 0} plays=${legacyDailyPlays} durationMs=${legacyDurationMs}`);

      // Per-asset breakdown from legacy table as well (this was missing before).
      const legacyAssetRows = await prisma.$queryRaw(Prisma.sql`
        SELECT
          COALESCE(asset_url, '')::text AS asset_url,
          COUNT(1)::int AS plays,
          COALESCE(SUM(COALESCE(duration_ms, 0)), 0)::bigint AS duration_ms,
          MAX(played_at) AS last_played_at
        FROM asset_play_logs
        WHERE campaign_id IN (${campaignId}, ${campaignIdShort})
        ${whereScreen}
        GROUP BY COALESCE(asset_url, '')
        ORDER BY plays DESC;
      `);

      for (const row of (Array.isArray(legacyAssetRows) ? legacyAssetRows : [])) {
        const assetUrl = String(row.asset_url || '').trim();
        const plays = Number(row.plays || 0);
        const durationMs = Number(row.duration_ms || 0);
        const lastPlayedAt = row.last_played_at ? new Date(row.last_played_at).toISOString() : null;

        if (!assetMap[assetUrl]) {
          assetMap[assetUrl] = { assetUrl, plays: 0, durationMs: 0, lastPlayedAt: null };
        }
        assetMap[assetUrl].plays += plays;
        assetMap[assetUrl].durationMs += durationMs;
        if (lastPlayedAt && (!assetMap[assetUrl].lastPlayedAt || new Date(lastPlayedAt) > new Date(assetMap[assetUrl].lastPlayedAt))) {
          assetMap[assetUrl].lastPlayedAt = lastPlayedAt;
        }

        legacyAssetPlays += plays;
        legacyAssetDurationMs += durationMs;
      }
      logger.info(`${debugTag} legacyAssetRows=${Array.isArray(legacyAssetRows) ? legacyAssetRows.length : 0} plays=${legacyAssetPlays} durationMs=${legacyAssetDurationMs}`);
    } catch (legacyErr) {
      logger.warn('[metrics] asset_play_logs query skipped:', legacyErr?.message);
    }

    // ── 3. Build response ─────────────────────────────────────────────────────
    const dailyArray = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({
        date,
        plays: v.plays,
        minutes: Math.round(v.durationMs / 60000)
      }));

    const assetBreakdown = Object.values(assetMap)
      .sort((a, b) => b.plays - a.plays)
      .map(a => ({
        assetUrl: a.assetUrl,
        plays: a.plays,
        minutes: Math.round(a.durationMs / 60000),
        lastPlayedAt: a.lastPlayedAt
      }));

    const totalPlays = Math.max(batchTotalPlays + legacyDailyPlays, batchTotalPlays + legacyAssetPlays);
    const totalDurationMs = Math.max(batchTotalDurationMs + legacyDurationMs, batchTotalDurationMs + legacyAssetDurationMs);
    logger.info(`${debugTag} response daily=${dailyArray.length} assets=${assetBreakdown.length} totalPlays=${totalPlays} totalMinutes=${Math.round(totalDurationMs / 60000)}`);

    return res.json({
      campaignId,
      screenId: screenId || null,
      totals: {
        plays: totalPlays,
        minutes: Math.round(totalDurationMs / 60000)
      },
      daily: dailyArray,
      assetBreakdown
    });
  } catch (err) {
    logger.error('Error in campaign slot analytics:', err);
    return res.status(500).json({ error: 'Server Error' });
  }
};

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

    // Compute real month-over-month growth trends for cards
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      billboardsInLast30d,
      publishersInLast30d,
      bookingsInLast30d,
      revenueInLast30dResult
    ] = await Promise.all([
      prisma.billboard.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      prisma.publisher.count({ where: { status: 'active', joinDate: { gte: thirtyDaysAgo } } }),
      prisma.campaign.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      prisma.campaign.aggregate({ where: { createdAt: { gte: thirtyDaysAgo } }, _sum: { totalAmount: true } })
    ]);

    const totalRevenue = parseFloat(revenueResult._sum.totalAmount || 0);
    const revenueInLast30d = parseFloat(revenueInLast30dResult._sum.totalAmount || 0);

    const prevBillboards = totalBillboards - billboardsInLast30d;
    const prevPublishers = totalPublishers - publishersInLast30d;
    const prevBookings = totalCampaigns - bookingsInLast30d;
    const prevRevenue = totalRevenue - revenueInLast30d;

    const billboardTrendVal = prevBillboards > 0 
      ? parseFloat(((billboardsInLast30d / prevBillboards) * 100).toFixed(1))
      : (billboardsInLast30d > 0 ? 100 : 0);
    const publisherTrendVal = prevPublishers > 0 
      ? parseFloat(((publishersInLast30d / prevPublishers) * 100).toFixed(1))
      : (publishersInLast30d > 0 ? 100 : 0);
    const bookingTrendVal = prevBookings > 0 
      ? parseFloat(((bookingsInLast30d / prevBookings) * 100).toFixed(1))
      : (bookingsInLast30d > 0 ? 100 : 0);
    const revenueTrendVal = prevRevenue > 0 
      ? parseFloat(((revenueInLast30d / prevRevenue) * 100).toFixed(1))
      : (revenueInLast30d > 0 ? 100 : 0);

    const stats = {
      totalBookings: totalCampaigns,
      totalRevenue: totalRevenue,
      totalBillboards: totalBillboards,
      totalPublishers: totalPublishers,
      billboardStatus: statusCounts,
      recentActivity: activityData,
      revenueData: revenueData,
      trends: {
        billboards: { value: billboardTrendVal, isPositive: billboardTrendVal >= 0 },
        publishers: { value: publisherTrendVal, isPositive: publisherTrendVal >= 0 },
        bookings: { value: bookingTrendVal, isPositive: bookingTrendVal >= 0 },
        revenue: { value: revenueTrendVal, isPositive: revenueTrendVal >= 0 }
      }
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
    const { startDate, endDate } = req.query;

    if (startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      const campaigns = await prisma.campaign.findMany({
        where: {
          createdAt: {
            gte: start,
            lte: end,
          },
        },
        select: { createdAt: true, totalAmount: true },
        orderBy: { createdAt: 'asc' },
      });

      const diffTime = Math.abs(end - start);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays <= 31) {
        // Group by Day
        const byDay = new Map();
        for (let i = 0; i <= diffDays; i++) {
          const d = new Date(start);
          d.setDate(start.getDate() + i);
          const key = d.toISOString().slice(0, 10);
          byDay.set(key, { revenue: 0, bookings: 0 });
        }

        for (const c of campaigns) {
          const key = (c.createdAt || new Date()).toISOString().slice(0, 10);
          const amount = Number(c.totalAmount || 0);
          if (byDay.has(key)) {
            const current = byDay.get(key);
            byDay.set(key, {
              revenue: current.revenue + amount,
              bookings: current.bookings + 1
            });
          }
        }

        const series = Array.from(byDay.entries()).map(([iso, data]) => {
          const d = new Date(iso);
          return {
            name: d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }),
            revenue: Math.max(0, Math.round(data.revenue)),
            bookings: data.bookings
          };
        });

        return res.json({ period: 'custom_day', data: series });
      } else {
        // Group by Month
        const byMonth = new Map();
        let tempDate = new Date(start.getFullYear(), start.getMonth(), 1);
        while (tempDate <= end) {
          const key = `${tempDate.getFullYear()}-${String(tempDate.getMonth() + 1).padStart(2, '0')}`;
          byMonth.set(key, { revenue: 0, bookings: 0 });
          tempDate.setMonth(tempDate.getMonth() + 1);
        }
        const lastKey = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}`;
        byMonth.set(lastKey, { revenue: 0, bookings: 0 });

        for (const c of campaigns) {
          const dt = c.createdAt || new Date();
          const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
          const amount = Number(c.totalAmount || 0);
          if (byMonth.has(key)) {
            const current = byMonth.get(key);
            byMonth.set(key, {
              revenue: current.revenue + amount,
              bookings: current.bookings + 1
            });
          }
        }

        const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const series = Array.from(byMonth.entries()).map(([ym, data]) => {
          const [y, m] = ym.split('-').map(Number);
          return {
            name: `${monthNames[m - 1]} ${y}`,
            revenue: Math.max(0, Math.round(data.revenue)),
            bookings: data.bookings
          };
        });

        return res.json({ period: 'custom_month', data: series });
      }
    }

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
        byDay.set(key, { revenue: 0, bookings: 0 });
      }

      for (const c of campaigns) {
        const key = (c.createdAt || new Date()).toISOString().slice(0, 10);
        const amount = Number(c.totalAmount || 0);
        if (byDay.has(key)) {
          const current = byDay.get(key);
          byDay.set(key, {
            revenue: current.revenue + amount,
            bookings: current.bookings + 1
          });
        }
      }

      const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      const series = Array.from(byDay.entries()).map(([iso, data]) => {
        const d = new Date(iso);
        return {
          name: dayNames[d.getDay()],
          revenue: Math.max(0, Math.round(data.revenue)),
          bookings: data.bookings
        };
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
      byMonth.set(key, { revenue: 0, bookings: 0 });
    }

    for (const c of campaigns) {
      const dt = c.createdAt || new Date();
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
      const amount = Number(c.totalAmount || 0);
      if (byMonth.has(key)) {
        const current = byMonth.get(key);
        byMonth.set(key, {
          revenue: current.revenue + amount,
          bookings: current.bookings + 1
        });
      }
    }

    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const series = Array.from(byMonth.entries()).map(([ym, data]) => {
      const [y, m] = ym.split('-').map(Number);
      return {
        name: monthNames[m - 1],
        revenue: Math.max(0, Math.round(data.revenue)),
        bookings: data.bookings
      };
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
  getCampaignSlotAnalytics,
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
