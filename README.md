# Polymarket BTC 5-Min Bot 🤖₿

This bot uses **only Polymarket-native data**:

- **RTDS WebSocket** (`wss://ws-live-data.polymarket.com`) for live BTC Chainlink oracle ticks.
- **Gamma + CLOB APIs** for market discovery and live YES/NO pricing.

No direct Binance feed and no BTC `price-to-beat` REST call are used.

## Local run

```bash
npm install
npm start
```

## Railway deployment

1. Push this repo to GitHub.
2. In Railway, create a new project from the repo.
3. Railway will auto-detect Node + `railway.json` and run `npm start`.
4. Optional environment variables:
   - `TRIGGER_WINDOW_SECONDS` (default `45`)
   - `PRICE_DEVIATION_POINTS` (default `30`)
   - `MIN_YES_PRICE` (default `15`)
   - `MIN_NO_PRICE` (default `15`)
   - `VIRTUAL_TRADE_AMOUNT` (default `10`)
   - `MARKET_POLL_MS` (default `10000`)
   - `SUMMARY_MS` (default `30000`)

## Strategy

For each active 5-minute BTC Up/Down market:

1. Read live BTC Chainlink oracle price from RTDS.
2. Set **Price to Beat** as the **first Chainlink tick in each 5-minute window** (`unixTime % 300 === 0` window boundary).
3. In the final `TRIGGER_WINDOW_SECONDS` before close:
   - Buy **YES** when `(priceToBeat - price) >= PRICE_DEVIATION_POINTS`
   - Buy **NO** when `(price - priceToBeat) >= PRICE_DEVIATION_POINTS`

## Main files

- `bot.js` — orchestration and trigger logic
- `priceTracker.js` — RTDS Chainlink BTC stream + 5-minute boundary PTB snapshot
- `polymarket.js` — market loading + CLOB prices
- `tradeEngine.js` — virtual trade execution
- `logger.js` — terminal output
