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
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 100, // Increased from 20 to 100
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
app.use('/notifications',        buildNotificationRoutes('notifications'));
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
    socket.handshake.auth.adminId = decoded.id;
    socket.handshake.auth.role = decoded.role;
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

socketService.init(io);

// ── Start ────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT) || 3001;
httpServer.listen(PORT, async () => {
  console.log(`[server] Running on http://localhost:${PORT} (${process.env.NODE_ENV || 'development'})`);
  // Restore auto-close timers for any open bot trades
  await restoreOpenTrades();
});

module.exports = app;
