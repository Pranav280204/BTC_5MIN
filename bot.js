const { Logger } = require('./logger');
const { PriceTracker } = require('./priceTracker');
const { PolymarketClient } = require('./polymarket');
const { TradeEngine } = require('./tradeEngine');

const n = (key, fallback) => {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const CONFIG = {
  TRIGGER_WINDOW_SECONDS: n('TRIGGER_WINDOW_SECONDS', 45),
  PRICE_DEVIATION_POINTS: n('PRICE_DEVIATION_POINTS', 30),
  MIN_YES_PRICE: n('MIN_YES_PRICE', 15),
  MIN_NO_PRICE: n('MIN_NO_PRICE', 15),
  VIRTUAL_TRADE_AMOUNT: n('VIRTUAL_TRADE_AMOUNT', 10),
  MARKET_POLL_MS: n('MARKET_POLL_MS', 10_000),
  SUMMARY_MS: n('SUMMARY_MS', 30_000),
};

async function main() {
  const log = new Logger();
  log.banner();

  const priceTracker = new PriceTracker();
  const polymarket = new PolymarketClient(log);
  const engine = new TradeEngine(CONFIG, log);

  let lastPriceLog = 0;

  priceTracker.onPrice = (price, beatPrice) => {
    const now = Date.now();

    for (const market of polymarket.getMarkets()) {
      if (!beatPrice) continue;

      const drop = beatPrice - price;
      const rise = price - beatPrice;
      const secsLeft = market.secondsUntilClose();

      if (now - lastPriceLog >= 5000) {
        lastPriceLog = now;
        log.tick(price, beatPrice, drop, 100);
      }

      if (secsLeft < 0 || secsLeft > CONFIG.TRIGGER_WINDOW_SECONDS) continue;

      if (drop >= CONFIG.PRICE_DEVIATION_POINTS && market.yesPrice > CONFIG.MIN_YES_PRICE && market.canBuy('YES')) {
        log.warn(`TRIGGER ▼ DROP ${drop.toFixed(0)}$ → BUY UP`);
        engine.buy('YES', market, drop, secsLeft, price, market.priceToBeat);
      }

      if (rise >= CONFIG.PRICE_DEVIATION_POINTS && market.noPrice > CONFIG.MIN_NO_PRICE && market.canBuy('NO')) {
        log.warn(`TRIGGER ▲ RISE ${rise.toFixed(0)}$ → BUY DOWN`);
        engine.buy('NO', market, rise, secsLeft, price, market.priceToBeat);
      }
    }
  };

  const refresh = async () => {
    await polymarket.fetchMarkets();
  };

  await refresh();
  const marketTimer = setInterval(refresh, CONFIG.MARKET_POLL_MS);
  const summaryTimer = setInterval(() => engine.printSummary(), CONFIG.SUMMARY_MS);

  const shutdown = (signal) => {
    log.warn(`Received ${signal}. Shutting down…`);
    clearInterval(marketTimer);
    clearInterval(summaryTimer);
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  priceTracker.connect(log);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
