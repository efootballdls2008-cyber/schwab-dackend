/**
 * Central error handler — always returns JSON.
 * Always logs errors regardless of environment so production issues are visible.
 * Stack traces are only included in the response body in non-production.
 */
function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  // Always log — use stderr so it's captured by process managers and log aggregators.
  // Never suppress production errors; just don't expose the stack in the response.
  console.error(`[ERROR] ${req.method} ${req.path} → ${status}:`, err);

  res.status(status).json({
    success: false,
    message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
}

module.exports = errorHandler;
