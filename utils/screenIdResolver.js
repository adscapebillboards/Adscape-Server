const prisma = require('../db/db');

/**
 * Resolve a screen/billboard identifier to all socket room aliases.
 * Android pairs with billboard.id; clients often pass screen_id or connection code.
 */
async function resolveScreenContext(screenId) {
    const raw = String(screenId || '').trim();
    if (!raw) {
        return { canonicalScreenId: '', aliases: [], billboard: null };
    }

    const aliases = new Set([raw]);

    const billboard = await prisma.billboard.findFirst({
        where: {
            OR: [
                { id: raw },
                { screen_id: raw },
            ],
        },
    });

    if (billboard) {
        aliases.add(String(billboard.id));
        if (billboard.screen_id) aliases.add(String(billboard.screen_id));
    }

    try {
        const playerScreen = await prisma.playerScreen.findFirst({
            where: {
                OR: [
                    { screenId: raw },
                    { machineId: raw },
                ],
            },
        });
        if (playerScreen?.screenId) aliases.add(String(playerScreen.screenId));
        if (playerScreen?.machineId) aliases.add(String(playerScreen.machineId));
    } catch {
        // PlayerScreen may be absent in some deployments
    }

    const canonicalScreenId = billboard?.id ? String(billboard.id) : raw;

    return {
        canonicalScreenId,
        aliases: [...aliases],
        billboard,
    };
}

/**
 * @param {import('socket.io').Server} io
 * @param {string[]} aliases
 */
function isPlayerOnlineInRooms(io, aliases) {
    if (!io?.sockets?.adapter?.rooms) return false;
    for (const id of aliases) {
        const room = io.sockets.adapter.rooms.get(`screen:${id}`);
        if (room && room.size > 0) return true;
    }
    return false;
}

/**
 * @param {import('socket.io').Server} io
 * @param {string[]} aliases
 */
function countViewersInRooms(io, aliases) {
    if (!io?.sockets?.adapter?.rooms) return 0;
    let total = 0;
    const seen = new Set();
    for (const id of aliases) {
        const room = io.sockets.adapter.rooms.get(`viewer:${id}`);
        if (!room) continue;
        for (const socketId of room) {
            if (!seen.has(socketId)) {
                seen.add(socketId);
                total += 1;
            }
        }
    }
    return total;
}

module.exports = {
    resolveScreenContext,
    isPlayerOnlineInRooms,
    countViewersInRooms,
};
