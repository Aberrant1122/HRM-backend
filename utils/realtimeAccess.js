const { authenticate } = require('../middleware/authMiddleware');

async function sessionFor(socket) {
  const token = socket.handshake.auth?.token;
  const req = {
    headers: { authorization: typeof token === 'string' ? `Bearer ${token}` : socket.handshake.headers.authorization },
    query: {},
  };
  let user;
  await authenticate(req, { status() { return this; }, json() {} }, () => { user = req.user; });
  if (!user || user.role === 'hr') throw new Error('Unauthorized socket session');
  return user;
}

function configureRealtimeAccess(io) {
  io.use(async (socket, next) => {
    try { socket.data.userId = (await sessionFor(socket)).id; next(); }
    catch (_) { next(new Error('Unauthorized socket session')); }
  });
  io.on('connection', socket => {
    socket.join(`user_${socket.data.userId}`);
    socket.use(async (_, next) => {
      try { await sessionFor(socket); next(); }
      catch (_) { socket.disconnect(true); next(new Error('Socket session revoked')); }
    });
    socket.on('join', (userId, acknowledge) => {
      const allowed = Number(userId) === Number(socket.data.userId);
      if (allowed) socket.join(`user_${socket.data.userId}`);
      if (typeof acknowledge === 'function') acknowledge({ ok: allowed });
    });
  });
}

async function emitToUser(io, userId, event, payload) {
  // Room membership alone is insufficient: a previously joined session may have
  // been deactivated or revoked since its last client event.
  let sockets;
  try { sockets = await io.in(`user_${userId}`).fetchSockets(); }
  catch (_) { return 0; }
  const delivered = await Promise.all(sockets.map(async socket => {
    try {
      const user = await sessionFor(socket);
      if (Number(user.id) !== Number(userId)) throw new Error('Wrong notification target');
      socket.emit(event, payload);
      return 1;
    } catch (_) {
      socket.disconnect(true);
      return 0;
    }
  }));
  return delivered.reduce((sum, count) => sum + count, 0);
}

module.exports = { configureRealtimeAccess, emitToUser };
