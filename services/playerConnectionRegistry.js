/**
 * In-memory registry of live Socket.IO player connections (for presence + debugging).
 * Complements room checks — survives alias/id mismatches when machineId is registered.
 */

/** @type {Map<string, { socketId: string, screenIds: Set<string>, machineId: string, joinedAt: number, lastSeen: number }>} */
const bySocketId = new Map();

/** @type {Map<string, Set<string>>} screenOrMachineId -> Set<socketId> */
const byScreenKey = new Map();

function addKey(key, socketId) {
    const k = String(key || '').trim();
    if (!k) return;
    if (!byScreenKey.has(k)) byScreenKey.set(k, new Set());
    byScreenKey.get(k).add(socketId);
}

function removeKey(key, socketId) {
    const k = String(key || '').trim();
    if (!k) return;
    const set = byScreenKey.get(k);
    if (!set) return;
    set.delete(socketId);
    if (set.size === 0) byScreenKey.delete(k);
}

/**
 * @param {string} socketId
 * @param {{ screenId?: string, machineId?: string, aliases?: string[] }} data
 */
function registerPlayer(socketId, data = {}) {
    const machineId = String(data.machineId || data.screenId || '').trim();
    const screenId = String(data.screenId || machineId).trim();
    const aliases = Array.isArray(data.aliases) ? data.aliases.map(String) : [];

    const screenIds = new Set([screenId, machineId, ...aliases].filter(Boolean));

    const existing = bySocketId.get(socketId);
    if (existing) {
        for (const id of existing.screenIds) removeKey(id, socketId);
    }

    const entry = {
        socketId,
        machineId,
        screenIds,
        joinedAt: Date.now(),
        lastSeen: Date.now(),
    };
    bySocketId.set(socketId, entry);

    for (const id of screenIds) addKey(id, socketId);
}

function touch(socketId) {
    const e = bySocketId.get(socketId);
    if (e) e.lastSeen = Date.now();
}

function unregister(socketId) {
    const e = bySocketId.get(socketId);
    if (!e) return;
    for (const id of e.screenIds) removeKey(id, socketId);
    bySocketId.delete(socketId);
}

/**
 * @param {string[]} aliases
 */
function isOnline(aliases) {
    for (const id of aliases) {
        const set = byScreenKey.get(String(id));
        if (set && set.size > 0) return true;
    }
    return false;
}

function countSockets(aliases) {
    const seen = new Set();
    for (const id of aliases) {
        const set = byScreenKey.get(String(id));
        if (!set) continue;
        for (const sid of set) seen.add(sid);
    }
    return seen.size;
}

function listPlayers() {
    return [...bySocketId.values()].map((e) => ({
        socketId: e.socketId,
        machineId: e.machineId,
        screenIds: [...e.screenIds],
        joinedAt: e.joinedAt,
        lastSeen: e.lastSeen,
    }));
}

module.exports = {
    registerPlayer,
    touch,
    unregister,
    isOnline,
    countSockets,
    listPlayers,
};
