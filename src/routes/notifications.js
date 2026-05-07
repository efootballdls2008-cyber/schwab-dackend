const express = require('express');
const { query, body, param } = require('express-validator');
const pool = require('../db/pool');
const validate = require('../middleware/validate');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// Helper to build routes for both notifications and userNotifications tables
function buildNotificationRoutes(table) {
  const r = express.Router();

  // GET /?userId=:id
  r.get('/', async (req, res, next) => {
    try {
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

  // GET /:id
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

  // POST /  (Admin creates notifications)
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

  // PATCH /:id  (mark read)
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

  return r;
}

module.exports = { buildNotificationRoutes };
