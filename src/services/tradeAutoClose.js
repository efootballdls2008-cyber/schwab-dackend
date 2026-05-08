/**
 * Trade Auto-Close Service
 * Schedules automatic trade closure after a configured duration.
 * Uses in-memory timers (acceptable for simulation platform).
 *
 * Timeframe → default duration range (seconds):
 *   1m  → 60–300   (1–5 min)
 *   5m  → 180–600  (3–10 min)
 *   15m → 300–900  (5–15 min)
 *   30m → 600–1200 (10–20 min)
 *   1h  → 900–1800 (15–30 min)
 *   4h  → 1800–3600 (30–60 min)
 *   1d  → 3600–10800 (1–3 hours)
 */

const pool = require('../db/pool');
const createUserNotification = require('../utils/createUserNotification');
const createAdminNotification = require('../utils/createAdminNotification');
const socketService = require('../socket/socketService');
const { decideOutcome, calculateFinalPnL } = require('./strategyOutcomeService');

// Active timers: tradeId → timeoutHandle
const activeTimers = {};

const TIMEFRAME_RANGES = {
  '1m':  { min: 60,   max: 300   },
  '5m':  { min: 180,  max: 600   },
  '15m': { min: 300,  max: 900   },
  '30m': { min: 600,  max: 1200  },
  '1h':  { min: 900,  max: 1800  },
  '4h':  { min: 1800, max: 3600  },
  '1d':  { min: 3600, max: 10800 },
};

/**
 * Get a random duration in seconds for a given timeframe.
 * If adminDurationSeconds is provided, use that instead.
 */
function getDurationSeconds(timeframe, adminDurationSeconds = null) {
  if (adminDurationSeconds && adminDurationSeconds > 0) {
    return adminDurationSeconds;
  }
  const range = TIMEFRAME_RANGES[timeframe] || TIMEFRAME_RANGES['1h'];
  return Math.floor(range.min + Math.random() * (range.max - range.min));
}

/**
 * Schedule auto-close for a trade.
 * @param {object} trade  - Full trade row from DB (snake_case)
 * @param {number} [adminDurationSeconds]  - Override duration
 * @param {number} [adminTargetProfit]     - Override profit amount
 */
function scheduleAutoClose(trade, adminDurationSeconds = null, adminTargetProfit = null) {
  const tradeId = trade.id;

  // Cancel any existing timer for this trade
  cancelAutoClose(tradeId);

  const durationSeconds = getDurationSeconds(trade.timeframe || '1h', adminDurationSeconds);
  const durationMs = durationSeconds * 1000;

  console.log(`[AutoClose] Scheduled trade ${tradeId} to close in ${durationSeconds}s`);

  const handle = setTimeout(async () => {
    delete activeTimers[tradeId];
    await executeAutoClose(tradeId, adminTargetProfit);
  }, durationMs);

  activeTimers[tradeId] = {
    handle,
    scheduledAt: Date.now(),
    durationMs,
    tradeId,
  };

  return durationSeconds;
}

/**
 * Cancel a scheduled auto-close.
 */
function cancelAutoClose(tradeId) {
  if (activeTimers[tradeId]) {
    clearTimeout(activeTimers[tradeId].handle);
    delete activeTimers[tradeId];
  }
}

/**
 * Update the duration or profit target for an active timer.
 * Reschedules the timer with remaining time adjusted.
 */
async function updateAutoClose(tradeId, newDurationSeconds = null, newTargetProfit = null) {
  const existing = activeTimers[tradeId];

  // Fetch trade from DB
  const [[trade]] = await pool.query('SELECT * FROM bot_trades WHERE id = ?', [tradeId]);
  if (!trade || trade.status !== 'open') return;

  if (existing && newDurationSeconds) {
    // Reschedule with new duration from now
    cancelAutoClose(tradeId);
    scheduleAutoClose(trade, newDurationSeconds, newTargetProfit);
  } else if (newTargetProfit !== null && existing) {
    // Just update the profit target — store it on the timer record
    existing.targetProfit = newTargetProfit;
  }
}

/**
 * Execute the actual trade close.
 */
