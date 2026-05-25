const prisma = require('../db/db');
const { getTestMode } = require('./developerMode');
const { flattenGeneratedSlotRecords } = require('./generatedSlotFormat');

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
        const istDate = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Kolkata',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).format(new Date());
        const todayIST = istDate;
        console.log(`[SOCKET_HELPER] todayIST determined as: ${todayIST}`);

        const scheduleDate = new Date(todayIST);

        const defaultAsset = await prisma.defaultAsset.findFirst({
            where: { isActive: true },
            orderBy: { updatedAt: 'desc' }
        });
        const defaultUrl = defaultAsset ? defaultAsset.assetUrl : 'https://res.cloudinary.com/dh0ehlpkp/image/upload/v1772717423/Logo_ssxriy.png';

        const billboard = await prisma.billboard.findFirst({
            where: {
                OR: [
                    { id: String(screenId) },
                    { screen_id: String(screenId) }
                ]
            }
        });

        // Check if test mode is enabled globally and for this specific billboard
        const testModeEnabled = await getTestMode();
        const billboardTestCampaignEnabled = billboard && billboard.testCampaignEnabled === true;

        if (testModeEnabled && billboardTestCampaignEnabled && billboard.testCampaignSlots) {
            console.log(`[SOCKET_HELPER] Test campaign enabled for billboard ${billboard.id}. Using test slots.`);
            const testSlots = typeof billboard.testCampaignSlots === 'string'
                ? JSON.parse(billboard.testCampaignSlots)
                : billboard.testCampaignSlots;

            const playlist = testSlots.map((slot, index) => {
                const mediaType = String(slot.assetUrl || "").toLowerCase().endsWith('.mp4') ? 'video' : 'image';
                const sNumber = index + 1;
                return {
                    id: `test-slot-${sNumber}`,
                    _id: `test-slot-${sNumber}`,
                    url: slot.assetUrl || defaultUrl,
                    asset_url: slot.assetUrl || defaultUrl,
                    type: mediaType,
                    media_type: mediaType,
                    duration: slot.durationSec || 15,
                    campaignId: slot.campaignId || 'test',
                    campaign_id: slot.campaignId || 'test',
                    slotNumber: sNumber,
                    slot_number: sNumber
                };
            });

            const assets = [...new Set(playlist.map(s => s.asset_url))];
            console.log(`[SOCKET_HELPER] Returning test playlist with ${playlist.length} items for date ${todayIST}`);
            return { playlist, assets, date: todayIST };
        }

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



            const existingSlotCount = await prisma.dailySlot.count({
                where: { scheduleId: schedule.id }
            });

            // Count how many existing slots are actually assigned to campaigns
            const assignedSlotCount = await prisma.dailySlot.count({
                where: { scheduleId: schedule.id, campaignId: { not: null } }
            });

            const needsGeneration   = existingSlotCount === 0;
            const needsRegeneration = existingSlotCount > 0 && assignedSlotCount === 0 && activeCampaigns.length > 0;

            if (needsGeneration || needsRegeneration) {
                if (needsRegeneration) {
                    await prisma.dailySlot.deleteMany({ where: { scheduleId: schedule.id } });
                    console.log(`[SOCKET_HELPER] Deleted ${existingSlotCount} stale default-only slots. Regenerating with ${activeCampaigns.length} campaign(s).`);
                }

                // Load generated slot assignments from GeneratedSlot table for this billboard and today's date
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

                console.log(`[SOCKET_HELPER] Found ${billboardGeneratedSlots.length} matching generated slots in GeneratedSlot table for screen ${resolvedScreenId} on ${todayIST}`);

                const slotsData = [];

                // Global Default Asset Config
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

                    if (i <= 8) {
                        // Rotation slots 1-8: Find if there's a generated slot for this slot number today
                        const matchingSlot = billboardGeneratedSlots.find(s => s.slotNumber === i);
                        if (matchingSlot) {
                            campaignId = matchingSlot.campaignId;
                            assetUrl = matchingSlot.assetUrl || globalUrl;
                            durationSec = matchingSlot.duration || globalDuration;
                            console.log(`[SOCKET_HELPER] Assigned Slot #${i} to campaign ${campaignId} with asset ${assetUrl}`);
                        } else {
                            // If no campaign assigned to this slot, use the default asset (Slot 9 config)
                            assetUrl = s9Url;
                            durationSec = s9Dur;
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
                await prisma.dailySlot.createMany({ data: slotsData });
                console.log(`[SOCKET_HELPER] Created ${slotsData.length} slots. Assigned: ${slotsData.filter(s => s.campaignId).length}`);
            } else {
                console.log(`[SOCKET_HELPER] Schedule ${schedule.id} has ${existingSlotCount} slots (${assignedSlotCount} assigned). No regeneration needed.`);
            }
        }

        // 3. Fetch slots for the schedule
        let slots = await prisma.dailySlot.findMany({
            where: { scheduleId: schedule.id },
            orderBy: { slotNumber: 'asc' }
        });

        // RECONCILIATION: Ensure Slot 9 and 10 exist and Slot 9 matches Default (Billboard Specific or Global)
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
                slot9.assetUrl = s9Url;
                slot9.durationSec = s9Dur;
                slot9.campaignId = null;
            }
        } else {
            await prisma.dailySlot.create({
                data: {
                    scheduleId: schedule.id,
                    slotNumber: 9,
                    assetUrl: s9Url,
                    durationSec: s9Dur,
                    slotStart: scheduleDate,
                    slotEnd: new Date(scheduleDate.getTime() + 24 * 60 * 60 * 1000)
                }
            });
            needsRefresh = true;
        }

        // Slot 10: Prioritize Billboard Specific Slot 10, fallback to Slot 9 (which is Billboard or Global)
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

        console.log(`[SOCKET_HELPER] Initialized ${slots.length} slots for schedule ${schedule.id}`);

        // 4. Dynamic Asset Update for logo placeholders
        const slotsWithLogo = slots.filter(s => s.assetUrl === defaultUrl && s.campaignId);

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

        const playlist = slots.map(s => {
            const mediaType = String(s.assetUrl || "").toLowerCase().endsWith('.mp4') ? 'video' : 'image';
            return {
                id: s.id || `slot-${s.slotNumber}`,
                _id: s.id || `slot-${s.slotNumber}`,
                url: s.assetUrl,
                asset_url: s.assetUrl,
                type: mediaType,
                media_type: mediaType,
                duration: s.durationSec,
                campaignId: s.campaignId || 'default',
                campaign_id: s.campaignId || 'default',
                slotNumber: s.slotNumber,
                slot_number: s.slotNumber
            };
        });

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
