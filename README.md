# Polymarket BTC 5-Min Bot 🤖₿

This bot uses **only Polymarket-native data**:

- **RTDS WebSocket** (`wss://ws-live-data.polymarket.com`) for live BTC oracle ticks (Chainlink stream).
- **Price To Beat API** (`/api/equity/price-to-beat/{slug}`) for the exact resolver threshold per market.
- **Gamma + CLOB APIs** for market discovery and live YES/NO pricing.

No direct Binance feed is used by the bot.

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

1. Read `priceToBeat` from Polymarket API for that market slug.
2. Read live BTC oracle price from RTDS Chainlink stream.
3. In the final `TRIGGER_WINDOW_SECONDS` before close:
   - Buy **YES** when `(priceToBeat - price) >= PRICE_DEVIATION_POINTS`
   - Buy **NO** when `(price - priceToBeat) >= PRICE_DEVIATION_POINTS`

## Main files

- `bot.js` — orchestration and trigger logic
- `priceTracker.js` — RTDS Chainlink BTC stream
- `polymarket.js` — market loading + CLOB prices + price-to-beat enrichment
- `tradeEngine.js` — virtual trade execution
- `logger.js` — terminal output
