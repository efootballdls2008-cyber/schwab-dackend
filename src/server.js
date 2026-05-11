require('dotenv').config();
const http = require('http');
const express = require('express');
const pool = require('./db/pool');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { Server: SocketIOServer } = require('socket.io');
const jwt = require('jsonwebtoken');

const errorHandler = require('./middleware/errorHandler');
const camelCaseResponse = require('./middleware/camelCase');
const { isAdmin } = require('./middleware/auth');
const { buildNotificationRoutes, adminNotifRouter } = require('./routes/notifications');
const notificationSettingsRoutes = require('./routes/notificationSettings');
const socketService = require('./socket/socketService');

// ── Route imports ────────────────────────────────────────────
const authRoutes            = require('./routes/auth');
const userRoutes            = require('./routes/users');
const walletRoutes          = require('./routes/wallets');
const orderRoutes           = require('./routes/orders');
const transactionRoutes     = require('./routes/transactions');
const tradeHistoryRoutes    = require('./routes/tradeHistory');
const botTradeRoutes        = require('./routes/botTrades');
const botSettingsRoutes     = require('./routes/botSettings');
const marketStatsRoutes     = require('./routes/marketStats');
const depositRoutes         = require('./routes/deposits');
const holdingRoutes         = require('./routes/holdings');
const profitOverviewRoutes  = require('./routes/profitOverview');
const purchaseRoutes        = require('./routes/purchases');
const platformSettingsRoutes = require('./routes/platformSettings');
const platformAccountRoutes = require('./routes/platformAccounts');
const adminActionRoutes     = require('./routes/adminActions');
const kycRoutes             = require('./routes/kyc');
const tickerRoutes          = require('./routes/ticker');
const { restoreOpenTrades } = require('./services/tradeAutoClose');

const app = express();

// ── Security & parsing ───────────────────────────────────────
app.use(helmet());

// CORS configuration
const corsOrigin = process.env.CORS_ORIGIN || '*';
const allowedOrigins = corsOrigin === '*' ? '*' : corsOrigin.split(',').map(o => o.trim());

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Static uploads ───────────────────────────────────────────
const uploadsPath = require('path').join(__dirname, '../uploads');
app.use('/uploads', express.static(uploadsPath));

// ── camelCase response transformer ───────────────────────────
app.use(camelCaseResponse);

// ── Logging ──────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// ── Rate limiting ────────────────────────────────────────────

// General limiter — raised to 500 req/15min to handle dashboard polling
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 500,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for verified admin tokens only.
    // jwt.verify() checks the signature — jwt.decode() does NOT and must never be used here.
    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (isAdmin(decoded)) return true;
      } catch { /* invalid or expired token — apply rate limiting */ }
    }
    return false;
  },
  message: { success: false, message: 'Too many requests, please try again later.' },
});

// Relaxed limiter for bot trading endpoints (high frequency updates)
const botLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Bot rate limit exceeded, please try again later.' },
});

// Relaxed limiter for ticker/market data endpoints (polled every 10s)
const tickerLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 60,             // 60 req/min per IP (1 per second headroom)
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Ticker rate limit exceeded, please slow down.' },
});

// Stricter limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many auth attempts, please try again later.' },
});

// Apply general rate limiting to all routes except bot/ticker endpoints
app.use((req, res, next) => {
  if (req.path.startsWith('/botTrades') || req.path.startsWith('/botSettings')) {
    return botLimiter(req, res, next);
  }
  if (req.path.startsWith('/ticker') || req.path.startsWith('/marketStats')) {
    return tickerLimiter(req, res, next);
  }
  return limiter(req, res, next);
});

// ── Health check ─────────────────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ success: true, status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ success: false, status: 'error', db: 'disconnected', timestamp: new Date().toISOString() });
  }
});

