require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const errorHandler = require('./middleware/errorHandler');
const { buildNotificationRoutes } = require('./routes/notifications');

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

// ── Logging ──────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// ── Rate limiting ────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});
app.use(limiter);

// Stricter limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many auth attempts, please try again later.' },
});

// ── Health check ─────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() });
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
app.use('/notifications',     buildNotificationRoutes('notifications'));
app.use('/userNotifications', buildNotificationRoutes('user_notifications'));

// ── 404 handler ──────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found` });
});

// ── Central error handler ────────────────────────────────────
app.use(errorHandler);

// ── Start ────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT) || 3001;
app.listen(PORT, () => {
  console.log(`[server] Running on http://localhost:${PORT} (${process.env.NODE_ENV || 'development'})`);
});

module.exports = app;
