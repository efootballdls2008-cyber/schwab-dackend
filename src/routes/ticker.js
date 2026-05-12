const express = require('express');
const https = require('https');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

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

// ── Static fallback prices (used when Binance is geo-blocked on the server) ──
// These are approximate values — the frontend will show them as "offline" prices
// until a live feed is available. Update periodically if needed.
const FALLBACK_PRICES = {
  BTCUSDT:  { lastPrice: '81680.00', priceChangePercent: '1.25',  volume: '28500.123' },
  ETHUSDT:  { lastPrice: '3520.00',  priceChangePercent: '2.10',  volume: '185000.456' },
  SOLUSDT:  { lastPrice: '178.50',   priceChangePercent: '-0.85', volume: '4200000.789' },
  BNBUSDT:  { lastPrice: '608.00',   priceChangePercent: '0.55',  volume: '1250000.321' },
  XRPUSDT:  { lastPrice: '0.5820',   priceChangePercent: '1.80',  volume: '95000000.654' },
  ADAUSDT:  { lastPrice: '0.4510',   priceChangePercent: '-1.20', volume: '75000000.987' },
  MATICUSDT:{ lastPrice: '0.8920',   priceChangePercent: '3.40',  volume: '55000000.123' },
  LINKUSDT: { lastPrice: '18.75',    priceChangePercent: '2.90',  volume: '8500000.456' },
  AVAXUSDT: { lastPrice: '38.20',    priceChangePercent: '-0.60', volume: '3200000.789' },
  DOTUSDT:  { lastPrice: '7.85',     priceChangePercent: '1.10',  volume: '12000000.321' },
};

function buildFallbackResponse(symbol) {
  const base = FALLBACK_PRICES[symbol];
  if (!base) return null;
  return JSON.stringify({
    symbol,
    lastPrice: base.lastPrice,
    priceChange: '0.00',
    priceChangePercent: base.priceChangePercent,
    highPrice: base.lastPrice,
    lowPrice: base.lastPrice,
    volume: base.volume,
    quoteVolume: base.volume,
    openPrice: base.lastPrice,
    prevClosePrice: base.lastPrice,
    count: 0,
    _fallback: true,
  });
}


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

    // If Binance is geo-blocked (451) or unavailable, serve fallback
    if (status !== 200) {
      const staleCache = tickerCache.get(symbol);
      if (staleCache) {
        return res.status(200).set('Content-Type', 'application/json').set('X-Cache', 'STALE').send(staleCache.data);
      }
      const fallback = buildFallbackResponse(symbol);
      if (fallback) {
        return res.status(200).set('Content-Type', 'application/json').set('X-Cache', 'FALLBACK').send(fallback);
      }
      return res.status(status).set('Content-Type', 'application/json').send(data);
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
      
      // Try stale cache first
      const staleCache = tickerCache.get(req.params.symbol.toUpperCase());
      if (staleCache) {
        return res.status(200).set('Content-Type', 'application/json').set('X-Cache', 'STALE').send(staleCache.data);
      }
      // Then try static fallback
      const fallback = buildFallbackResponse(req.params.symbol.toUpperCase());
      if (fallback) {
        return res.status(200).set('Content-Type', 'application/json').set('X-Cache', 'FALLBACK').send(fallback);
      }
      return res.status(503).json({ success: false, message: 'Market data temporarily unavailable.' });
    }
    next(err);
  }
});

module.exports = router;
