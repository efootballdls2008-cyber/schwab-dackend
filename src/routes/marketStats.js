const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// ── GET /marketStats ─────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM market_stats ORDER BY id ASC');
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
