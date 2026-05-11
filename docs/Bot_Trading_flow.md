Let me explore the codebase to understand the full bot trading flow.

Let me explore the full structure first, then batch-read all relevant files.

Now I have the full picture. Let me batch-read all bot-related files in parallel.

There's a backend and an admin panel. Let me read those too.

I now have a comprehensive picture of the entire bot trading flow. Let me compile the final response.

Here's the full end-to-end bot trading flow as it exists in the codebase:

---

## Bot Trading Flow — End to End

### Architecture at a glance

```
User Browser (charles-schwab)
  └── BotEngine singleton (src/engine/botEngine.ts)
        ├── useAlgorithmEngine hook (React bridge)
        ├── AlgoBotPanel component
        └── REST API calls → Backend

Admin Browser (schwab-admin)
  └── BotTrades page + UserDetail page
        └── botTradeService → REST API → Backend

Backend (schwab-dackend)
  ├── /botTrades routes
  ├── /botSettings routes
  ├── tradeAutoClose service (in-memory timers)
  └── strategyOutcomeService (win/loss ratio control)
```

---

### Admin Side

**BotTrades page** (`/admin/bot-trades`):
- Polls `GET /botTrades/admin/active` every 10s — sees all open trades across all users
- Shows: user name/email, strategy, pair, timeframe, side, entry price, amount, expected P&L, live countdown timer
- **Execute Trade** button → modal → `POST /botTrades/admin/execute` — admin force-opens a trade for any user, picking pair, side, entry price, amount, strategy, timeframe, optional expected profit + duration
- **Edit** button → modal → `PATCH /botTrades/admin/:id/profit` — overrides expected profit amount and duration in seconds, which reschedules the backend auto-close timer
- **Close** button → `POST /botTrades/admin/:id/force-close` — immediately triggers the close logic

**UserDetail page** (`/admin/users/:id`) — "Bot Trading" tab:
- Shows the user's `botSettings` (strategy, risk level, timeframe, confidence threshold, active/inactive, admin-controlled flag)
- Shows all active bot trades for that user with Edit/Close controls
- Balance adjustment (credit/debit) directly affects bot position sizing

---

### User Side

**Two entry points for the bot:**

**Dashboard** (`/user/dashboard`):
- Renders `AlgoBotPanel` in the left column
- Simplified settings modal: strategy, risk level, timeframe, pair

**Exchange page** (`/user/exchange`):
- Full trading terminal with TradingView chart, order book, recent trades
- `AlgoBotPanel` in the right panel
- Full settings modal: adds confidence threshold, take profit %, stop loss %, max open trades, daily profit target, trailing stop, auto-reinvest toggle

**AlgoBotPanel** shows when running:
- Green "AI Analysis Running" banner + elapsed timer
- Rotating scan status messages
- Latest signal badge (BUY/SELL/HOLD) with confidence % and reason
- RSI, MACD, EMA indicator row
- Today's performance: PnL, trades executed, win rate
- Cumulative PnL sparkline
- Open position card with unrealized PnL + "View in Positions" link
- Recent closed trades log
- Stop Bot (locked if open trade exists) + Settings buttons

**Positions page** (`/user/positions`):
- Merges bot trades + user holdings into one table
- Bot open trades show simulated fluctuating P&L
- Time Left countdown column (from `remainingSeconds` returned by backend)
- Close button patches the trade to `status: closed`

**History page** (`/user/history`):
- Merges manual trade history + bot trades
- Open bot trades show as "Processing" with robot icon
- Tabs: All / Bot Trades / User Trades

---

### Backend Logic

**Trade creation** (`POST /botTrades`):
1. Inserts row into `bot_trades`
2. Calls `scheduleAutoClose(trade, duration, targetProfit)`
3. Sends user + admin notifications
4. Emits `botTrade:opened` via Socket.io to admin room

**Auto-close timer** (`tradeAutoClose.js`):
- Duration from timeframe if no admin override: 1m → 60–300s, 1h → 900–1800s, 1d → 3600–10800s
- On fire: calls `decideOutcome()` → `calculateFinalPnL()` → updates DB → credits user balance → sends notifications → emits `botTrade:closed`

**Win/loss ratios** (`strategyOutcomeService.js`) — enforced per user per strategy in 10-trade cycles:
- AI Scalper Pro: max 1 loss per 10 (≥80% win rate)
- Trend Follower / DCA Strategy: max 3 losses (≥70%)
- Mean Reversion: max 4 losses (≥60%)
- Grid Bot: max 5 losses (50/50)
- Admin `expectedProfit` overrides the profit amount for wins

**Server restart recovery**: `restoreOpenTrades()` recalculates remaining time from `opened_at + trade_duration_seconds` and reschedules timers on startup.

---

### Full Data Flow

```
User clicks "Start Algorithm"
  → BotEngine.start() → PATCH /botSettings (running: true)
  → Signal generated client-side (RSI, MACD, EMA, BB)
  → POST /botTrades → DB insert + auto-close timer scheduled
  → Admin sees trade in BotTrades page (10s poll)
  → Admin can edit profit/duration → timer rescheduled
  → Timer fires → decideOutcome() → calculateFinalPnL()
  → DB: trade closed, user balance credited
  → Socket.io: botTrade:closed → user + admin notified
  → User sees closed trade in Positions (15s poll) + History
  → AuthContext 15s poll picks up updated balance
```

The signal generation (RSI, MACD, EMA, Bollinger Bands) all happens client-side in `botEngine.ts`. The backend's job is persistence, timing, outcome control, and balance updates. The admin controls the outcome by setting `expectedProfit` and `tradeDurationSeconds` on any open trade.