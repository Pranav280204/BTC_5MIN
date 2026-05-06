const { Logger } = require('./logger');
const { PriceTracker } = require('./priceTracker');
const { PolymarketClient } = require('./polymarket');
const { TradeEngine } = require('./tradeEngine');
const { TelegramNotifier } = require('./notifier');

const n = (key, fallback) => {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const CONFIG = {
  TRIGGER_WINDOW_SECONDS: n('TRIGGER_WINDOW_SECONDS', 45),
  DEVIATION_MIN_POINTS: n('DEVIATION_MIN_POINTS', 10),
  DEVIATION_MAX_POINTS: n('DEVIATION_MAX_POINTS', 20),
  MIN_YES_PRICE: n('MIN_YES_PRICE', 30),
  MIN_NO_PRICE: n('MIN_NO_PRICE', 30),
  CONDITION_HOLD_MS: n('CONDITION_HOLD_MS', 1000),
  VIRTUAL_TRADE_AMOUNT: n('VIRTUAL_TRADE_AMOUNT', 10),
  MARKET_POLL_MS: n('MARKET_POLL_MS', 1000),
  SUMMARY_MS: n('SUMMARY_MS', 30_000),
};

async function main() {
  const log = new Logger();
  log.banner();

  const priceTracker = new PriceTracker();
  const polymarket = new PolymarketClient(log);
  const notifier = new TelegramNotifier({
    token: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
    enabled: process.env.TELEGRAM_ENABLED === '1' || process.env.TELEGRAM_ENABLED === 'true',
  }, log);
  const engine = new TradeEngine(CONFIG, log, notifier);

  let lastPriceLog = 0;
  const conditionSince = new Map();

  priceTracker.onPrice = (price, beatPrice) => {
    const now = Date.now();

    for (const market of polymarket.getMarkets()) {
      if (!beatPrice) continue;

      const drop = beatPrice - price;
      const rise = price - beatPrice;
      const secsLeft = market.secondsUntilClose();

      if (now - lastPriceLog >= 1000) {
        lastPriceLog = now;
        log.tick(price, beatPrice, drop, 100);
      }

      if (secsLeft < 0 || secsLeft > CONFIG.TRIGGER_WINDOW_SECONDS) continue;

      const yesCondition = drop >= CONFIG.DEVIATION_MIN_POINTS
        && drop <= CONFIG.DEVIATION_MAX_POINTS
        && market.yesPrice > CONFIG.MIN_YES_PRICE
        && market.canBuy('YES');

      const noCondition = rise >= CONFIG.DEVIATION_MIN_POINTS
        && rise <= CONFIG.DEVIATION_MAX_POINTS
        && market.noPrice > CONFIG.MIN_NO_PRICE
        && market.canBuy('NO');

      handleCondition('YES', yesCondition, market, now, drop, secsLeft, price);
      handleCondition('NO', noCondition, market, now, rise, secsLeft, price);
    }
  };

  function handleCondition(side, condition, market, now, deviation, secsLeft, price) {
    const key = `${market.slug}:${side}`;
    if (!condition) {
      conditionSince.delete(key);
      return;
    }

    if (!conditionSince.has(key)) {
      conditionSince.set(key, now);
      return;
    }

    const heldFor = now - conditionSince.get(key);
    if (heldFor < CONFIG.CONDITION_HOLD_MS) return;

    conditionSince.delete(key);
    if (side === 'YES') {
      log.warn(`TRIGGER ▼ DROP ${deviation.toFixed(1)}$ held ${heldFor}ms → BUY YES`);
    } else {
      log.warn(`TRIGGER ▲ RISE ${deviation.toFixed(1)}$ held ${heldFor}ms → BUY NO`);
    }
    engine.buy(side, market, deviation, secsLeft, price, market.priceToBeat);
  }

  let marketFetchInFlight = false;
  const refresh = async () => {
    if (marketFetchInFlight) return;
    marketFetchInFlight = true;
    try {
      await polymarket.fetchMarkets();
    } finally {
      marketFetchInFlight = false;
    }
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
