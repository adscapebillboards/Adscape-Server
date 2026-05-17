/**
 * P2P signaling hub for live-feed asset replication.
 * Relays WebRTC offers/answers/ICE between Android player, browser viewers, and relay peers.
 * Does NOT proxy media bytes — only coordinates peer connections.
 */

/**
 * @typedef {'player' | 'viewer' | 'relay'} PeerRole
 */

/**
 * @typedef {object} ScreenPeers
 * @property {string | null} playerSocketId
 * @property {Map<string, { role: PeerRole, canRelay: boolean, joinedAt: number }>} peers
 */

/** @type {Map<string, ScreenPeers>} */
const screenPeers = new Map();

function getScreenPeers(screenId) {
  const sid = String(screenId || '').trim();
  if (!sid) return null;
  let entry = screenPeers.get(sid);
  if (!entry) {
    entry = { playerSocketId: null, peers: new Map() };
    screenPeers.set(sid, entry);
  }
  return entry;
}

function registerPlayerSocket(screenId, socketId) {
  const entry = getScreenPeers(screenId);
  if (!entry) return;
  entry.playerSocketId = socketId;
  entry.peers.set(socketId, {
    role: 'player',
    canRelay: false,
    joinedAt: Date.now(),
  });
}

function removePeer(socketId) {
  for (const [screenId, entry] of screenPeers.entries()) {
    if (entry.playerSocketId === socketId) entry.playerSocketId = null;
    if (entry.peers.delete(socketId) && entry.peers.size === 0 && !entry.playerSocketId) {
      screenPeers.delete(screenId);
    }
  }
}

/**
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
function attachLiveFeedP2PHandlers(io, socket) {
  socket.on('p2p-register', (data) => {
    const screenId = String(data?.screenId || '').trim();
    const role = data?.role === 'player' ? 'player' : data?.role === 'relay' ? 'relay' : 'viewer';
    if (!screenId) return;

    const entry = getScreenPeers(screenId);
    if (!entry) return;

    if (role === 'player') {
      entry.playerSocketId = socket.id;
    }

    entry.peers.set(socket.id, {
      role,
      canRelay: !!data?.canRelay,
      joinedAt: Date.now(),
    });

    socket.data.p2pScreenId = screenId;
    socket.data.p2pRole = role;

    socket.emit('p2p-registered', { screenId, socketId: socket.id, role });
  });

  socket.on('p2p-signal', (msg) => {
    const to = String(msg?.toSocketId || '').trim();
    if (!to) return;
    io.to(to).emit('p2p-signal', {
      ...msg,
      fromSocketId: socket.id,
    });
  });

  socket.on('p2p-request-relay', (data) => {
    const screenId = String(data?.screenId || '').trim();
    if (!screenId) return;
    const entry = getScreenPeers(screenId);
    if (!entry) return;

    const candidates = [];
    for (const [peerId, meta] of entry.peers.entries()) {
      if (peerId === socket.id) continue;
      if (meta.role === 'relay' || meta.canRelay) {
        candidates.push({ peerId, joinedAt: meta.joinedAt });
      }
    }
    candidates.sort((a, b) => a.joinedAt - b.joinedAt);
    const relay = candidates[0];
    if (!relay) {
      socket.emit('p2p-relay-unavailable', { screenId });
      return;
    }

    io.to(relay.peerId).emit('p2p-relay-requested', {
      screenId,
      viewerSocketId: socket.id,
    });
    socket.emit('p2p-relay-assigned', {
      screenId,
      relaySocketId: relay.peerId,
    });
  });

  socket.on('disconnect', () => {
    removePeer(socket.id);
  });
}

/**
 * Notify the Android player that a viewer is ready for a direct P2P session.
 * @param {import('socket.io').Server} io
 * @param {string} screenId
 * @param {string} viewerSocketId
 */
function notifyPlayerViewerReady(io, screenId, viewerSocketId) {
  const entry = getScreenPeers(screenId);
  const playerId = entry?.playerSocketId;
  if (!playerId) return;
  io.to(playerId).emit('p2p-viewer-ready', {
    screenId,
    viewerSocketId,
  });
}

/**
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 * @param {string} screenId
 */
function onViewerJoined(io, socket, screenId) {
  const sid = String(screenId || '').trim();
  if (!sid) return;

  const entry = getScreenPeers(sid);
  if (!entry) return;

  entry.peers.set(socket.id, {
    role: 'viewer',
    canRelay: false,
    joinedAt: Date.now(),
  });
  socket.data.p2pScreenId = sid;
  socket.data.p2pRole = 'viewer';

  notifyPlayerViewerReady(io, sid, socket.id);

  // If player is offline, try to assign an existing relay peer immediately.
  if (!entry.playerSocketId) {
    const relays = [];
    for (const [peerId, meta] of entry.peers.entries()) {
      if (peerId === socket.id) continue;
      if (meta.role === 'relay' || meta.canRelay) relays.push({ peerId, joinedAt: meta.joinedAt });
    }
    relays.sort((a, b) => a.joinedAt - b.joinedAt);
    if (relays[0]) {
      socket.emit('p2p-relay-assigned', { screenId: sid, relaySocketId: relays[0].peerId });
      io.to(relays[0].peerId).emit('p2p-relay-requested', {
        screenId: sid,
        viewerSocketId: socket.id,
      });
    }
  }
}

module.exports = {
  attachLiveFeedP2PHandlers,
  onViewerJoined,
  notifyPlayerViewerReady,
  registerPlayerSocket,
};
