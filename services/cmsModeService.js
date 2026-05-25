const prisma = require('../db/db');
const { getPlaylistForScreen } = require('../utils/socketHelpers');

/**
 * Trigger an instantaneous real-time sync for a specific screen if CMS Mode is enabled.
 * It clears today's daily schedule/slots, forces regeneration, and broadcasts the fresh playlist over WebSockets.
 * 
 * @param {string} screenId The ID of the screen or billboard.
 */
async function triggerRealtimeSync(screenId) {
  try {
    if (!screenId) return;

    // Find the billboard to check if CMS mode is enabled
    const billboard = await prisma.billboard.findFirst({
      where: {
        OR: [
          { id: String(screenId) },
          { screen_id: String(screenId) }
        ]
      }
    });

    if (!billboard) {
      console.log(`[CMS_MODE] No billboard found for screenId ${screenId}`);
      return;
    }

    const resolvedScreenId = billboard.screen_id || String(screenId);

    // Broadcast updated billboard details including cmsMode
    const io = global.io;
    if (io) {
      const globalDefault = await prisma.defaultAsset.findFirst({
        where: { isActive: true },
        orderBy: { updatedAt: 'desc' }
      });
      const globalUrl = globalDefault ? globalDefault.assetUrl : 'https://res.cloudinary.com/dh0ehlpkp/image/upload/v1772717423/Logo_ssxriy.png';
      const defaultAssetUrl = billboard.defaultAssetUrl || globalUrl;

      const detailsPayload = {
        screenId: billboard.id,
        name: billboard.name,
        location: billboard.location,
        city: billboard.city,
        defaultImage: defaultAssetUrl,
        cmsMode: Boolean(billboard.cmsMode)
      };

      io.to(resolvedScreenId).emit('billboard-details', detailsPayload);
      io.to(`screen:${resolvedScreenId}`).emit('billboard-details', detailsPayload);
      console.log(`[CMS_MODE] Emitted billboard-details with cmsMode: ${billboard.cmsMode} to screen ${resolvedScreenId}`);
    }

    if (!billboard.cmsMode) {
      console.log(`[CMS_MODE] CMS Mode is not enabled for screenId: ${screenId}`);
      return;
    }

    console.log(`[CMS_MODE] CMS Mode is active for screen ${screenId}. Clearing today's daily slots for real-time regeneration.`);

    // Determine today's scheduleDate in IST timezone
    const istDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date());
    const scheduleDate = new Date(istDate);

    // Find today's daily schedule for this screen
    const schedule = await prisma.dailySchedule.findFirst({
      where: { screenId: resolvedScreenId, scheduleDate }
    });

    if (schedule) {
      // Clear today's daily slots
      await prisma.dailySlot.deleteMany({
        where: { scheduleId: schedule.id }
      });
      // Delete today's daily schedule
      await prisma.dailySchedule.delete({
        where: { id: schedule.id }
      });
      console.log(`[CMS_MODE] Cleared today's schedule (${schedule.id}) and slots for screen ${resolvedScreenId}`);
    }

    // Force instant regeneration of slots
    const { playlist, date } = await getPlaylistForScreen(resolvedScreenId);

    if (io) {
      // Broadcast playlist to target screen rooms (both resolved screen_id and screen: screen_id namespace)
      io.to(resolvedScreenId).emit('playlist', { screenId: resolvedScreenId, playlist, date });
      io.to(`screen:${resolvedScreenId}`).emit('playlist', { screenId: resolvedScreenId, playlist, date });
      console.log(`[CMS_MODE] Successfully emitted live playlist changes to screen ${resolvedScreenId} over socket rooms`);
    } else {
      console.warn(`[CMS_MODE] WebSocket (io) instance is not globally registered. Could not broadcast playlist.`);
    }
  } catch (err) {
    console.error(`[CMS_MODE] Error in triggerRealtimeSync for screen ${screenId}:`, err);
  }
}

module.exports = { triggerRealtimeSync };
