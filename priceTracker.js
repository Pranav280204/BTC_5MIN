const WebSocket = require('ws');

const RTDS_URL = 'wss://ws-live-data.polymarket.com';

class PriceTracker {
  constructor() {
    this._currentPrice = 0;
    this._ws = null;
    this._pingInterval = null;
    this.onPrice = null;
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
      if (msg.topic !== 'crypto_prices_chainlink') return;
      if (!msg.payload?.value) return;

      this._currentPrice = parseFloat(msg.payload.value);
      if (this.onPrice) this.onPrice(this._currentPrice);
    });

    ws.on('error', (err) => log.error('RTDS: ' + err.message));
    ws.on('close', () => {
      clearInterval(this._pingInterval);
      log.warn('RTDS closed — reconnecting in 5s…');
      setTimeout(() => this.connect(log), 5000);
    });
  }

  current() {
    return this._currentPrice;
  }
}

module.exports = { PriceTracker };