// ── Routes ───────────────────────────────────────────────────
app.use('/auth',              authLimiter, authRoutes);
app.use('/users',             userRoutes);
app.use('/wallets',           walletRoutes);
app.use('/orders',            orderRoutes);
app.use('/transactions',      transactionRoutes);
app.use('/tradeHistory',      tradeHistoryRoutes);
app.use('/botTrades',         botTradeRoutes);
app.use('/botSettings',       botSettingsRoutes);
app.use('/marketStats',       marketStatsRoutes);
app.use('/deposits',          depositRoutes);
app.use('/holdings',          holdingRoutes);
app.use('/profitOverview',    profitOverviewRoutes);
app.use('/purchases',         purchaseRoutes);
app.use('/platformSettings',  platformSettingsRoutes);
app.use('/platformAccounts',  platformAccountRoutes);
app.use('/adminActions',      adminActionRoutes);
app.use('/kyc',               kycRoutes);
app.use('/ticker',            tickerRoutes);
app.use('/notifications',        buildNotificationRoutes('user_notifications'));
app.use('/userNotifications',    buildNotificationRoutes('user_notifications'));
app.use('/adminNotifications',   adminNotifRouter);
app.use('/notificationSettings', notificationSettingsRoutes);

// ── 404 handler ──────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found` });
});

// ── Central error handler ────────────────────────────────────
app.use(errorHandler);

// ── HTTP + Socket.io server ───────────────────────────────────
const httpServer = http.createServer(app);

const corsOriginForSocket = process.env.CORS_ORIGIN || '*';
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: corsOriginForSocket === '*' ? '*' : corsOriginForSocket.split(',').map(o => o.trim()),
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// JWT auth middleware for socket connections
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('No token'));
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Store verified claims on socket.data — this object is server-controlled
    // and cannot be written by the client, unlike socket.handshake.auth.
    // socketService.js reads from socket.data to avoid trusting client-supplied values.
    socket.data.userId = decoded.id;
    socket.data.role   = decoded.role;
    // Also keep handshake fields for backwards compatibility with any legacy code
    socket.handshake.auth.userId  = decoded.id;
    socket.handshake.auth.adminId = decoded.id;
    socket.handshake.auth.role    = decoded.role;
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

socketService.init(io);

