const express = require('express');
const { query, body, param } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db/pool');
const validate = require('../middleware/validate');
const { authenticate, requireAdmin } = require('../middleware/auth');
const createUserNotification = require('../utils/createUserNotification');
const createAdminNotification = require('../utils/createAdminNotification');
const socketService = require('../socket/socketService');
const { scheduleAutoClose,
  cancelAutoClose,
  updateAutoClose,
  executeAutoClose,
  getRemainingSeconds,
  getActiveTradeIds,
  getDurationSeconds,
} = require('../services/tradeAutoClose');
const { buildUpdate, BOT_TRADES_WHITELIST, BOT_TRADES_FIELD_MAP } = require('../utils/buildUpdate');

const router = express.Router();
router.use(authenticate);

// ── Helper: format a bot_trade row for API responses ─────────
// Cannot be replaced by the camelCase middleware alone because it also:
//   • coerces MySQL DECIMAL strings to JS numbers (parseFloat)
//   • appends the live remainingSeconds from the in-memory timer
function formatTrade(row) {
  if (!row) return row;
  return {
    id: row.id,
    userId: row.user_id,
    pair: row.pair,
    side: row.side,
    entryPrice: parseFloat(row.entry_price),
    exitPrice: row.exit_price ? parseFloat(row.exit_price) : null,
    amount: parseFloat(row.amount),
    pnl: parseFloat(row.pnl || 0),
    pnlPct: parseFloat(row.pnl_pct || 0),
    finalPnl: row.final_pnl !== null && row.final_pnl !== undefined ? parseFloat(row.final_pnl) : null,
    displayPnl: row.display_pnl !== null && row.display_pnl !== undefined ? parseFloat(row.display_pnl) : null,
    expectedProfit: row.expected_profit ? parseFloat(row.expected_profit) : null,
    tradeDurationSeconds: row.trade_duration_seconds || null,
    strategy: row.strategy,
    signal: row.signal,
    timeframe: row.timeframe || '1h',
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    status: row.status,
    closeReason: row.close_reason || null,
    remainingSeconds: row.status === 'open' ? getRemainingSeconds(row.id) : null,
  };
}

