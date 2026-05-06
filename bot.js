// In main():
priceTracker.onPrice = (price, beatPrice) => {
  const drop = beatPrice - price;
  const rise = price - beatPrice;

  const now = Date.now();
  if (now - lastPriceLog >= 5000) {
    lastPriceLog = now;
    log.tick(price, beatPrice, drop, 100);
  }

  for (const market of polymarket.getMarkets()) {
    const secsLeft = market.secondsUntilClose();
    if (secsLeft < 0 || secsLeft > CONFIG.TRIGGER_WINDOW_SECONDS) continue;

    if (drop >= CONFIG.PRICE_DEVIATION_POINTS && market.yesPrice > CONFIG.MIN_YES_PRICE) {
      if (market.canBuy('YES')) {
        log.warn(`TRIGGER ▼ DROP ${drop.toFixed(0)}$ → BUY UP`);
        engine.buy('YES', market, drop, secsLeft, price, beatPrice);
      }
    }
    if (rise >= CONFIG.PRICE_DEVIATION_POINTS && market.noPrice > CONFIG.MIN_NO_PRICE) {
      if (market.canBuy('NO')) {
        log.warn(`TRIGGER ▲ RISE ${rise.toFixed(0)}$ → BUY DOWN`);
        engine.buy('NO', market, rise, secsLeft, price, beatPrice);
      }
    }
  }
};

priceTracker.connect(log);  // replaces connectBinance()