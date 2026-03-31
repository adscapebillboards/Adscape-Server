const prisma = require('../db/db');

const getStartOfDayIST = (dateStr) => {
    // Treat dateStr as YYYY-MM-DD
    const d = new Date(`${dateStr}T00:00:00+05:30`);
    return d;
};

/**
 * Fetches the today's playlist and unique asset list for a given screen.
 * This mirrors the logic in playerV1Controller.js but returns data for sockets.
 */
async function getPlaylistForScreen(screenId) {
    try {
        // Get today's date in IST YYYY-MM-DD
        const istDate = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Kolkata',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).format(new Date());
        const todayIST = istDate;
        console.log(`[SOCKET_HELPER] todayIST determined as: ${todayIST}`);

        const scheduleDate = new Date(todayIST);

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
        console.log(`[SOCKET_HELPER] Resolving ${screenId} -> ${resolvedScreenId}`);

        const billboardIds = [resolvedScreenId];
        if (billboard) {
            billboardIds.push(String(billboard.id));
            if (billboard.screen_id) billboardIds.push(String(billboard.screen_id));
        }

        let schedule = await prisma.dailySchedule.findFirst({
            where: { screenId: resolvedScreenId, scheduleDate },
            include: { _count: { select: { slots: true } } }
        });

        if (!schedule || (schedule._count && schedule._count.slots === 0)) {
            if (schedule && schedule._count.slots === 0) {
                console.log(`[SOCKET_HELPER] Schedule exists but has 0 slots. Regenerating...`);
            } else {
                console.log(`[SOCKET_HELPER] No schedule found for ${resolvedScreenId} on ${todayIST}. Generating...`);
            }
            // Proactive generation for socket join
            const dayStart = getStartOfDayIST(todayIST);
            const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

            const campaigns = await prisma.campaign.findMany({
                where: {
                    status: { in: ['ACTIVE', 'LIVE', 'SCHEDULED'] },
                    startDate: { lte: new Date(dayEnd.getTime() + 6 * 60 * 60 * 1000) },
                    endDate: { gte: dayStart }
                }
            });
            console.log(`[SOCKET_HELPER] Found ${campaigns.length} campaigns in date range`);

            const activeCampaigns = campaigns.filter(c => {
                if (!c.billboards) return false;
                const bbs = typeof c.billboards === 'string' ? JSON.parse(c.billboards) : c.billboards;
                const matched = bbs.some(b => {
                    const bId = String(b.id || b.billboardId || "");
                    const bSid = String(b.screen_id || b.screenId || "");
                    return billboardIds.includes(bId) || billboardIds.includes(bSid);
                });
                return matched;
            });
            console.log(`[SOCKET_HELPER] Filtered to ${activeCampaigns.length} active campaigns for this screen`);

            schedule = await prisma.dailySchedule.upsert({
                where: {
                    screenId_scheduleDate: {
                        screenId: resolvedScreenId,
                        scheduleDate
                    }
                },
                update: {},
                create: { screenId: resolvedScreenId, scheduleDate }
            });
            console.log(`[SOCKET_HELPER] Ensured DailySchedule exists: ${schedule.id}`);

            const defaultAsset = await prisma.defaultAsset.findFirst({ where: { isActive: true } });
            const defaultUrl = defaultAsset ? defaultAsset.assetUrl : 'https://res.cloudinary.com/dh0ehlpkp/image/upload/v1772717423/Logo_ssxriy.png';

            const existingSlotCount = await prisma.dailySlot.count({
                where: { scheduleId: schedule.id }
            });

            if (existingSlotCount === 0) {
                const slotsData = [];
                let rrIndex = 0;
                for (let i = 1; i <= 8; i++) {
                    let campaignId = null;
                    let assetUrl = defaultUrl;

                    if (activeCampaigns.length > 0) {
                        const campaign = activeCampaigns[rrIndex];
                        rrIndex = (rrIndex + 1) % activeCampaigns.length;
                        campaignId = campaign.id;

                        const bbs = typeof campaign.billboards === 'string' ? JSON.parse(campaign.billboards) : campaign.billboards;
                        const bb = bbs.find(b => {
                            const bId = String(b.id || b.billboardId || "");
                            const bSid = String(b.screen_id || b.screenId || "");
                            return billboardIds.includes(bId) || billboardIds.includes(bSid);
                        });

                        if (bb) {
                            assetUrl = (bb.files && bb.files.length > 0) ? bb.files[0] : (bb.creative || bb.images?.[0] || defaultUrl);
                        }
                    }

                    slotsData.push({
                        scheduleId: schedule.id,
                        slotNumber: i,
                        campaignId: campaignId,
                        assetUrl: assetUrl,
                        durationSec: 15,
                        slotStart: new Date(),
                        slotEnd: new Date()
                    });
                }
                await prisma.dailySlot.createMany({ data: slotsData });
                console.log(`[SOCKET_HELPER] Created ${slotsData.length} slots`);
            } else {
                console.log(`[SOCKET_HELPER] Schedule ${schedule.id} already has ${existingSlotCount} slots. Skipping slot generation.`);
            }
        }

        // 3. Fetch slots for the schedule
        let slots = await prisma.dailySlot.findMany({
            where: { scheduleId: schedule.id },
            orderBy: { slotNumber: 'asc' }
        });
        console.log(`[SOCKET_HELPER] Initialized ${slots.length} slots for schedule ${schedule.id}`);

        // 4. Dynamic Asset Update for logo placeholders
        const defaultLogo = 'https://res.cloudinary.com/dh0ehlpkp/image/upload/v1772717423/Logo_ssxriy.png';
        const slotsWithLogo = slots.filter(s => s.assetUrl === defaultLogo && s.campaignId);

        if (slotsWithLogo.length > 0) {
            const dayStart = getStartOfDayIST(todayIST);
            const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

            const campaigns = await prisma.campaign.findMany({
                where: {
                    status: { in: ['ACTIVE', 'LIVE', 'SCHEDULED'] },
                    startDate: { lte: new Date(dayEnd.getTime() + 6 * 60 * 60 * 1000) }, // +6h buffer
                    endDate: { gte: dayStart }
                }
            });

            const activeCampaigns = campaigns.filter(c => {
                if (!c.billboards) return false;
                const bbs = typeof c.billboards === 'string' ? JSON.parse(c.billboards) : c.billboards;
                return bbs.some(b => {
                    const bId = String(b.id || b.billboardId || "");
                    const bSid = String(b.screen_id || b.screenId || "");
                    return billboardIds.includes(bId) || billboardIds.includes(bSid);
                });
            });

            for (const slot of slotsWithLogo) {
                const campaign = activeCampaigns.find(c => c.id === slot.campaignId);
                if (campaign) {
                    const bbs = typeof campaign.billboards === 'string' ? JSON.parse(campaign.billboards) : campaign.billboards;
                    const bb = bbs.find(b => {
                        const bId = String(b.id || b.billboardId || "");
                        const bSid = String(b.screen_id || b.screenId || "");
                        return billboardIds.includes(bId) || billboardIds.includes(bSid);
                    });
                    if (bb && bb.files && bb.files.length > 0) {
                        const realAssetUrl = bb.files[0];
                        await prisma.dailySlot.update({
                            where: { id: slot.id },
                            data: { assetUrl: realAssetUrl }
                        });
                        slot.assetUrl = realAssetUrl;
                    }
                }
            }
        }

        const assets = [...new Set(slots.map(s => s.assetUrl))];
        const dateStr = scheduleDate.toISOString().split('T')[0];
        console.log(`[SOCKET_HELPER] Returning playlist with ${slots.length} items for date ${dateStr}. Assets: ${assets.length}`);
        if (slots.length > 0) {
            console.log(`[SOCKET_HELPER] Sample Asset: ${slots[0].assetUrl}, campaignId: ${slots[0].campaignId}`);
        }

        const playlist = slots.map(s => ({
            slot: s.slotNumber,
            campaignId: s.campaignId,
            durationSec: s.durationSec,
            assetUrl: s.assetUrl
        }));

        return { playlist, assets, date: dateStr };
    } catch (error) {
        console.error('[SOCKET_HELPER] Error getting playlist:', error);
        const fallbackDate = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Kolkata',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).format(new Date());
        return { playlist: [], assets: [], date: fallbackDate };
    }
}

module.exports = { getPlaylistForScreen };
