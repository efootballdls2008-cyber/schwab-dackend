const express = require('express');
const https = require('https');

const router = express.Router();

// ── In-memory cache ───────────────────────────────────────────────────────────
// Caches Binance responses per symbol for TICKER_CACHE_TTL_MS milliseconds.
// This prevents every connected client from hammering Binance on each poll.
const TICKER_CACHE_TTL_MS = 8_000; // 8 seconds — frontend polls every 15s
const tickerCache = new Map(); // symbol → { data, status, expiresAt }

// In-flight request deduplication: if two requests arrive for the same symbol
// while a Binance fetch is already in progress, they share the same promise.
const inFlight = new Map(); // symbol → Promise<{data, status}>

function fetchFromBinance(symbol) {
  // Return existing in-flight promise if one is already running for this symbol
  if (inFlight.has(symbol)) {
    return inFlight.get(symbol);
  }

  const promise = new Promise((resolve, reject) => {
    const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`;
    https.get(url, (binanceRes) => {
      let data = '';
      binanceRes.on('data', (chunk) => { data += chunk; });
      binanceRes.on('end', () => {
        resolve({ data, status: binanceRes.statusCode });
      });
    }).on('error', (err) => {
      reject(err);
    });
  });

  // Store the promise, then clean up after it settles (success or error)
  inFlight.set(symbol, promise);
  promise.then(
    () => inFlight.delete(symbol),
    () => inFlight.delete(symbol),
  );

  return promise;
}

// No auth required — ticker data is public market info.
// This proxy avoids CORS and geo-restrictions when the frontend
// calls Binance directly from the browser.

/**
 * GET /ticker/:symbol
 * Proxies Binance 24hr ticker for a given symbol (e.g. BTCUSDT).
 * Responses are cached for 8 seconds to reduce upstream API calls.
 */
router.get('/:symbol', async (req, res, next) => {
  try {
    const symbol = req.params.symbol.toUpperCase();

    // Basic validation — only allow alphanumeric trading pairs
    if (!/^[A-Z0-9]{2,20}$/.test(symbol)) {
      return res.status(400).json({ success: false, message: 'Invalid symbol' });
    }

    // Serve from cache if still fresh
    const cached = tickerCache.get(symbol);
    if (cached && Date.now() < cached.expiresAt) {
      return res
        .status(cached.status)
        .set('Content-Type', 'application/json')
        .set('X-Cache', 'HIT')
        .send(cached.data);
    }

    // Fetch from Binance (deduplicated across concurrent requests)
    const { data, status } = await fetchFromBinance(symbol);

    // Cache successful responses only
    if (status === 200) {
      tickerCache.set(symbol, { data, status, expiresAt: Date.now() + TICKER_CACHE_TTL_MS });
    }

    res
      .status(status)
      .set('Content-Type', 'application/json')
      .set('X-Cache', 'MISS')
      .send(data);
  } catch (err) {
    // Handle network errors gracefully
    if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
      console.error('[Ticker API] Network error:', err.message);
      
      // Try to serve stale cache if available
      const staleCache = tickerCache.get(req.params.symbol.toUpperCase());
      if (staleCache) {
        return res
          .status(200)
          .set('Content-Type', 'application/json')
          .set('X-Cache', 'STALE')
          .send(staleCache.data);
      }
      
      // No cache available, return error
      return res.status(503).json({ 
        success: false, 
        message: 'Market data temporarily unavailable. Please try again later.' 
      });
    }
    next(err);
  }
});

module.exports = router;