// ── GET /botTrades?userId=:id ────────────────────────────────
router.get(
  '/',
  async (req, res, next) => {
    try {
      // Admin bulk fetch — no userId required
      if (!req.query.userId) {
        if (req.user.role !== 'Admin') {
          return res.status(403).json({ success: false, message: 'Admin access required' });
        }
        const [rows] = await pool.query('SELECT * FROM bot_trades ORDER BY opened_at DESC');
        return res.json({ success: true, data: rows.map(formatTrade) });
      }

      const userId = parseInt(req.query.userId);
      if (isNaN(userId)) return res.status(422).json({ success: false, message: 'Invalid userId' });
      if (req.user.role !== 'Admin' && req.user.id !== userId) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      const [rows] = await pool.query(
        'SELECT * FROM bot_trades WHERE user_id = ? ORDER BY opened_at DESC',
        [userId]
      );
      res.json({ success: true, data: rows.map(formatTrade) });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /botTrades/admin/active  (Admin — all open trades) ───
router.get('/admin/active', requireAdmin, async (req, res, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT bt.*, u.first_name, u.last_name, u.email
      FROM bot_trades bt
      JOIN users u ON u.id = bt.user_id
      WHERE bt.status = 'open'
      ORDER BY bt.opened_at DESC
    `);
    const data = rows.map(row => ({
      ...formatTrade(row),
      userName: `${row.first_name} ${row.last_name}`,
      userEmail: row.email,
    }));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ── GET /botTrades/:id ───────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const [[row]] = await pool.query('SELECT * FROM bot_trades WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ success: false, message: 'Bot trade not found' });
    if (req.user.role !== 'Admin' && req.user.id !== row.user_id) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    res.json({ success: true, data: formatTrade(row) });
  } catch (err) {
    next(err);
  }
});

// ── POST /botTrades ──────────────────────────────────────────
router.post(
  '/',
  [
    body('userId').isInt({ min: 1 }),
    body('pair').trim().notEmpty(),
    body('side').isIn(['buy', 'sell']),
    body('entryPrice').isFloat({ min: 0 }),
    body('amount').isFloat({ min: 0 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const {
        userId, pair, side, entryPrice, exitPrice, amount, pnl, pnlPct,
        strategy, signal, openedAt, closedAt, status,
        timeframe, expectedProfit, tradeDurationSeconds,
      } = req.body;

      if (req.user.role !== 'Admin' && req.user.id !== userId) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }

      const id = uuidv4();
      const tradeStatus = status || 'open';
      const tf = timeframe || '1h';

      await pool.query(
        `INSERT INTO bot_trades
          (id, user_id, pair, side, entry_price, exit_price, amount,
           pnl, pnl_pct, strategy, signal, timeframe, opened_at, closed_at, status,
           expected_profit, trade_duration_seconds)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          id, userId, pair, side, entryPrice, exitPrice || null, amount,
          pnl || 0, pnlPct || 0, strategy || null, signal || null, tf,
          openedAt || new Date(), closedAt || null, tradeStatus,
          expectedProfit || null, tradeDurationSeconds || null,
        ]
      );

      const [[row]] = await pool.query('SELECT * FROM bot_trades WHERE id = ?', [id]);

      // Schedule auto-close for open trades
      if (tradeStatus === 'open') {
        scheduleAutoClose(row, tradeDurationSeconds || null, expectedProfit || null);

        // Notify user of new bot trade opened
        createUserNotification({
          userId,
          title: `Bot Trade Opened — ${pair}`,
          message: `${strategy || 'Bot'} opened a ${side.toUpperCase()} position on ${pair} at $${parseFloat(entryPrice).toLocaleString()}. Timeframe: ${tf}`,
          type: 'bot_open',
          relatedId: id,
          relatedType: 'bot_trade',
        }).catch(err => console.error('[Notification Error]', err));

        // Notify admin instantly
        const [[user]] = await pool.query('SELECT first_name, last_name FROM users WHERE id = ?', [userId]);
        const userName = user ? `${user.first_name} ${user.last_name}` : `User #${userId}`;

        createAdminNotification({
          title: `Bot Trade Opened — ${userName}`,
          message: `AI Bot Trading is Active for ${userName}. Strategy: ${strategy || 'Unknown'}, Pair: ${pair}, Timeframe: ${tf}, Side: ${side.toUpperCase()}`,
          type: 'bot_position_open',
          relatedId: id,
          relatedType: 'bot_trade',
        }).catch(err => console.error('[Notification Error]', err));

        // Emit real-time to admin
        socketService.emitToAdmins('botTrade:opened', {
          tradeId: id,
          userId,
          userName,
          pair,
          side,
          strategy,
          timeframe: tf,
          entryPrice,
          amount,
          openedAt: row.opened_at,
        });
      }

      res.status(201).json({ success: true, data: formatTrade(row) });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /botTrades/admin/execute  (Admin — force open a trade for a user) ──
router.post(
  '/admin/execute',
  requireAdmin,
  [
    body('userId').isInt({ min: 1 }),
    body('pair').trim().notEmpty(),
    body('side').isIn(['buy', 'sell']),
    body('entryPrice').isFloat({ min: 0 }),
    body('amount').isFloat({ min: 0 }),
    body('strategy').trim().notEmpty(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const {
        userId, pair, side, entryPrice, amount, strategy,
        signal, timeframe, expectedProfit, tradeDurationSeconds,
      } = req.body;

      const id = uuidv4();
      const tf = timeframe || '1h';

      await pool.query(
        `INSERT INTO bot_trades
          (id, user_id, pair, side, entry_price, amount,
           pnl, pnl_pct, strategy, signal, timeframe, opened_at, status,
           expected_profit, trade_duration_seconds)
         VALUES (?,?,?,?,?,?,0,0,?,?,?,NOW(),'open',?,?)`,
        [id, userId, pair, side, entryPrice, amount, strategy, signal || null, tf,
         expectedProfit || null, tradeDurationSeconds || null]
      );

      const [[row]] = await pool.query('SELECT * FROM bot_trades WHERE id = ?', [id]);

      // Schedule auto-close
      scheduleAutoClose(row, tradeDurationSeconds || null, expectedProfit || null);

      // Notify user
      createUserNotification({
        userId,
        title: `Bot Trade Opened — ${pair}`,
        message: `${strategy} opened a ${side.toUpperCase()} position on ${pair} at $${parseFloat(entryPrice).toLocaleString()}. Timeframe: ${tf}`,
        type: 'bot_open',
        relatedId: id,
        relatedType: 'bot_trade',
      }).catch(err => console.error('[Notification Error]', err));

      // Notify admin
      const [[user]] = await pool.query('SELECT first_name, last_name FROM users WHERE id = ?', [userId]);
      const userName = user ? `${user.first_name} ${user.last_name}` : `User #${userId}`;

      createAdminNotification({
        title: `Admin Executed Bot Trade — ${userName}`,
        message: `Admin opened ${strategy} ${side.toUpperCase()} on ${pair} for ${userName}. Timeframe: ${tf}`,
        type: 'bot_position_open',
        relatedId: id,
        relatedType: 'bot_trade',
      }).catch(err => console.error('[Notification Error]', err));

      socketService.emitToAdmins('botTrade:opened', {
        tradeId: id, userId, userName, pair, side, strategy, timeframe: tf, entryPrice, amount,
        openedAt: row.opened_at,
      });

      res.status(201).json({ success: true, data: formatTrade(row) });
    } catch (err) {
      next(err);
    }
  }
);

// ── PATCH /botTrades/admin/:id/profit  (Admin — update profit target & duration) ──
router.patch(
  '/admin/:id/profit',
  requireAdmin,
  [
    param('id').notEmpty(),
    body('expectedProfit').optional().isFloat({ min: 0 }),
    body('tradeDurationSeconds').optional().isInt({ min: 10 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const [[trade]] = await pool.query('SELECT * FROM bot_trades WHERE id = ?', [req.params.id]);
      if (!trade) return res.status(404).json({ success: false, message: 'Bot trade not found' });

      const { expectedProfit, tradeDurationSeconds } = req.body;
      const updates = {};
      if (expectedProfit !== undefined) updates.expected_profit = expectedProfit;
      if (tradeDurationSeconds !== undefined) updates.trade_duration_seconds = tradeDurationSeconds;

      if (Object.keys(updates).length) {
        const set = Object.keys(updates).map(k => `\`${k}\` = ?`).join(', ');
        await pool.query(`UPDATE bot_trades SET ${set} WHERE id = ?`, [...Object.values(updates), req.params.id]);
      }

      // Reschedule auto-close timer if trade is still open
      if (trade.status === 'open') {
        await updateAutoClose(
          req.params.id,
          tradeDurationSeconds || null,
          expectedProfit !== undefined ? expectedProfit : (trade.expected_profit || null)
        );
      }

      const [[updated]] = await pool.query('SELECT * FROM bot_trades WHERE id = ?', [req.params.id]);
      res.json({ success: true, data: formatTrade(updated) });
    } catch (err) {
      next(err);
    }
  }
);

// ── PATCH /botTrades/:id ─────────────────────────────────────
router.patch('/:id', async (req, res, next) => {
  try {
    const [[trade]] = await pool.query('SELECT * FROM bot_trades WHERE id = ?', [req.params.id]);
    if (!trade) return res.status(404).json({ success: false, message: 'Bot trade not found' });
    if (req.user.role !== 'Admin' && req.user.id !== trade.user_id) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const result = buildUpdate(req.body, BOT_TRADES_WHITELIST, BOT_TRADES_FIELD_MAP);
    if (!result) {
      return res.status(400).json({ success: false, message: 'No valid fields' });
    }
    const { updates, setClauses: set, values } = result;
    await pool.query(`UPDATE bot_trades SET ${set} WHERE id = ?`, [...values, req.params.id]);
    const [[updated]] = await pool.query('SELECT * FROM bot_trades WHERE id = ?', [req.params.id]);

    // If closing manually, cancel the auto-close timer
    if (updates.status === 'closed' && trade.status !== 'closed') {
      cancelAutoClose(req.params.id);

      const pnlVal = parseFloat(updates.pnl ?? trade.pnl ?? 0);
      const pnlPctVal = parseFloat(updates.pnl_pct ?? trade.pnl_pct ?? 0);
      const isProfit = pnlVal >= 0;
      const pnlStr = `${isProfit ? '+' : ''}$${Math.abs(pnlVal).toFixed(2)} (${isProfit ? '+' : ''}${pnlPctVal.toFixed(2)}%)`;
      const closeType = isProfit ? 'take_profit' : 'stop_loss';

      createUserNotification({
        userId: trade.user_id,
        title: isProfit
          ? `Take Profit Hit — ${trade.pair} ${pnlStr}`
          : `Stop Loss Hit — ${trade.pair} ${pnlStr}`,
        message: `${trade.strategy || 'Bot'} closed your ${trade.side.toUpperCase()} position on ${trade.pair}. P&L: ${pnlStr}`,
        type: closeType,
        relatedId: req.params.id,
        relatedType: 'bot_trade',
      }).catch(err => console.error('[Notification Error]', err));
    }

    res.json({ success: true, data: formatTrade(updated) });
  } catch (err) {
    next(err);
  }
});

// ── POST /botTrades/admin/:id/force-close  (Admin — force close now) ──
router.post('/admin/:id/force-close', requireAdmin, async (req, res, next) => {
  try {
    const [[trade]] = await pool.query('SELECT * FROM bot_trades WHERE id = ?', [req.params.id]);
    if (!trade) return res.status(404).json({ success: false, message: 'Bot trade not found' });
    if (trade.status !== 'open') return res.status(400).json({ success: false, message: 'Trade is not open' });

    cancelAutoClose(req.params.id);
    await executeAutoClose(req.params.id, trade.expected_profit || null);

    const [[updated]] = await pool.query('SELECT * FROM bot_trades WHERE id = ?', [req.params.id]);
    res.json({ success: true, data: formatTrade(updated) });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /botTrades  (Admin only — delete ALL) ─────────────
router.delete('/', requireAdmin, async (req, res, next) => {
  if (req.body?.confirm !== true) {
    return res.status(400).json({
      success: false,
      message: 'Bulk delete requires { "confirm": true } in the request body.',
    });
  }
  try {
    // Cancel all active auto-close timers first
    const activeIds = getActiveTradeIds();
    activeIds.forEach(id => cancelAutoClose(id));
    await pool.query('DELETE FROM bot_trades');
    res.json({ success: true, message: 'All bot trades deleted' });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /botTrades/:id  (Admin only) ──────────────────────
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    cancelAutoClose(req.params.id);
    const [result] = await pool.query('DELETE FROM bot_trades WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Bot trade not found' });
    res.json({ success: true, message: 'Bot trade deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