// ── Auto-migration on startup ─────────────────────────────────
// Runs idempotent CREATE TABLE IF NOT EXISTS + ALTER TABLE IF NOT EXISTS
// so new tables/columns are always present without a manual deploy step.
async function runMigrations() {
  const alterMigrations = [
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(100) UNIQUE DEFAULT NULL`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INT NOT NULL DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until DATETIME DEFAULT NULL`,
    `ALTER TABLE bot_trades ADD COLUMN IF NOT EXISTS final_pnl DECIMAL(20,8) DEFAULT NULL`,
    `ALTER TABLE bot_trades ADD COLUMN IF NOT EXISTS display_pnl DECIMAL(20,8) DEFAULT NULL`,
    `ALTER TABLE bot_trades ADD COLUMN IF NOT EXISTS expected_profit DECIMAL(20,8) DEFAULT NULL`,
    `ALTER TABLE bot_trades ADD COLUMN IF NOT EXISTS trade_duration_seconds INT DEFAULT NULL`,
    `ALTER TABLE bot_trades ADD COLUMN IF NOT EXISTS timeframe VARCHAR(20) DEFAULT '1h'`,
    `ALTER TABLE bot_trades ADD COLUMN IF NOT EXISTS close_reason VARCHAR(50) DEFAULT NULL`,
    `ALTER TABLE bot_settings ADD COLUMN IF NOT EXISTS confidence_threshold DECIMAL(5,2) NOT NULL DEFAULT 45.00`,
    `ALTER TABLE bot_settings ADD COLUMN IF NOT EXISTS trade_duration_seconds INT DEFAULT NULL`,
    `ALTER TABLE deposits ADD COLUMN IF NOT EXISTS rejection_reason TEXT DEFAULT NULL`,
    `ALTER TABLE purchases ADD COLUMN IF NOT EXISTS rejection_reason TEXT DEFAULT NULL`,
  ];

  const createMigrations = [
    `CREATE TABLE IF NOT EXISTS user_notifications (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      user_id       INT NOT NULL,
      title         VARCHAR(255) NOT NULL,
      message       TEXT NOT NULL,
      type          VARCHAR(50) DEFAULT 'info',
      category      VARCHAR(50) DEFAULT 'system_alerts',
      priority      ENUM('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
      is_read       TINYINT(1) NOT NULL DEFAULT 0,
      related_id    VARCHAR(100) DEFAULT NULL,
      related_type  VARCHAR(100) DEFAULT NULL,
      metadata      JSON DEFAULT NULL,
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS admin_notifications (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      title         VARCHAR(255) NOT NULL,
      message       TEXT NOT NULL,
      type          VARCHAR(50) DEFAULT 'info',
      priority      ENUM('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
      is_read       TINYINT(1) NOT NULL DEFAULT 0,
      related_id    VARCHAR(100) DEFAULT NULL,
      related_type  VARCHAR(100) DEFAULT NULL,
      user_id       INT DEFAULT NULL,
      metadata      JSON DEFAULT NULL,
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS notification_settings (
      id                  INT AUTO_INCREMENT PRIMARY KEY,
      user_id             INT NOT NULL UNIQUE,
      email_enabled       TINYINT(1) NOT NULL DEFAULT 1,
      in_app_enabled      TINYINT(1) NOT NULL DEFAULT 1,
      email_deposits      TINYINT(1) NOT NULL DEFAULT 1,
      email_withdrawals   TINYINT(1) NOT NULL DEFAULT 1,
      email_trades        TINYINT(1) NOT NULL DEFAULT 1,
      email_bot_activity  TINYINT(1) NOT NULL DEFAULT 1,
      email_profit_loss   TINYINT(1) NOT NULL DEFAULT 1,
      email_security      TINYINT(1) NOT NULL DEFAULT 1,
      email_system        TINYINT(1) NOT NULL DEFAULT 0,
      app_deposits        TINYINT(1) NOT NULL DEFAULT 1,
      app_withdrawals     TINYINT(1) NOT NULL DEFAULT 1,
      app_trades          TINYINT(1) NOT NULL DEFAULT 1,
      app_bot_activity    TINYINT(1) NOT NULL DEFAULT 1,
      app_profit_loss     TINYINT(1) NOT NULL DEFAULT 1,
      app_security        TINYINT(1) NOT NULL DEFAULT 1,
      app_system          TINYINT(1) NOT NULL DEFAULT 1,
      app_price_alerts    TINYINT(1) NOT NULL DEFAULT 1,
      created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS admin_notification_settings (
      id                  INT AUTO_INCREMENT PRIMARY KEY,
      admin_id            INT NOT NULL UNIQUE,
      email_enabled       TINYINT(1) NOT NULL DEFAULT 1,
      email_deposits      TINYINT(1) NOT NULL DEFAULT 1,
      email_withdrawals   TINYINT(1) NOT NULL DEFAULT 1,
      email_trades        TINYINT(1) NOT NULL DEFAULT 1,
      email_bot_activity  TINYINT(1) NOT NULL DEFAULT 0,
      email_suspicious    TINYINT(1) NOT NULL DEFAULT 1,
      email_failed_tx     TINYINT(1) NOT NULL DEFAULT 1,
      email_user_reg      TINYINT(1) NOT NULL DEFAULT 1,
      created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS bot_strategy_counters (
      user_id   INT          NOT NULL,
      strategy  VARCHAR(100) NOT NULL,
      wins      INT          NOT NULL DEFAULT 0,
      losses    INT          NOT NULL DEFAULT 0,
      total     INT          NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, strategy),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,

    // Email send log — required by emailService.logEmail()
    `CREATE TABLE IF NOT EXISTS email_logs (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      recipient     VARCHAR(255) NOT NULL,
      subject       VARCHAR(500) NOT NULL,
      status        ENUM('sent','failed') NOT NULL DEFAULT 'sent',
      message_id    VARCHAR(255) DEFAULT NULL,
      error_message TEXT DEFAULT NULL,
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,

    // Platform accounts — payment destinations for deposits/buys
    `CREATE TABLE IF NOT EXISTS platform_accounts (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      account_name    VARCHAR(255) NOT NULL,
      payment_method  ENUM('bank_transfer','credit_card','wire_transfer','crypto') NOT NULL DEFAULT 'bank_transfer',
      bank_name       VARCHAR(255) DEFAULT NULL,
      account_number  VARCHAR(100) DEFAULT NULL,
      routing_number  VARCHAR(100) DEFAULT NULL,
      account_type    VARCHAR(100) DEFAULT NULL,
      swift_code      VARCHAR(50) DEFAULT NULL,
      bank_address    VARCHAR(500) DEFAULT NULL,
      my_address      VARCHAR(500) DEFAULT NULL,
      wallet_address  VARCHAR(500) DEFAULT NULL,
      network         VARCHAR(100) DEFAULT NULL,
      is_default      TINYINT(1) NOT NULL DEFAULT 0,
      assigned_to     ENUM('deposit','buy_crypto','buy_stock','all') NOT NULL DEFAULT 'deposit',
      status          ENUM('active','inactive') NOT NULL DEFAULT 'active',
      created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  ];

  // MySQL does not support ADD COLUMN IF NOT EXISTS (MariaDB-only syntax).
  // We check INFORMATION_SCHEMA first and skip columns that already exist.
  const [[{ db: currentDb }]] = await pool.query('SELECT DATABASE() AS db');
  for (const sql of alterMigrations) {
    try {
      // Parse table and column name from: ALTER TABLE <tbl> ADD COLUMN IF NOT EXISTS <col> ...
      const match = sql.match(/ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i);
      if (match) {
        const [, tableName, columnName] = match;
        const [[existing]] = await pool.query(
          `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
          [currentDb, tableName, columnName]
        );
        if (existing) continue; // column already exists, skip
        // Rewrite to plain ADD COLUMN (strip the IF NOT EXISTS)
        const cleanSql = sql.replace(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+/i, 'ADD COLUMN ');
        await pool.query(cleanSql);
      } else {
        await pool.query(sql);
      }
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') {
        console.error('[migrate] ALTER error:', err.message);
      }
    }
  }
  for (const sql of createMigrations) {
    try {
      await pool.query(sql);
    } catch (err) {
      console.error('[migrate] CREATE error:', err.message);
    }
  }

  // ── Ensure admin account exists (hardcoded fallback) ─────────
  // Removed: hardcoded credentials are a security risk.
  // Admin seeding is handled exclusively by seedAdmin() below,
  // which reads credentials from environment variables.
  console.log('[migrate] Auto-migration complete.');
}

