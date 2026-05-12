const express = require('express');
const router  = express.Router();

// ── In-memory cache (1 hour TTL) ─────────────────────────────
let cache = null;
let cacheTime = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// ── GET /exchange-rates?base=USD ──────────────────────────────
// Returns exchange rates relative to USD.
// Uses the free Open Exchange Rates API (no key needed for latest.json
// with the free tier) or falls back to a static table if the fetch fails.
router.get('/', async (req, res, next) => {
  try {
    const now = Date.now();

    // Serve from cache if still fresh
    if (cache && (now - cacheTime) < CACHE_TTL_MS) {
      return res.json({ success: true, base: 'USD', rates: cache, cached: true });
    }

    // Try fetching from a free public API (no API key required)
    // Using exchangerate-api.com open endpoint
    let rates = null;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(
        'https://open.er-api.com/v6/latest/USD',
        { signal: controller.signal }
      );
      clearTimeout(timeout);

      if (response.ok) {
        const data = await response.json();
        if (data?.rates) {
          rates = data.rates;
        }
      }
    } catch (fetchErr) {
      console.warn('[ExchangeRates] Fetch failed, using fallback rates:', fetchErr.message);
    }

    // Fallback static rates (approximate, updated periodically)
    // These are used only when the live fetch fails
    if (!rates) {
      rates = {
        USD: 1,       EUR: 0.92,    GBP: 0.79,    JPY: 149.5,   CNY: 7.24,
        INR: 83.1,    BRL: 4.97,    CAD: 1.36,    AUD: 1.53,    NZD: 1.63,
        CHF: 0.90,    SEK: 10.42,   NOK: 10.55,   DKK: 6.89,    HKD: 7.82,
        SGD: 1.34,    MXN: 17.15,   ZAR: 18.63,   NGN: 1580,    KES: 129.5,
        GHS: 12.1,    EGP: 30.9,    MAD: 10.05,   TZS: 2525,    UGX: 3750,
        RWF: 1285,    ETB: 56.5,    XOF: 603,     XAF: 603,     MZN: 63.9,
        ZMW: 26.5,    ZWL: 322,     NAD: 18.63,   BWP: 13.6,    MGA: 4500,
        SAR: 3.75,    AED: 3.67,    QAR: 3.64,    KWD: 0.307,   BHD: 0.376,
        OMR: 0.385,   JOD: 0.709,   LBP: 15000,   IQD: 1310,    IRR: 42000,
        ILS: 3.71,    TRY: 32.1,    RUB: 90.5,    UAH: 38.2,    KZT: 449,
        UZS: 12350,   AZN: 1.70,    GEL: 2.65,    AMD: 400,     PKR: 278,
        BDT: 110,     LKR: 325,     NPR: 133,     THB: 35.1,    VND: 24500,
        MYR: 4.72,    IDR: 15750,   PHP: 56.5,    TWD: 31.8,    KRW: 1330,
        PLN: 4.02,    CZK: 22.8,    HUF: 355,     RON: 4.57,    BGN: 1.80,
        HRK: 6.93,    RSD: 107,     ISK: 138,     DKK2: 6.89,   MKD: 56.7,
        ALL: 101,     BAM: 1.80,    MDL: 17.8,    BYN: 3.27,    UAH2: 38.2,
        GTQ: 7.83,    HNL: 24.7,    NIO: 36.6,    CRC: 527,     PAB: 1.0,
        DOP: 58.5,    HTG: 132,     JMD: 155,     TTD: 6.79,    BBD: 2.0,
        BZD: 2.02,    ARS: 870,     CLP: 950,     COP: 3950,    PEN: 3.72,
        BOB: 6.91,    PYG: 7350,    UYU: 39.2,    VES: 36.5,    GYD: 209,
        SRD: 36.5,    AWG: 1.79,    ANG: 1.79,    XCD: 2.70,    KYD: 0.833,
        BMD: 1.0,     BSD: 1.0,     FJD: 2.25,    PGK: 3.73,    SBD: 8.43,
        TOP: 2.37,    WST: 2.73,    VUV: 119,     MVR: 15.4,    BTN: 83.1,
        MMK: 2100,    KHR: 4100,    LAK: 20500,   MNT: 3450,    KPW: 900,
        SOS: 571,     SDG: 601,     LYD: 4.83,    TND: 3.12,    DZD: 135,
        MAD2: 10.05,  MRU: 39.5,    GMD: 67.5,    GNF: 8600,    SLL: 20900,
        LRD: 189,     SZL: 18.63,   LSL: 18.63,   MWK: 1685,    ZMW2: 26.5,
        AOA: 830,     CDF: 2750,    BIF: 2870,    KMF: 452,     DJF: 178,
        ERN: 15.0,    SCR: 13.5,    MUR: 45.2,    STN: 22.8,    CVE: 101,
      };
    }

    // Update cache
    cache = rates;
    cacheTime = now;

    return res.json({ success: true, base: 'USD', rates, cached: false });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
