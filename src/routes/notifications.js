const express = require('express');
const { query, body, param } = require('express-validator');
const pool = require('../db/pool');
const validate = require('../middleware/validate');
const { authenticate, requireAdmin } = require('../middleware/auth');
const socketService = require('../socket/socketService');

// ── Helper: camelCase a DB row ────────────────────────────────
// NOTE: Only used for socket emissions which bypass res.json() and the
// camelCase middleware. REST responses return raw rows and rely on the
// middleware for key transformation.
function toCamelAdmin(row) {
  if (!row) return row;
  return {
    id: row.id,
    title: row.title,
    message: row.message,
    type: row.type,
    isRead: !!row.is_read,
    relatedId: row.related_id,
    relatedType: row.related_type,
    createdAt: row.created_at,
  };
}

// ── Allowlist of tables this factory is permitted to query ────
const ALLOWED_NOTIFICATION_TABLES = new Set(['user_notifications']);

// ── Helper: build routes for a given table ────────────────────
function buildNotificationRoutes(table) {
  if (!ALLOWED_NOTIFICATION_TABLES.has(table)) {
    throw new Error(
      `[notifications] Refusing to build routes for unknown table "${table}". ` +
      `Add it to ALLOWED_NOTIFICATION_TABLES if it is intentional.`
    );
  }

  const r = express.Router();
  r.use(authenticate);

  // PATCH /mark-all-read  — mark all as read for a user
  r.patch('/mark-all-read', async (req, res, next) => {
    try {
      const userId = parseInt(req.query.userId || req.body.userId);
      if (isNaN(userId)) return res.status(422).json({ success: false, message: 'userId required' });
      if (req.user.role !== 'Admin' && req.user.id !== userId) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      await pool.query(`UPDATE ${table} SET is_read = 1 WHERE user_id = ? AND is_read = 0`, [userId]);
      // Emit socket event so other tabs update
      try {
        socketService.emitToUser(userId, 'notification:allRead', {});
      } catch (socketErr) {
        console.error('[Socket Error]', socketErr);
      }
      res.json({ success: true, message: 'All notifications marked as read' });
    } catch (err) {
      next(err);
    }
  });

  // GET /unread-count?userId=:id
  r.get('/unread-count', async (req, res, next) => {
    try {
      const userId = parseInt(req.query.userId);
      if (isNaN(userId)) return res.status(422).json({ success: false, message: 'userId required' });
      if (req.user.role !== 'Admin' && req.user.id !== userId) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      const [[{ count }]] = await pool.query(
        `SELECT COUNT(*) AS count FROM ${table} WHERE user_id = ? AND is_read = 0`,
        [userId]
      );
      res.json({ success: true, data: { count } });
    } catch (err) {
      next(err);
    }
  });

  // GET /?userId=:id  — list notifications for a user (admin can omit userId for bulk fetch)
  r.get('/', async (req, res, next) => {
    try {
      // Admin bulk fetch — no userId required
      if (!req.query.userId) {
        if (req.user.role !== 'Admin') {
          return res.status(403).json({ success: false, message: 'Admin access required' });
        }
        const [rows] = await pool.query(`SELECT * FROM ${table} ORDER BY created_at DESC`);
        return res.json({ success: true, data: rows });
      }

      const userId = parseInt(req.query.userId);
      if (isNaN(userId)) return res.status(422).json({ success: false, message: 'userId required' });
      if (req.user.role !== 'Admin' && req.user.id !== userId) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      const [rows] = await pool.query(
        `SELECT * FROM ${table} WHERE user_id = ? ORDER BY created_at DESC`,
        [userId]
      );
      res.json({ success: true, data: rows });
    } catch (err) {
      next(err);
    }
  });

  // GET /:id  — single notification
  r.get('/:id', [param('id').isInt({ min: 1 })], validate, async (req, res, next) => {
    try {
      const [[row]] = await pool.query(`SELECT * FROM ${table} WHERE id = ?`, [req.params.id]);
      if (!row) return res.status(404).json({ success: false, message: 'Notification not found' });
      if (req.user.role !== 'Admin' && req.user.id !== row.user_id) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      res.json({ success: true, data: row });
    } catch (err) {
      next(err);
    }
  });

  // POST /  — admin creates a notification
  r.post(
    '/',
    requireAdmin,
    [
      body('userId').isInt({ min: 1 }),
      body('title').trim().notEmpty(),
      body('message').trim().notEmpty(),
    ],
    validate,
    async (req, res, next) => {
      try {
        const { userId, title, message, type } = req.body;
        const [result] = await pool.query(
          `INSERT INTO ${table} (user_id, title, message, type) VALUES (?,?,?,?)`,
          [userId, title, message, type || 'info']
        );
        const [[row]] = await pool.query(`SELECT * FROM ${table} WHERE id = ?`, [result.insertId]);
        res.status(201).json({ success: true, data: row });
      } catch (err) {
        next(err);
      }
    }
  );

  // PATCH /:id  — mark read / unread
  r.patch('/:id', [param('id').isInt({ min: 1 })], validate, async (req, res, next) => {
    try {
      const [[row]] = await pool.query(`SELECT * FROM ${table} WHERE id = ?`, [req.params.id]);
      if (!row) return res.status(404).json({ success: false, message: 'Notification not found' });
      if (req.user.role !== 'Admin' && req.user.id !== row.user_id) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      const { isRead } = req.body;
      await pool.query(`UPDATE ${table} SET is_read = ? WHERE id = ?`, [isRead ? 1 : 0, req.params.id]);
      const [[updated]] = await pool.query(`SELECT * FROM ${table} WHERE id = ?`, [req.params.id]);
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /  — admin bulk delete all notifications in this table
  r.delete('/', requireAdmin, async (req, res, next) => {
    if (req.body?.confirm !== true) {
      return res.status(400).json({
        success: false,
        message: 'Bulk delete requires { "confirm": true } in the request body.',
      });
    }
    try {
      await pool.query(`DELETE FROM ${table}`);
      res.json({ success: true, message: 'All notifications deleted' });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /:id  — user can delete their own; admin can delete any
  r.delete('/:id', [param('id').isInt({ min: 1 })], validate, async (req, res, next) => {
    try {
      const [[row]] = await pool.query(`SELECT * FROM ${table} WHERE id = ?`, [req.params.id]);
      if (!row) return res.status(404).json({ success: false, message: 'Notification not found' });
      if (req.user.role !== 'Admin' && req.user.id !== row.user_id) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      const [result] = await pool.query(`DELETE FROM ${table} WHERE id = ?`, [req.params.id]);
      if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Notification not found' });
      // Emit to the user's socket room
      try {
        socketService.emitToUser(row.user_id, 'notification:deleted', { id: parseInt(req.params.id) });
      } catch (socketErr) {
        console.error('[Socket Error]', socketErr);
      }
      res.json({ success: true, message: 'Notification deleted' });
    } catch (err) {
      next(err);
    }
  });

  return r;
}

// ── Admin Notifications router ────────────────────────────────
// Separate table + endpoints specifically for admin-facing notifications.
// These are triggered automatically by system events (new user, deposit, etc.)
// and are visible only in the admin panel.

const adminNotifRouter = express.Router();
adminNotifRouter.use(authenticate);
adminNotifRouter.use(requireAdmin);

// GET /adminNotifications  — list all (newest first), optional ?unreadOnly=true
adminNotifRouter.get('/', async (req, res, next) => {
  try {
    const unreadOnly = req.query.unreadOnly === 'true';
    const whereClause = unreadOnly ? 'WHERE is_read = 0' : '';
    const [rows] = await pool.query(
      `SELECT * FROM admin_notifications ${whereClause} ORDER BY created_at DESC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// GET /adminNotifications/unread-count
adminNotifRouter.get('/unread-count', async (req, res, next) => {
  try {
    const [[{ count }]] = await pool.query(
      'SELECT COUNT(*) AS count FROM admin_notifications WHERE is_read = 0'
    );
    res.json({ success: true, data: { count } });
  } catch (err) {
    next(err);
  }
});

// GET /adminNotifications/:id
adminNotifRouter.get('/:id', [param('id').isInt({ min: 1 })], validate, async (req, res, next) => {
  try {
    const [[row]] = await pool.query('SELECT * FROM admin_notifications WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ success: false, message: 'Notification not found' });
    res.json({ success: true, data: row });
  } catch (err) {
    next(err);
  }
});

// POST /adminNotifications  — manually create an admin notification
adminNotifRouter.post(
  '/',
  [
    body('title').trim().notEmpty(),
    body('message').trim().notEmpty(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { title, message, type, relatedId, relatedType } = req.body;
      const [result] = await pool.query(
        `INSERT INTO admin_notifications (title, message, type, related_id, related_type) VALUES (?,?,?,?,?)`,
        [title, message, type || 'info', relatedId || null, relatedType || null]
      );
      const [[row]] = await pool.query('SELECT * FROM admin_notifications WHERE id = ?', [result.insertId]);
      // Emit real-time to all connected admins
      try {
        socketService.emitAdminNotification(toCamelAdmin(row));
      } catch (socketErr) {
        console.error('[Socket Error]', socketErr);
      }
      res.status(201).json({ success: true, data: row });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /adminNotifications/mark-all-read  — bulk mark all as read (must be before /:id)
adminNotifRouter.patch('/mark-all-read', async (req, res, next) => {
  try {
    await pool.query('UPDATE admin_notifications SET is_read = 1 WHERE is_read = 0');
    try {
      socketService.emitToAdmins('notification:allRead', {});
    } catch (socketErr) {
      console.error('[Socket Error]', socketErr);
    }
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (err) {
    next(err);
  }
});

// PATCH /adminNotifications/:id  — mark read/unread
adminNotifRouter.patch('/:id', [param('id').isInt({ min: 1 })], validate, async (req, res, next) => {
  try {
    const [[row]] = await pool.query('SELECT * FROM admin_notifications WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ success: false, message: 'Notification not found' });
    const { isRead } = req.body;
    await pool.query('UPDATE admin_notifications SET is_read = ? WHERE id = ?', [isRead ? 1 : 0, req.params.id]);
    const [[updated]] = await pool.query('SELECT * FROM admin_notifications WHERE id = ?', [req.params.id]);
    // Broadcast update to all admins
    try {
      socketService.emitToAdmins('notification:updated', toCamelAdmin(updated));
    } catch (socketErr) {
      console.error('[Socket Error]', socketErr);
    }
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /adminNotifications/:id
adminNotifRouter.delete('/:id', [param('id').isInt({ min: 1 })], validate, async (req, res, next) => {
  try {
    const [result] = await pool.query('DELETE FROM admin_notifications WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Notification not found' });
    try {
      socketService.emitToAdmins('notification:deleted', { id: parseInt(req.params.id) });
    } catch (socketErr) {
      console.error('[Socket Error]', socketErr);
    }
    res.json({ success: true, message: 'Notification deleted' });
  } catch (err) {
    next(err);
  }
});

// DELETE /adminNotifications  — delete all
adminNotifRouter.delete('/', async (req, res, next) => {
  if (req.body?.confirm !== true) {
    return res.status(400).json({
      success: false,
      message: 'Bulk delete requires { "confirm": true } in the request body.',
    });
  }
  try {
    await pool.query('DELETE FROM admin_notifications');
    try {
      socketService.emitToAdmins('notification:allDeleted', {});
    } catch (socketErr) {
      console.error('[Socket Error]', socketErr);
    }
    res.json({ success: true, message: 'All notifications deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = { buildNotificationRoutes, adminNotifRouter, toCamelAdmin };
