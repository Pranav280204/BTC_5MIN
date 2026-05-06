/**
 * PolymarketClient — 5-minute BTC Up/Down markets
 *
 * KEY INSIGHT: These markets have DETERMINISTIC slugs based on the clock.
 * slug = `btc-updown-5m-{window_start_unix}`
 * where window_start_unix = Math.floor(Date.now()/1000 / 300) * 300
 *
 * So we never need to search — we compute the slug and fetch it directly.
 * We always track the CURRENT window and the NEXT window (pre-load).
 */

const https = require('https');

function get(url, depth = 0) {
  return new Promise((resolve, reject) => {
    if (depth > 5) return reject(new Error('Too many redirects'));
    const req = https.get(url, {
      headers: { 'User-Agent': 'polymarket-btc-bot/1.0', 'Accept': 'application/json' }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(get(res.headers.location, depth + 1));
      }
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        if (res.statusCode !== 200)
          return reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 150)}`));
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error(`JSON error: ${body.slice(0, 80)}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('Timeout')));
  });
}

// ── Market model ──────────────────────────────────────────────────────────────
class Market {
  constructor({ slug, windowTs, closeTs, upTokenId, downTokenId, upPrice, downPrice, priceToBeat = null }) {
    this.slug        = slug;
    this.windowTs    = windowTs;      // unix seconds — window open
    this.closeTs     = closeTs;       // unix seconds — window close
    this.upTokenId   = upTokenId;     // CLOB token for UP (YES equivalent)
    this.downTokenId = downTokenId;   // CLOB token for DOWN (NO equivalent)
    this.yesPrice    = upPrice;       // cents (0–100) for UP
    this.noPrice     = downPrice;     // cents (0–100) for DOWN
    this._boughtYes  = false;
    this._boughtNo   = false;
  }

  get question() { return `BTC Up or Down? (5m window ending ${new Date(this.closeTs * 1000).toLocaleTimeString()})`; }

  secondsUntilClose() {
    return Math.max(-1, this.closeTs - Math.floor(Date.now() / 1000));
  }

  markBought(side) {
    if (side === 'YES') this._boughtYes = true;
    else                this._boughtNo  = true;
  }
  canBuy(side) {
    return side === 'YES' ? !this._boughtYes : !this._boughtNo;
  }

  summary() {
    const secs = this.secondsUntilClose();
    const t = secs < 0 ? 'CLOSED' : secs < 60 ? `${secs}s left` : `${Math.floor(secs/60)}m ${secs%60}s left`;
    const beat = this.priceToBeat ? ` | beat=$${this.priceToBeat.toFixed(0)}` : '';
    return `[${t}] UP=${this.yesPrice.toFixed(1)}¢ DOWN=${this.noPrice.toFixed(1)}¢${beat} | ${this.slug}`;
  }
}


// ── Parse a Gamma events response into a Market ───────────────────────────────
function parseGammaEvent(eventData, windowTs) {
  // events endpoint returns an array; take first match
  const event = Array.isArray(eventData) ? eventData[0] : eventData;
  if (!event) return null;

  // Markets inside the event: find Up and Down
  const markets = event.markets || [];
  if (!markets.length) return null;

  let upMarket   = markets.find(m => /up/i.test(m.groupItemTitle || m.question || ''));
  let downMarket = markets.find(m => /down/i.test(m.groupItemTitle || m.question || ''));

  // Fallback: Polymarket returns markets[0]=Up, markets[1]=Down
  if (!upMarket)   upMarket   = markets[0];
  if (!downMarket) downMarket = markets[1];
  if (!upMarket || !downMarket) return null;

  // Token IDs — clobTokenIds is a JSON string like '["0xABC","0xDEF"]'
  function tokenId(m) {
    try {
      const ids = typeof m.clobTokenIds === 'string' ? JSON.parse(m.clobTokenIds) : m.clobTokenIds;
      return ids?.[0] || null;
    } catch { return null; }
  }

  // Prices — outcomePrices is '["0.72","0.28"]', index 0 = YES/Up
  function price(m) {
    try {
      const p = typeof m.outcomePrices === 'string' ? JSON.parse(m.outcomePrices) : m.outcomePrices;
      return parseFloat(p?.[0] || '0.5') * 100;
    } catch { return 50; }
  }

  const closeTs = windowTs + 300;

  return new Market({
    slug:        event.slug || `btc-updown-5m-${windowTs}`,
    windowTs,
    closeTs,
    upTokenId:   tokenId(upMarket),
    downTokenId: tokenId(downMarket),
    upPrice:     price(upMarket),
    downPrice:   price(downMarket),
  });
}

