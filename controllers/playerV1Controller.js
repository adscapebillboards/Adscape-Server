const prisma = require('../db/db');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'adscape_secret_key_123';

const getStartOfDayIST = (dateStr) => {
    const d = new Date(`${dateStr}T00:00:00+05:30`);
    return d;
};

// 1. Player Registration
exports.register = async (req, res) => {
    try {
        const { deviceId, screenId, firmwareVersion } = req.body;
        const apiKey = req.headers['x-api-key'];

        if (apiKey !== (process.env.PLAYER_API_KEY || 'adscape-player-key-2026')) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        if (!screenId || !deviceId) {
            return res.status(400).json({ error: 'screenId and deviceId required' });
        }

        let screen = await prisma.screen.findUnique({ where: { id: String(screenId) } });
        if (!screen) {
            screen = await prisma.screen.create({ data: { id: String(screenId) } });
        }

        const player = await prisma.adscapePlayer.upsert({
            where: { screenId: String(screenId) },
            update: {
                appVersion: firmwareVersion || '1.0',
                deviceName: deviceId,
                lastSeen: new Date(),
                isActive: true
            },
            create: {
                screenId: String(screenId),
                appVersion: firmwareVersion || '1.0',
                deviceName: deviceId,
                lastSeen: new Date(),
                isActive: true
            }
        });

        res.json({ success: true, player });
    } catch (e) {
        console.error('Register API error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// 2. Player Pairing
exports.pair = async (req, res) => {
    try {
        const { code, screenId } = req.body;
        const apiKey = req.headers['x-api-key'];

        if (apiKey !== (process.env.PLAYER_API_KEY || 'adscape-player-key-2026')) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = jwt.sign({ screenId }, JWT_SECRET, { expiresIn: '1h' });
        res.json({ success: true, token, screenId });
    } catch (e) {
        console.error('Pair API error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// 3. Fetch Daily Schedule
exports.getSchedule = async (req, res) => {
    try {
        const { screenId } = req.params;
        const { date } = req.query;

        if (!date) return res.status(400).json({ error: 'date is required' });

        const scheduleDate = new Date(date);
        const dayStart = getStartOfDayIST(date);
        const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

        const campaigns = await prisma.campaign.findMany({
            where: {
                status: 'ACTIVE',
                startDate: { lte: dayEnd },
                endDate: { gte: dayStart }
            }
        });

        const activeCampaigns = campaigns.filter(c => {
            if (!c.billboards) return false;
            const billboards = typeof c.billboards === 'string' ? JSON.parse(c.billboards) : c.billboards;
            return billboards.some(b => String(b.id) === String(screenId) || String(b.screen_id) === String(screenId));
        });

        let schedule = await prisma.dailySchedule.findFirst({
            where: { screenId, scheduleDate }
        });

        if (!schedule) {
            schedule = await prisma.dailySchedule.create({
                data: { screenId, scheduleDate }
            });

            const slotsData = [];
            let rrIndex = 0;

            const defaultAsset = await prisma.defaultAsset.findFirst({ where: { isActive: true } });
            const defaultUrl = defaultAsset ? defaultAsset.assetUrl : 'https://res.cloudinary.com/dh0ehlpkp/image/upload/v1772717423/Logo_ssxriy.png';

            for (let i = 1; i <= 8; i++) {
                let campaign = null;
                let assetUrl = defaultUrl;

                if (activeCampaigns.length > 0) {
                    campaign = activeCampaigns[rrIndex];
                    rrIndex = (rrIndex + 1) % activeCampaigns.length;

                    const bbs = typeof campaign.billboards === 'string' ? JSON.parse(campaign.billboards) : campaign.billboards;
                    const bb = bbs.find(b => String(b.id) === String(screenId) || String(b.screen_id) === String(screenId));
                    if (bb && bb.video) {
                        assetUrl = bb.video;
                    } else if (bb && bb.images && bb.images.length > 0) {
                        assetUrl = bb.images[0];
                    }
                }

                slotsData.push({
                    scheduleId: schedule.id,
                    slotNumber: i,
                    campaignId: campaign ? campaign.id : null,
                    assetUrl: assetUrl,
                    durationSec: 15,
                    slotStart: new Date(),
                    slotEnd: new Date()
                });
            }

            await prisma.dailySlot.createMany({ data: slotsData });
        }

        const slots = await prisma.dailySlot.findMany({
            where: { scheduleId: schedule.id },
            orderBy: { slotNumber: 'asc' }
        });

        res.json({
            screenId,
            date,
            timezone: 'Asia/Kolkata',
            slots: slots.map(s => ({
                slot: s.slotNumber,
                campaignId: s.campaignId,
                durationSec: s.durationSec,
                assetUrl: s.assetUrl
            }))
        });

    } catch (e) {
        console.error('Schedule API error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// 4. Telemetry Reporting
exports.telemetry = async (req, res) => {
    try {
        const { events } = req.body;
        if (!events || !Array.isArray(events)) {
            return res.status(400).json({ error: 'events array required' });
        }

        const logs = events.map(e => ({
            screenId: String(e.screenId),
            assetUrl: String(e.assetUrl),
            playedAt: new Date(e.playedAt || new Date()),
            campaignId: e.campaignId ? String(e.campaignId) : null,
            durationMs: e.durationMs ? Number(e.durationMs) : null,
            success: e.success !== false
        }));

        await prisma.assetPlayLog.createMany({
            data: logs,
            skipDuplicates: true
        });

        res.json({ success: true, processed: logs.length });
    } catch (e) {
        console.error('Telemetry API error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// 5. Health
exports.health = async (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
};
