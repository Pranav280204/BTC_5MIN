/**
 * TradeEngine
 * Executes virtual trades and tracks P&L.
 *
 * To make this trade REAL on Polymarket, replace the `_executeVirtual`
 * method with a call to the Polymarket CLOB API using your private key.
 * See: https://docs.polymarket.com/#order-creation
 */

class Trade {
  constructor({ id, side, market, price, amount, deviation, secsLeft, btcPrice, beatPrice }) {
    this.id        = id;
    this.side      = side;                    // 'YES' | 'NO'
    this.market    = market.question;
    this.price     = price;                   // cents (0–100)
    this.amount    = amount;                  // USD spent
    this.shares    = amount / (price / 100);  // shares received
    this.deviation = deviation;               // how far from beat price
    this.secsLeft  = secsLeft;
    this.btcPrice  = btcPrice;
    this.beatPrice = beatPrice;
    this.time      = new Date().toISOString();
    this.settled   = false;
    this.profit    = null;
  }
}

class TradeEngine {
  constructor(config, log, notifier = null) {
    this.config  = config;
    this.log     = log;
    this.trades  = [];
    this.balance = 1000;   // virtual starting balance
    this.notifier = notifier;
    this.wins    = 0;
    this.losses  = 0;
  }

  buy(side, market, deviation, secsLeft, btcPrice, beatPrice) {
    // De-duplicate: don't buy same side on same market twice
    if (!market.canBuy(side)) return;

    const price  = side === 'YES' ? market.yesPrice : market.noPrice;
    const amount = this.config.VIRTUAL_TRADE_AMOUNT;

    if (this.balance < amount) {
      this.log.warn(`Insufficient virtual balance ($${this.balance.toFixed(2)}) for $${amount} trade`);
      return;
    }

    market.markBought(side);
    this.balance -= amount;

    const trade = new Trade({
      id: this.trades.length + 1,
      side, market, price, amount, deviation, secsLeft, btcPrice, beatPrice,
    });

    this.trades.push(trade);
    this._executeVirtual(trade);
    this.log.trade(trade, this.balance);
    this._notifyTrade(trade);
  }

  /**
   * Virtual execution — logs the trade.
   *
   * ── TO GO LIVE ────────────────────────────────────────────────────────────
   * Replace this with real order submission:
   *
   *   const { ethers } = require('ethers');
   *   const { ClobClient } = require('@polymarket/clob-client');
   *
   *   const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
   *   const client = new ClobClient('https://clob.polymarket.com', 137, wallet);
   *
   *   const order = await client.createAndSendOrder({
   *     tokenID: market.conditionId,
   *     price: trade.price / 100,
   *     side: trade.side === 'YES' ? Side.BUY : Side.BUY,  // always buying
   *     size: trade.shares,
   *     feeRateBps: 0,
   *     nonce: 0,
   *   });
   *
   *   console.log('Order placed:', order.orderID);
   * ─────────────────────────────────────────────────────────────────────────
   */
  async _notifyTrade(trade) {
    if (!this.notifier) return;
    const msg = [
      '*📈 Virtual trade placed*',
      `#${trade.id} BUY ${trade.side}`,
      `Market: ${trade.market.slice(0, 80)}`,
      `Entry: ${trade.price.toFixed(1)}¢ | Gap: ${trade.deviation.toFixed(1)}$ | T-${trade.secsLeft}s`,
      `BTC: $${trade.btcPrice.toFixed(2)} | Beat: $${trade.beatPrice.toFixed(2)}`,
      `Amount: $${trade.amount.toFixed(2)} | Balance: $${this.balance.toFixed(2)}`,
      `Portfolio: trades=${this.trades.length}, wins=${this.wins}, losses=${this.losses}`
    ].join('\n');
    await this.notifier.send(msg);
  }

  _executeVirtual(trade) {
    // Simulate settlement after 10 seconds (for demo feedback)
    setTimeout(() => this._settle(trade), 10_000);
  }

  /**
   * Simulated settlement. In production, you'd subscribe to Polymarket
   * settlement events via their WebSocket or poll the resolution endpoint.
   */
  _settle(trade) {
    // Rough probability: YES wins if BTC is above target (simplified)
    const won = Math.random() > 0.45; // Replace with actual market outcome
    trade.settled = true;

    if (won) {
      // Payout = shares × $1 (100¢ payout per share)
      const payout = trade.shares * 1;
      trade.profit = payout - trade.amount;
      this.balance += payout;
      this.wins++;
      this.log.win(trade, this.balance);
    } else {
      trade.profit = -trade.amount;
      this.losses++;
      this.log.loss(trade, this.balance);
    }
  }

  printSummary() {
    const totalTrades = this.trades.length;
    const settled     = this.trades.filter(t => t.settled);
    const totalPnl    = settled.reduce((s, t) => s + (t.profit || 0), 0);
    const winRate     = settled.length ? ((this.wins / settled.length) * 100).toFixed(1) : '—';

    this.log.summary({
      totalTrades,
      settled: settled.length,
      wins: this.wins,
      losses: this.losses,
      winRate,
      pnl: totalPnl,
      balance: this.balance,
    });

    // Print recent trades
    if (this.trades.length) {
      console.log('\n  Recent trades:');
      this.trades.slice(-5).forEach(t => {
        const result = t.settled
          ? (t.profit >= 0 ? `WIN  +$${t.profit.toFixed(2)}` : `LOSS -$${Math.abs(t.profit).toFixed(2)}`)
          : 'PENDING…';
        console.log(`  #${t.id} BUY ${t.side.padEnd(3)} | ${t.market.slice(0,45).padEnd(45)} | ${t.price.toFixed(1)}¢ | ${result}`);
      });
    }
  }
}

module.exports = { TradeEngine };
