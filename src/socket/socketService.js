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
    const { role, adminId } = socket.handshake.auth;
    // userId is stored as adminId in the JWT middleware (it's just the decoded id)
    const userId = adminId;

    if (role === 'Admin') {
      socket.join('admins');
      console.log(`[socket] Admin ${userId} connected (${socket.id})`);
    } else if (userId) {
      // Regular users join their personal room
      socket.join(`user:${userId}`);
      console.log(`[socket] User ${userId} connected (${socket.id})`);
    }

    // Allow admin to mark a notification read via socket (optional convenience)
    socket.on('notification:markRead', ({ id }) => {
      io.to('admins').emit('notification:updated', { id, isRead: true });
    });

    socket.on('disconnect', () => {
      if (role === 'Admin') {
        console.log(`[socket] Admin ${userId} disconnected (${socket.id})`);
      } else if (userId) {
        console.log(`[socket] User ${userId} disconnected (${socket.id})`);
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

module.exports = { init, emitAdminNotification, emitToAdmins, emitUserNotification, emitToUser };
