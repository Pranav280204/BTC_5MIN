// priceTracker.js — NEW: gets both prices from Polymarket RTDS

const WebSocket = require('ws');

const RTDS_URL = 'wss://ws-live-data.polymarket.com';

class PriceTracker {
  constructor(windowSeconds = 300) {
    this.windowMs     = windowSeconds * 1000;
    this._currentPrice = 0;
    this._priceToBeat  = 0;   // Chainlink snapshot at window open
    this._windowTs     = 0;   // when current window opened
    this._ws           = null;
    this._pingInterval = null;
    this.onPrice       = null; // callback(price, priceToBeat)
  }

  /** Chainlink price at window boundary = the real "price to beat" */
  _snapWindowOpen(chainlinkPrice, nowSec) {
    const windowTs = nowSec - (nowSec % 300);
    if (windowTs !== this._windowTs) {
      this._windowTs    = windowTs;
      this._priceToBeat = chainlinkPrice;  // first Chainlink tick of new window
      console.log(`[PriceTracker] New window @ ${new Date(windowTs*1000).toLocaleTimeString()} | Price to beat: $${chainlinkPrice}`);
    }
  }

  connect(log) {
    log.info('Connecting to Polymarket RTDS…');
    const ws = new WebSocket(RTDS_URL);
    this._ws = ws;

    ws.on('open', () => {
      log.success('Polymarket RTDS connected');

      // Subscribe to Binance BTC for real-time current price (fast ticks)
      ws.send(JSON.stringify({
        action: 'subscribe',
        subscriptions: [{ topic: 'crypto_prices', type: '*', filters: '{"symbol":"btcusdt"}' }]
      }));

      // Subscribe to Chainlink BTC for the oracle price (= price to beat)
      ws.send(JSON.stringify({
        action: 'subscribe',
        subscriptions: [{ topic: 'crypto_prices_chainlink', type: '*', filters: '{"symbol":"btc/usd"}' }]
      }));

      // RTDS requires PING every 5s
      this._pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send('PING');
      }, 5000);
    });

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw);
      if (!msg.payload?.value) return;

      const price  = parseFloat(msg.payload.value);
      const nowSec = Math.floor(Date.now() / 1000);

      if (msg.topic === 'crypto_prices') {
        // Binance tick → current live price
        this._currentPrice = price;
      } else if (msg.topic === 'crypto_prices_chainlink') {
        // Chainlink tick → snap window-open price, also use as live price
        this._snapWindowOpen(price, nowSec);
        this._currentPrice = price;
      }

      if (this.onPrice) this.onPrice(this._currentPrice, this._priceToBeat);
    });

    ws.on('error', (err) => log.error('RTDS: ' + err.message));
    ws.on('close', () => {
      clearInterval(this._pingInterval);
      log.warn('RTDS closed — reconnecting in 5s…');
      setTimeout(() => this.connect(log), 5000);
    });
  }

  current()    { return this._currentPrice; }
  beatPrice()  { return this._priceToBeat; }
  fillPct()    { return 100; }  // not needed with direct feed

  // Keep push() for compatibility but it's no longer the primary path
  push() {}
}

module.exports = { PriceTracker };