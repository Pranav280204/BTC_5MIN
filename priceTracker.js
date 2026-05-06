const WebSocket = require('ws');

const RTDS_URL = 'wss://ws-live-data.polymarket.com';

class PriceTracker {
  constructor(windowSeconds = 300) {
    this.windowSeconds = windowSeconds;
    this._currentPrice = 0;
    this._priceToBeat = 0;
    this._windowStart = 0;
    this._ws = null;
    this._pingInterval = null;
    this.onPrice = null; // callback(currentPrice, priceToBeat)
  }

  _updateWindowPriceToBeat(chainlinkPrice, nowSec) {
    const windowStart = nowSec - (nowSec % this.windowSeconds);
    if (windowStart !== this._windowStart) {
      this._windowStart = windowStart;
      this._priceToBeat = chainlinkPrice;
    }
  }

  connect(log) {
    log.info('Connecting to Polymarket RTDS (Chainlink oracle feed)…');
    const ws = new WebSocket(RTDS_URL);
    this._ws = ws;

    ws.on('open', () => {
      log.success('Polymarket RTDS connected');
      ws.send(JSON.stringify({
        action: 'subscribe',
        subscriptions: [{ topic: 'crypto_prices_chainlink', type: '*', filters: '{"symbol":"btc/usd"}' }],
      }));

      this._pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send('PING');
      }, 5000);
    });

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }

      if (msg.topic !== 'crypto_prices_chainlink' || !msg.payload?.value) return;

      const nowSec = Math.floor(Date.now() / 1000);
      const chainlinkPrice = parseFloat(msg.payload.value);
      this._updateWindowPriceToBeat(chainlinkPrice, nowSec);
      this._currentPrice = chainlinkPrice;

      if (this.onPrice) this.onPrice(this._currentPrice, this._priceToBeat);
    });

    ws.on('error', (err) => log.error('RTDS: ' + err.message));
    ws.on('close', () => {
      clearInterval(this._pingInterval);
      log.warn('RTDS closed — reconnecting in 5s…');
      setTimeout(() => this.connect(log), 5000);
    });
  }

  current() { return this._currentPrice; }
  priceToBeat() { return this._priceToBeat; }
}

module.exports = { PriceTracker };
