# Polymarket BTC 5-Min Bot 🤖₿

Real-time bot that:
1. Streams live BTC price from **Binance WebSocket** (free, no API key)
2. Fetches active **BTC Polymarket markets** via REST API
3. Monitors the **last 45 seconds** of each event closing
4. **Buys YES** if BTC is 30+ points below 5-min beat price AND YES > 15¢
5. **Buys NO** if BTC is 30+ points above 5-min beat price AND NO > 15¢

> ⚠️ Runs in **virtual mode** by default (no real money). See "Going Live" below to enable real trades.

---

## Setup

### Requirements
- Node.js 18+
- Internet access (Binance WS + Polymarket API)

### Install & Run
```bash
npm install
node bot.js
```

### What you'll see
```
[14:22:01] INFO  Connecting to Binance WebSocket…
[14:22:01] OK   Binance WS connected
[14:22:01] INFO  Starting Polymarket market polling…
[14:22:02] INFO  Polymarket: 4 active BTC markets found
[14:22:10] BTC   $97,344 | beat $97,890 ▼   546pts below beat

▶ TRADE #1
           BUY YES ↑  on "BTC above $97,000 at 4:30 PM"
           Price: 72.3¢ | Gap: 31pts | 38s left
           BTC: $97,502 | Beat: $97,534
           Spent: $10 | Balance: $990.00
```

---

## Strategy Logic

```
BEAT PRICE  = highest BTC price in the last 5 minutes (rolling window)

Every trade tick:
  for each active Polymarket BTC market:
    secsLeft = market.closeTime - now

    if secsLeft <= 45:
      drop = BEAT_PRICE - current_BTC_price
      rise = current_BTC_price - BEAT_PRICE

      if drop >= 30 AND market.YES_price > 15¢:
        BUY YES $10   # price dipped, expect recovery → market resolves YES

      if rise >= 30 AND market.NO_price > 15¢:
        BUY NO $10    # price spiked, expect pullback → market resolves NO
```

---

## Configuration (bot.js)

| Parameter | Default | Meaning |
|-----------|---------|---------|
| `BEAT_WINDOW_SECONDS` | 300 | Rolling window for beat price (5 min) |
| `TRIGGER_WINDOW_SECONDS` | 45 | Enter trades only in last N seconds |
| `PRICE_DEVIATION_POINTS` | 30 | BTC $ gap needed to trigger |
| `MIN_YES_PRICE` | 15 | Min YES price in cents to buy YES |
| `MIN_NO_PRICE` | 15 | Min NO price in cents to buy NO |
| `VIRTUAL_TRADE_AMOUNT` | 10 | USD per trade |

---

## Going Live (Real Trades) 🚨

To place real orders on Polymarket, edit `tradeEngine.js` → `_executeVirtual()`:

```bash
npm install @polymarket/clob-client ethers
```

```js
// tradeEngine.js — replace _executeVirtual with:
const { ethers } = require('ethers');
const { ClobClient, Side } = require('@polymarket/clob-client');

async _executeReal(trade, market) {
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
  const client = new ClobClient('https://clob.polymarket.com', 137, wallet);

  await client.createAndSendOrder({
    tokenID:      market.conditionId,
    price:        trade.price / 100,     // convert cents to decimal
    side:         Side.BUY,
    size:         trade.shares,
    feeRateBps:   0,
    nonce:        0,
  });
}
```

Set your private key:
```bash
export PRIVATE_KEY="0xYOUR_POLYGON_WALLET_PRIVATE_KEY"
node bot.js
```

> ⚠️ **Never commit your private key.** Use environment variables or a `.env` file with dotenv.

---

## File Structure

```
polymarket-bot/
├── bot.js           # Entry point, orchestrates everything
├── polymarket.js    # Fetches & caches Polymarket BTC markets
├── priceTracker.js  # Rolling 5-min BTC price window + beat price
├── tradeEngine.js   # Trade logic, virtual execution, P&L tracking
├── logger.js        # Colored terminal output
└── README.md        # This file
```

---

## APIs Used

| Service | URL | Auth |
|---------|-----|------|
| Binance WebSocket | `wss://stream.binance.com:9443/ws/btcusdt@trade` | None |
| Polymarket Gamma API | `https://gamma-api.polymarket.com/markets` | None |
| Polymarket CLOB API | `https://clob.polymarket.com` | None (read), Wallet (write) |

---

## Notes

- The bot prevents duplicate trades: once it buys YES/NO on a market, it won't buy the same side again until the market resets.
- If Binance WS disconnects, it auto-reconnects after 5 seconds.
- If Polymarket API fails, the bot keeps using the last known market list.
- Trades print to terminal. Add a database (sqlite3, postgres) to persist history.
"# BTC_5MIN" 
