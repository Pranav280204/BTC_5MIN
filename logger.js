/**
 * Logger — colored terminal output
 */
const C = {
  reset:   '\x1b[0m',
  bright:  '\x1b[1m',
  dim:     '\x1b[2m',
  green:   '\x1b[32m',
  red:     '\x1b[31m',
  yellow:  '\x1b[33m',
  cyan:    '\x1b[36m',
  white:   '\x1b[37m',
  gray:    '\x1b[90m',
  bgGreen: '\x1b[42m',
  bgRed:   '\x1b[41m',
  bgYellow:'\x1b[43m',
};
const c = (col, txt) => `${C[col]}${txt}${C.reset}`;

class Logger {
  banner() {
    console.clear();
    console.log(c('cyan', c('bright', `
╔══════════════════════════════════════════════════════════╗
║        POLYMARKET BTC BOT  ₿   (real-time)              ║
║  RTDS Chainlink oracle  ×  Polymarket live markets       ║
╚══════════════════════════════════════════════════════════╝`)));
    console.log(c('gray', `  Strategy : BUY YES if price drops 30+ pts below 5-min PTB`));
    console.log(c('gray', `             BUY NO  if price rises 30+ pts above 5-min PTB`));
    console.log(c('gray', `             Only in last 45s of market close | $10 virtual\n`));
    console.log(c('gray', `  Started  : ${new Date().toLocaleString()}\n`));
  }

  _ts() { return c('gray', `[${new Date().toTimeString().slice(0,8)}]`); }

  info(msg)    { console.log(`${this._ts()} ${c('cyan',   'INFO ')} ${msg}`); }
  success(msg) { console.log(`${this._ts()} ${c('green',  'OK   ')} ${msg}`); }
  warn(msg)    { console.log(`${this._ts()} ${c('yellow', 'WARN ')} ${msg}`); }
  error(msg)   { console.log(`${this._ts()} ${c('red',    'ERR  ')} ${msg}`); }

  tick(price, beat, drop, fillPct) {
    const gapDir = drop > 0
      ? c('red',   `▼ ${drop.toFixed(0).padStart(4)}$ below beat`)
      : c('green', `▲ ${(-drop).toFixed(0).padStart(4)}$ above beat`);
    const beatStr  = c('yellow', `beat=$${beat.toFixed(0)}`);
    const fillStr  = c('gray', `window=${fillPct}%`);
    const priceStr = c('white',  `$${price.toFixed(0).padStart(7)}`);
    console.log(`${this._ts()} ${c('bright','BTC  ')} ${priceStr} | ${beatStr} | ${gapDir} | ${fillStr}`);
  }

  trade(trade, balance) {
    const side = trade.side === 'YES'
      ? c('green', 'BUY YES ↑')
      : c('red',   'BUY NO  ↓');
    console.log(`\n${this._ts()} ${c('bright', c('yellow', '▶ TRADE #' + trade.id))}`);
    console.log(`           ${side}  "${trade.market.slice(0, 55)}"`);
    console.log(`           Entry: ${trade.price.toFixed(1)}¢ | Gap: ${trade.deviation.toFixed(0)}$ | ${trade.secsLeft}s left`);
    console.log(`           BTC: $${trade.btcPrice.toFixed(0)} | Beat: $${trade.beatPrice.toFixed(0)} | Spent: $${trade.amount}`);
    console.log(`           Virtual balance: $${balance.toFixed(2)}\n`);
  }

  win(trade, balance) {
    console.log(`${this._ts()} ${c('bgGreen', c('bright', ' WIN  '))} #${trade.id} +$${trade.profit.toFixed(2)} | bal: $${balance.toFixed(2)}`);
  }

  loss(trade, balance) {
    console.log(`${this._ts()} ${c('bgRed', c('bright', ' LOSS '))} #${trade.id} -$${Math.abs(trade.profit).toFixed(2)} | bal: $${balance.toFixed(2)}`);
  }

  summary({ totalTrades, settled, wins, losses, winRate, pnl, balance }) {
    const pnlStr = pnl >= 0
      ? c('green', `+$${pnl.toFixed(2)}`)
      : c('red',   `-$${Math.abs(pnl).toFixed(2)}`);
    console.log(c('bright', `\n${'─'.repeat(60)}`));
    console.log(c('bright', '  SUMMARY'));
    console.log(`  Trades : ${totalTrades} total | ${settled} settled`);
    console.log(`  Results: ${wins} wins | ${losses} losses | win rate ${winRate}%`);
    console.log(`  P&L    : ${pnlStr}   Balance: $${balance.toFixed(2)}`);
    console.log(c('bright', `${'─'.repeat(60)}\n`));
  }
}

module.exports = { Logger };