// ── Seed default admin account ────────────────────────────────
// Creates the admin account from env vars if no Admin user exists yet.
// Does NOT overwrite an existing admin's password on every restart —
// only sets it once when the admin row is first created.
async function seedAdmin() {
  const email    = (process.env.ADMIN_SEED_EMAIL    || 'admin@example.com').toLowerCase();
  const password =  process.env.ADMIN_SEED_PASSWORD;

  // Refuse to start if the password is missing or is the placeholder default
  const WEAK_PASSWORDS = new Set(['', 'change_me_before_deploying', 'temp', 'admin', 'password']);
  if (!password || WEAK_PASSWORDS.has(password)) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[seed] FATAL: ADMIN_SEED_PASSWORD is missing or insecure. Set a strong password in your environment variables.');
      process.exit(1);
    } else {
      console.warn('[seed] WARNING: ADMIN_SEED_PASSWORD is weak or missing. Set a strong password before deploying to production.');
    }
  }

  try {
    // Check if ANY admin already exists
    const [[existing]] = await pool.query(
      "SELECT id FROM users WHERE role = 'Admin' LIMIT 1"
    );

    if (existing) {
      // Admin already exists — do NOT overwrite their password on every restart.
      // Password changes should be done through the admin UI or a dedicated migration.
      console.log(`[seed] Admin account already exists (id=${existing.id}). Skipping seed.`);
      return;
    }

    // No admin at all — create one
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash(password, 12);
    const firstName = process.env.ADMIN_SEED_FIRST_NAME || 'Admin';
    const lastName  = process.env.ADMIN_SEED_LAST_NAME  || 'Schwab';

    await pool.query(
      `INSERT INTO users (email, password, first_name, last_name, role)
       VALUES (?, ?, ?, ?, 'Admin')`,
      [email, hash, firstName, lastName]
    );
    console.log(`[seed] Admin account created: ${email}`);
  } catch (err) {
    console.error('[seed] Failed to seed admin:', err.message);
  }
}

// ── Start ────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT) || 3001;
httpServer.listen(PORT, async () => {
  console.log(`[server] Running on http://localhost:${PORT} (${process.env.NODE_ENV || 'development'})`);
  // Run idempotent migrations to ensure all tables/columns exist
  await runMigrations().catch(err => console.error('[migrate] Fatal error:', err.message));
  // Seed default admin account if none exists
  await seedAdmin();
  // Restore auto-close timers for any open bot trades
  await restoreOpenTrades();
});

module.exports = app;