// ── Client ────────────────────────────────────────────────────────────────────
class PolymarketClient {
  constructor(log) {
    this.log     = log;
    this.markets = [];          // currently active Market objects
    this._cache  = new Map();   // slug → Market (avoid re-fetching)
  }

  getMarkets() { return this.markets; }

  /** Call this on a regular interval (e.g. every 10s) */
  async fetchMarkets() {
    const nowSec     = Math.floor(Date.now() / 1000);
    const windowTs   = nowSec - (nowSec % 300);       // current window start
    const nextWinTs  = windowTs + 300;                 // next window start

    const active = [];

    for (const ts of [windowTs, nextWinTs]) {
      const slug = `btc-updown-5m-${ts}`;
      try {
        let market = this._cache.get(slug);

        if (!market) {
          // Fetch from Gamma events endpoint using exact slug
          const url  = `https://gamma-api.polymarket.com/events?slug=${slug}`;
          const data = await get(url);
          market = parseGammaEvent(data, ts);

          if (market) {
            // Enrich with live CLOB prices
            await this._enrichClobPrice(market);
            await this._enrichPriceToBeat(market);
            this._cache.set(slug, market);
            this.log.success(`Found market: ${market.summary()}`);
          } else {
            this.log.warn(`Market not found yet: ${slug}`);
          }
        } else {
          // Refresh prices on cached market
          await this._enrichClobPrice(market);
          await this._enrichPriceToBeat(market);
        }

        if (market) {
          const secs = market.secondsUntilClose();
          if (secs > -30 && secs < 330) {   // include current & upcoming
            active.push(market);
          } else if (secs <= -30) {
            this._cache.delete(slug);        // evict closed markets
          }
        }
      } catch (err) {
        this.log.warn(`fetchMarkets [${slug}]: ${err.message}`);
      }
    }

    this.markets = active;

    if (active.length) {
      this.log.info(`Active 5-min BTC markets: ${active.length}`);
      active.forEach(m => this.log.info('  > ' + m.summary()));
    } else {
      // Compute countdown to next window open
      const secsToNext = 300 - (nowSec % 300);
      this.log.info(`No active 5m BTC markets. Next window opens in ${secsToNext}s (${new Date((nowSec + secsToNext) * 1000).toLocaleTimeString()})`);
    }
  }

  async _enrichClobPrice(market) {
    const fetchBestAskCents = async (tokenId) => {
      if (!tokenId) return null;
      try {
        const url = `https://clob.polymarket.com/book?token_id=${encodeURIComponent(tokenId)}`;
        const book = await get(url);
        const bestAsk = book?.asks?.[0]?.price;
        const ask = Number(bestAsk);
        return Number.isFinite(ask) ? ask * 100 : null;
      } catch {
        return null;
      }
    };

    const [upAsk, downAsk] = await Promise.all([
      fetchBestAskCents(market.upTokenId),
      fetchBestAskCents(market.downTokenId),
    ]);

    if (upAsk !== null) market.yesPrice = upAsk;
    if (downAsk !== null) market.noPrice = downAsk;
  }


  async _enrichPriceToBeat(market) {
    // Recover the "price to beat" strike from event/market text.
    // Example strings usually include values like "$103,450".
    const candidates = [market?.question, market?.slug];
    for (const text of candidates) {
      const strike = this._extractUsdNumber(text);
      if (Number.isFinite(strike)) {
        market.priceToBeat = strike;
        return;
      }
    }

    // Fallback: fetch event details and parse strike from title/question text.
    try {
      const url = `https://gamma-api.polymarket.com/events?slug=${encodeURIComponent(market.slug)}`;
      const data = await get(url);
      const event = Array.isArray(data) ? data[0] : data;
      const texts = [
        event?.title,
        event?.question,
        ...(event?.markets || []).flatMap((m) => [m?.question, m?.groupItemTitle]),
      ];
      for (const text of texts) {
        const strike = this._extractUsdNumber(text);
        if (Number.isFinite(strike)) {
          market.priceToBeat = strike;
          return;
        }
      }
    } catch {
      // Leave as null; strategy will skip until strike is available.
    }
  }

  _extractUsdNumber(text) {
    if (!text || typeof text !== 'string') return null;
    const match = text.match(/\$\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)/);
    if (!match) return null;
    const n = Number(match[1].replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }

}

module.exports = { PolymarketClient, Market };