async function executeAutoClose(tradeId, adminTargetProfit = null) {
  try {
    const [[trade]] = await pool.query('SELECT * FROM bot_trades WHERE id = ?', [tradeId]);
    if (!trade || trade.status !== 'open') return;

    // Use admin-set target profit if stored on timer
    const targetProfit = adminTargetProfit ?? (activeTimers[tradeId]?.targetProfit ?? null);

    // Decide outcome based on strategy ratio (async — persists counters to DB)
    const outcome = await decideOutcome(trade.user_id, trade.strategy || 'AI Scalper Pro');
    const { pnl, pnlPct, exitPrice } = calculateFinalPnL(trade, outcome, targetProfit);

    const closedAt = new Date();

    // Update trade in DB
    await pool.query(
      `UPDATE bot_trades SET
        status = 'closed',
        exit_price = ?,
        pnl = ?,
        pnl_pct = ?,
        final_pnl = ?,
        closed_at = ?,
        close_reason = 'duration_expired'
       WHERE id = ?`,
      [exitPrice, pnl, pnlPct, pnl, closedAt, tradeId]
    );

    // Credit or debit the user's balance with the P&L
    await pool.query(
      'UPDATE users SET balance = balance + ? WHERE id = ?',
      [pnl, trade.user_id]
    );

    // Credit or debit the user's balance with the trade P&L.
    // pnl is positive for profit, negative for loss — adding it covers both cases.
    await pool.query(
      'UPDATE users SET balance = balance + ? WHERE id = ?',
      [pnl, trade.user_id]
    );

    // Fetch user info
    const [[user]] = await pool.query('SELECT first_name, last_name FROM users WHERE id = ?', [trade.user_id]);
    const userName = user ? `${user.first_name} ${user.last_name}` : `User #${trade.user_id}`;

    const isProfit = pnl >= 0;
    const pnlStr = `${isProfit ? '+' : ''}$${Math.abs(pnl).toFixed(2)} (${isProfit ? '+' : ''}${pnlPct.toFixed(2)}%)`;

    // Notify user
    await createUserNotification({
      userId: trade.user_id,
      title: isProfit
        ? `Take Profit Hit — ${trade.pair} ${pnlStr}`
        : `Stop Loss Hit — ${trade.pair} ${pnlStr}`,
      message: `${trade.strategy || 'Bot'} closed your ${trade.side.toUpperCase()} position on ${trade.pair}. Final P&L: ${pnlStr}`,
      type: isProfit ? 'take_profit' : 'stop_loss',
      relatedId: tradeId,
      relatedType: 'bot_trade',
    });

    // Notify admin
    await createAdminNotification({
      title: `Bot Trade Closed — ${userName}`,
      message: `${trade.strategy} closed ${trade.side.toUpperCase()} on ${trade.pair} for ${userName}. P&L: ${pnlStr}`,
      type: 'bot_position_close',
      relatedId: tradeId,
      relatedType: 'bot_trade',
    });

    // Emit real-time update to admin
    socketService.emitToAdmins('botTrade:closed', {
      tradeId,
      userId: trade.user_id,
      userName,
      pair: trade.pair,
      strategy: trade.strategy,
      pnl,
      pnlPct,
      closedAt: closedAt.toISOString(),
    });

    // Emit to user
    socketService.emitToUser(trade.user_id, 'botTrade:closed', {
      tradeId,
      pair: trade.pair,
      pnl,
      pnlPct,
      closedAt: closedAt.toISOString(),
    });

    console.log(`[AutoClose] Trade ${tradeId} closed. Outcome: ${outcome}, P&L: ${pnlStr}`);
  } catch (err) {
    console.error(`[AutoClose] Failed to close trade ${tradeId}:`, err.message);
  }
}

/**
 * Get remaining seconds for an active timer.
 */
function getRemainingSeconds(tradeId) {
  const timer = activeTimers[tradeId];
  if (!timer) return null;
  const elapsed = Date.now() - timer.scheduledAt;
  const remaining = Math.max(0, Math.floor((timer.durationMs - elapsed) / 1000));
  return remaining;
}

/**
 * Get all active timer IDs.
 */
function getActiveTradeIds() {
  return Object.keys(activeTimers);
}

/**
 * Restore timers on server restart for open trades.
 * Calculates the true remaining time from opened_at + trade_duration_seconds
 * so a trade that was 25 minutes into a 30-minute window gets ~5 minutes, not
 * a fresh random 30–150s window.
 *
 * Trades that have already overrun their window are closed immediately (1s delay
 * to let the event loop settle after startup).
 */
async function restoreOpenTrades() {
  try {
    const [openTrades] = await pool.query(
      "SELECT * FROM bot_trades WHERE status = 'open'"
    );

    const now = Date.now();
    let restored = 0;

    for (const trade of openTrades) {
      let remainingSeconds;

      if (trade.opened_at && trade.trade_duration_seconds) {
        // Calculate how much of the original window is left
        const openedAtMs   = new Date(trade.opened_at).getTime();
        const totalMs      = trade.trade_duration_seconds * 1000;
        const elapsedMs    = now - openedAtMs;
        const remainingMs  = totalMs - elapsedMs;

        if (remainingMs <= 0) {
          // Window already expired while server was down — close immediately
          remainingSeconds = 1;
        } else {
          remainingSeconds = Math.ceil(remainingMs / 1000);
        }
      } else {
        // No timing data stored — fall back to a short random window
        remainingSeconds = 30 + Math.floor(Math.random() * 120);
      }

      scheduleAutoClose(trade, remainingSeconds, trade.expected_profit || null);
      restored++;
    }

    if (restored > 0) {
      console.log(`[AutoClose] Restored ${restored} open trade timers`);
    }
  } catch (err) {
    console.error('[AutoClose] Failed to restore open trades:', err.message);
  }
}

module.exports = {
  scheduleAutoClose,
  cancelAutoClose,
  updateAutoClose,
  executeAutoClose,
  getRemainingSeconds,
  getActiveTradeIds,
  restoreOpenTrades,
  getDurationSeconds,
};
