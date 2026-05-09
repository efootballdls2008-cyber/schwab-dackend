const mysql = require('mysql2/promise');
require('dotenv').config();

// In production, required env vars must be explicitly set.
// Fail fast with a clear message rather than silently using insecure defaults.
if (process.env.NODE_ENV === 'production') {
  const required = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'JWT_SECRET'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`[DB] FATAL: Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
}

// In development, warn if DB_PASSWORD is empty. MySQL can be configured to
// allow empty passwords, which would let the pool connect silently with no
// credentials — a common misconfiguration that is easy to miss.
if (process.env.NODE_ENV !== 'production' && !process.env.DB_PASSWORD) {
  console.warn(
    '[DB] WARNING: DB_PASSWORD is not set. ' +
    'If your MySQL instance allows empty passwords this connection will succeed ' +
    'without credentials. Set DB_PASSWORD in your .env file to suppress this warning.'
  );
}

const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 3306,
  database: process.env.DB_NAME     || 'schwab_db',
  user:     process.env.DB_USER     || 'schwab_user',
  // No hardcoded password fallback — if DB_PASSWORD is unset in dev, the
  // connection will fail immediately with a clear auth error rather than
  // silently using a known default credential.
  password: process.env.DB_PASSWORD || '',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '+00:00',
});

pool.on('connection', () => {
  console.log('[DB] New connection established');
});

// Verify connectivity at startup so misconfiguration is caught immediately
pool.getConnection()
  .then((conn) => {
    conn.release();
    console.log('[DB] Connection pool ready');
  })
  .catch((err) => {
    console.error('[DB] FATAL: Could not connect to database:', err.message);
    if (process.env.NODE_ENV === 'production') process.exit(1);
  });

module.exports = pool;
