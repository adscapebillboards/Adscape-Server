const prisma = require('../db/db');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const { flattenGeneratedSlotRecords } = require('../utils/generatedSlotFormat');

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
                status: { in: ['ACTIVE', 'LIVE', 'SCHEDULED'] },
                startDate: { lte: new Date(dayEnd.getTime() + 6 * 60 * 60 * 1000) }, // +6h buffer for boundary campaigns
                endDate: { gte: dayStart }
            }
        });

        const billboard = await prisma.billboard.findFirst({
            where: {
                OR: [
                    { id: String(screenId) },
                    { screen_id: String(screenId) }
                ]
            }
        });

        // RESOLUTION: standardize on screen_id (machineId) if available
        const resolvedScreenId = (billboard && billboard.screen_id) ? billboard.screen_id : String(screenId);
        console.log(`[API] Resolving screenId ${screenId} -> ${resolvedScreenId}`);

        const billboardIds = [resolvedScreenId];
        if (billboard) {
            billboardIds.push(String(billboard.id));
            if (billboard.screen_id) billboardIds.push(String(billboard.screen_id));
        }

        const activeCampaigns = campaigns.filter(c => {
            if (!c.billboards) return false;
            const bbs = typeof c.billboards === 'string' ? JSON.parse(c.billboards) : c.billboards;
            return bbs.some(b => {
                const bId = String(b.id || b.billboardId || "");
                const bSid = String(b.screen_id || b.screenId || "");
                return billboardIds.includes(bId) || billboardIds.includes(bSid);
            });
        });

        let schedule = await prisma.dailySchedule.findFirst({
            where: { screenId: resolvedScreenId, scheduleDate }
        });

        if (!schedule) {
            schedule = await prisma.dailySchedule.create({
                data: { screenId: resolvedScreenId, scheduleDate }
            });

            // Load generated slots assignments from GeneratedSlot table for this billboard and today's date
            const generatedSlotRecords = await prisma.generatedSlot.findMany();
            const flatGeneratedSlots = flattenGeneratedSlotRecords(generatedSlotRecords, {
                activeAt: scheduleDate
            });

            // Filter for slots that belong to this billboard
            const billboardGeneratedSlots = flatGeneratedSlots.filter(s => {
                return billboardIds.includes(String(s.billboardId)) || 
                       (s.screenId && billboardIds.includes(String(s.screenId))) ||
                       (s.screenIds && s.screenIds.some(sid => billboardIds.includes(String(sid))));
            });

            console.log(`[API_CONTROLLER] Found ${billboardGeneratedSlots.length} matching generated slots in GeneratedSlot table for screen ${resolvedScreenId} on ${date}`);

            const slotsData = [];

            const globalDefault = await prisma.defaultAsset.findFirst({
                where: { isActive: true },
                orderBy: { updatedAt: 'desc' }
            });
            const globalUrl = globalDefault ? globalDefault.assetUrl : 'https://res.cloudinary.com/dh0ehlpkp/image/upload/v1772717423/Logo_ssxriy.png';
            const globalDuration = globalDefault ? globalDefault.duration : 15;

            // Slot 9 & 10 configurations
            const s9Url = (billboard && billboard.defaultAssetUrl) ? billboard.defaultAssetUrl : globalUrl;
            const s9Dur = (billboard && billboard.defaultAssetDuration) ? billboard.defaultAssetDuration : globalDuration;
            const s10Url = (billboard && billboard.slot10Enabled && billboard.slot10AssetUrl) ? billboard.slot10AssetUrl : s9Url;
            const s10Dur = (billboard && billboard.slot10Enabled && billboard.slot10AssetDuration) ? billboard.slot10AssetDuration : s9Dur;

            for (let i = 1; i <= 10; i++) {
                let campaignId = null;
                let assetUrl = globalUrl;
                let durationSec = globalDuration;
                let shouldAddSlot = true;

                if (i <= 8) {
                    // Rotation slots 1-8: Find if there's a generated slot for this slot number today
                    const matchingSlot = billboardGeneratedSlots.find(s => s.slotNumber === i);
                    if (matchingSlot) {
                        campaignId = matchingSlot.campaignId;
                        assetUrl = matchingSlot.assetUrl || globalUrl;
                        durationSec = matchingSlot.duration || globalDuration;
                    } else {
                        // Unbooked commercial slot: skip so it doesn't play and default doesn't repeat
                        shouldAddSlot = false;
                    }
                } else if (i === 9) {
                    // Slot 9: Global Default Asset
                    assetUrl = s9Url;
                    durationSec = s9Dur;
                } else if (i === 10) {
                    // Slot 10: Billboard Specific Overlay or Fallback to Slot 9
                    assetUrl = s10Url;
                    durationSec = s10Dur;
                }

                if (shouldAddSlot) {
                    slotsData.push({
                        scheduleId: schedule.id,
                        slotNumber: i,
                        campaignId: campaignId,
                        assetUrl: assetUrl,
                        durationSec: durationSec,
                        slotStart: new Date(),
                        slotEnd: new Date()
                    });
                }
            }

            await prisma.dailySlot.createMany({ data: slotsData });
        }

        let slots = await prisma.dailySlot.findMany({
            where: { scheduleId: schedule.id },
            orderBy: { slotNumber: 'asc' }
        });

        // RECONCILIATION: Ensure Slot 9 and 10 exist
        const currentSlotNumbers = slots.map(s => s.slotNumber);
        const globalDefault = await prisma.defaultAsset.findFirst({
            where: { isActive: true },
            orderBy: { updatedAt: 'desc' }
        });
        const globalUrl = globalDefault ? globalDefault.assetUrl : 'https://res.cloudinary.com/dh0ehlpkp/image/upload/v1772717423/Logo_ssxriy.png';
        const globalDuration = globalDefault ? globalDefault.duration : 15;

        // Slot 9: Prioritize Billboard Specific Default, fallback to Global
        const s9Url = (billboard && billboard.defaultAssetUrl) ? billboard.defaultAssetUrl : globalUrl;
        const s9Dur = (billboard && billboard.defaultAssetDuration) ? billboard.defaultAssetDuration : globalDuration;

        let needsRefresh = false;
        // Force Slot 9 to match current configuration
        const slot9 = slots.find(s => s.slotNumber === 9);
        if (slot9) {
            if (slot9.assetUrl !== s9Url || slot9.campaignId !== null || slot9.durationSec !== s9Dur) {
                await prisma.dailySlot.update({
                    where: { id: slot9.id },
                    data: { assetUrl: s9Url, campaignId: null, durationSec: s9Dur }
                });
                needsRefresh = true;
            }
        } else {
            await prisma.dailySlot.create({
                data: {
                    scheduleId: schedule.id,
                    slotNumber: 9,
                    assetUrl: s9Url,
                    durationSec: s9Dur,
                    slotStart: new Date(),
                    slotEnd: new Date()
                }
            });
            needsRefresh = true;
        }

        // Slot 10: Prioritize Billboard Specific Slot 10, fallback to Slot 9
        const slot10 = slots.find(s => s.slotNumber === 10);
        const s10Url = (billboard && billboard.slot10Enabled && billboard.slot10AssetUrl) ? billboard.slot10AssetUrl : s9Url;
        const s10Dur = (billboard && billboard.slot10Enabled && billboard.slot10AssetDuration) ? billboard.slot10AssetDuration : s9Dur;

        if (slot10) {
            if (slot10.assetUrl !== s10Url || slot10.durationSec !== s10Dur) {
                await prisma.dailySlot.update({
                    where: { id: slot10.id },
                    data: { assetUrl: s10Url, durationSec: s10Dur, campaignId: null }
                });
                needsRefresh = true;
            }
        } else {
            await prisma.dailySlot.create({
                data: {
                    scheduleId: schedule.id,
                    slotNumber: 10,
                    assetUrl: s10Url,
                    durationSec: s10Dur,
                    slotStart: new Date(),
                    slotEnd: new Date()
                }
            });
            needsRefresh = true;
        }

        if (needsRefresh) {
            slots = await prisma.dailySlot.findMany({
                where: { scheduleId: schedule.id },
                orderBy: { slotNumber: 'asc' }
            });
        }

        // FIX: If any slots are using the default logo but the campaign now has real files, update them!
        const defaultLogo = 'https://res.cloudinary.com/dh0ehlpkp/image/upload/v1772717423/Logo_ssxriy.png';
        for (const slot of slots) {
            if (slot.assetUrl === defaultLogo && slot.campaignId) {
                const campaign = activeCampaigns.find(c => c.id === slot.campaignId);
                if (campaign) {
                    const bbs = typeof campaign.billboards === 'string' ? JSON.parse(campaign.billboards) : campaign.billboards;
                    const bb = bbs.find(b => String(b.id) === String(screenId) || String(b.screen_id) === String(screenId));
                    if (bb && bb.files && bb.files.length > 0) {
                        const realAssetUrl = bb.files[0];
                        await prisma.dailySlot.update({
                            where: { id: slot.id },
                            data: { assetUrl: realAssetUrl }
                        });
                        slot.assetUrl = realAssetUrl; // Update for response
                    } else if (billboard && billboard.images && billboard.images.length > 0) {
                        const realAssetUrl = billboard.images[0];
                        await prisma.dailySlot.update({
                            where: { id: slot.id },
                            data: { assetUrl: realAssetUrl }
                        });
                        slot.assetUrl = realAssetUrl; // Update for response
                    }
                }
            }
        }

        res.json({
            screenId,
            date: scheduleDate.toISOString().split('T')[0], // YYYY-MM-DD
            timezone: 'Asia/Kolkata',
            slots: slots
                .filter(s => s.slotNumber === 9 || s.slotNumber === 10 || (s.campaignId !== null && s.campaignId !== undefined))
                .map(s => ({
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
