/**
 * Socket.io service — manages admin room, user rooms, and notification broadcasting.
 *
 * Admin clients join the "admins" room on connection (after JWT auth).
 * Regular users join a personal room "user:<id>" on connection.
 * Any backend code can call emitAdminNotification() or emitUserNotification()
 * to push real-time notifications.
 */

let _io = null;

/**
 * Initialise the socket service with the Socket.io server instance.
 * Call this once from server.js after creating the http server.
 * @param {import('socket.io').Server} io
 */
function init(io) {
  _io = io;

  io.on('connection', (socket) => {
    // Read role and userId from socket.data — populated by the JWT middleware
    // from the verified token. socket.data is server-controlled and cannot be
    // written by the client, unlike socket.handshake.auth which the client
    // sends and could be spoofed if the middleware were ever removed or reordered.
    const role = socket.data.role;
    const uid  = socket.data.userId ?? socket.handshake.auth?.adminId; // adminId: legacy fallback

    if (role === 'Admin') {
      socket.join('admins');
      console.log(`[socket] Admin ${uid} connected (${socket.id})`);
    } else if (uid) {
      // Regular users join their personal room
      socket.join(`user:${uid}`);
      console.log(`[socket] User ${uid} connected (${socket.id})`);
    }

    // Allow admin to mark a notification read via socket (optional convenience)
    socket.on('notification:markRead', ({ id }) => {
      io.to('admins').emit('notification:updated', { id, isRead: true });
    });

    socket.on('disconnect', () => {
      if (role === 'Admin') {
        console.log(`[socket] Admin ${uid} disconnected (${socket.id})`);
      } else if (uid) {
        console.log(`[socket] User ${uid} disconnected (${socket.id})`);
      }
    });
  });
}

/**
 * Emit a new notification event to all connected admin clients.
 * @param {object} notification  - The full notification row (camelCased)
 */
function emitAdminNotification(notification) {
  if (!_io) return;
  _io.to('admins').emit('notification:new', notification);
}

/**
 * Emit a generic event to all admins (e.g. counts refresh).
 * @param {string} event
 * @param {*} payload
 */
function emitToAdmins(event, payload) {
  if (!_io) return;
  _io.to('admins').emit(event, payload);
}

/**
 * Emit a new notification to a specific user's socket room.
 * @param {number|string} userId
 * @param {object} notification  - camelCased notification object
 */
function emitUserNotification(userId, notification) {
  if (!_io) return;
  _io.to(`user:${userId}`).emit('notification:new', notification);
}

/**
 * Emit a generic event to a specific user.
 * @param {number|string} userId
 * @param {string} event
 * @param {*} payload
 */
function emitToUser(userId, event, payload) {
  if (!_io) return;
  _io.to(`user:${userId}`).emit(event, payload);
}

/**
 * Emit a bot trade event to all admins.
 * @param {string} event  - e.g. 'botTrade:opened', 'botTrade:closed', 'botTrade:updated'
 * @param {object} payload
 */
function emitBotTradeUpdate(event, payload) {
  if (!_io) return;
  _io.to('admins').emit(event, payload);
}

module.exports = { init, emitAdminNotification, emitToAdmins, emitUserNotification, emitToUser, emitBotTradeUpdate };
