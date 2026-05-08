/**
 * Strategy Outcome Service
 * Controls win/loss ratios per strategy per user.
 *
 * Counters are persisted to the `bot_strategy_counters` table so they survive
 * server restarts. The table is created automatically on first use.
 *
 * Ratios (per 10-trade cycle):
 *   AI Scalper Pro  — max 1 loss,  min 8 profits per 10
 *   Trend Follower  — max 3 losses, min 7 profits per 10
 *   Mean Reversion  — max 4 losses, min 6 profits per 10
 *   Grid Bot        — max 5 losses, min 5 profits per 10
 *   DCA Strategy    — max 3 losses, min 7 profits per 10
 */

const pool = require('../db/pool');

const RATIOS = {
  'AI Scalper Pro':  { maxLossesIn10: 1, minProfitsIn10: 8 },
  'Trend Follower':  { maxLossesIn10: 3, minProfitsIn10: 7 },
  'Mean Reversion':  { maxLossesIn10: 4, minProfitsIn10: 6 },
  'Grid Bot':        { maxLossesIn10: 5, minProfitsIn10: 5 },
  'DCA Strategy':    { maxLossesIn10: 3, minProfitsIn10: 7 },
};

// ── Table bootstrap ───────────────────────────────────────────
// Created once on first call; subsequent calls are no-ops.
let tableReady = false;
async function ensureTable() {
  if (tableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bot_strategy_counters (
      user_id  INT          NOT NULL,
      strategy VARCHAR(100) NOT NULL,
      wins     INT          NOT NULL DEFAULT 0,
      losses   INT          NOT NULL DEFAULT 0,
      total    INT          NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, strategy)
    )
  `);
  tableReady = true;
}

// ── DB helpers ────────────────────────────────────────────────

async function loadCounters(userId, strategy) {
  await ensureTable();
  const [[row]] = await pool.query(
    'SELECT wins, losses, total FROM bot_strategy_counters WHERE user_id = ? AND strategy = ?',
    [userId, strategy]
  );
  return row ?? { wins: 0, losses: 0, total: 0 };
}

async function saveCounters(userId, strategy, { wins, losses, total }) {
  await pool.query(
    `INSERT INTO bot_strategy_counters (user_id, strategy, wins, losses, total)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE wins = VALUES(wins), losses = VALUES(losses), total = VALUES(total)`,
    [userId, strategy, wins, losses, total]
  );
}

// ── Public API ────────────────────────────────────────────────

/**
 * Decide if the next trade should be a win or loss, then persist the updated
 * counters so the cycle survives a server restart.
 *
 * @param {number} userId
 * @param {string} strategy
 * @returns {Promise<'win'|'loss'>}
 */
async function decideOutcome(userId, strategy) {
  const c = await loadCounters(userId, strategy);
  const ratio = RATIOS[strategy] || RATIOS['Trend Follower'];

  // Position within current 10-trade cycle
  const posInCycle    = c.total   % 10;
  const winsInCycle   = c.wins    % 10;
  const lossesInCycle = c.losses  % 10;

  let outcome;

  if (lossesInCycle >= ratio.maxLossesIn10) {
    // Already hit max losses for this cycle — force a win
    outcome = 'win';
  } else if ((10 - posInCycle) <= (ratio.minProfitsIn10 - winsInCycle)) {
    // Remaining slots must all be wins to meet the minimum profit target
    outcome = 'win';
  } else {
    const winProbability = ratio.minProfitsIn10 / 10;
    outcome = Math.random() < winProbability ? 'win' : 'loss';
  }

  // Persist updated counters
  const updated = {
    wins:   c.wins   + (outcome === 'win'  ? 1 : 0),
    losses: c.losses + (outcome === 'loss' ? 1 : 0),
    total:  c.total  + 1,
  };
  await saveCounters(userId, strategy, updated);

  return outcome;
}

/**
 * Calculate the final PnL for a trade based on outcome decision.
 *
 * @param {object} trade  - The bot trade object (snake_case or camelCase fields)
 * @param {'win'|'loss'} outcome
 * @param {number|null} [adminTargetProfit]  - Admin-set profit amount (overrides for wins)
 * @returns {{ pnl: number, pnlPct: number, exitPrice: number }}
 */
function calculateFinalPnL(trade, outcome, adminTargetProfit = null) {
  const entryPrice = parseFloat(trade.entry_price || trade.entryPrice);
  const amount     = parseFloat(trade.amount);
  const side       = trade.side;

  let pnl, pnlPct, exitPrice;

  if (outcome === 'win') {
    if (adminTargetProfit && adminTargetProfit > 0) {
      pnl      = parseFloat(adminTargetProfit);
      pnlPct   = (pnl / (entryPrice * amount)) * 100;
      exitPrice = side === 'buy'
        ? entryPrice + (pnl / amount)
        : entryPrice - (pnl / amount);
    } else {
      pnlPct    = 0.5 + Math.random() * 3.5;
      pnl       = (entryPrice * amount * pnlPct) / 100;
      exitPrice = side === 'buy'
        ? entryPrice * (1 + pnlPct / 100)
        : entryPrice * (1 - pnlPct / 100);
    }
  } else {
    pnlPct    = -(0.3 + Math.random() * 2.2);
    pnl       = (entryPrice * amount * pnlPct) / 100;
    exitPrice = side === 'buy'
      ? entryPrice * (1 + pnlPct / 100)
      : entryPrice * (1 - pnlPct / 100);
  }

  return {
    pnl:       parseFloat(pnl.toFixed(2)),
    pnlPct:    parseFloat(pnlPct.toFixed(4)),
    exitPrice: parseFloat(exitPrice.toFixed(8)),
  };
}

/**
 * Reset counters for a user/strategy (e.g. on new bot session).
 */
async function resetCounters(userId, strategy) {
  await ensureTable();
  await pool.query(
    `INSERT INTO bot_strategy_counters (user_id, strategy, wins, losses, total)
     VALUES (?, ?, 0, 0, 0)
     ON DUPLICATE KEY UPDATE wins = 0, losses = 0, total = 0`,
    [userId, strategy]
  );
}

/**
 * Get current cycle stats for a user/strategy.
 */
async function getStats(userId, strategy) {
  return loadCounters(userId, strategy);
}

module.exports = { decideOutcome, calculateFinalPnL, resetCounters, getStats };
