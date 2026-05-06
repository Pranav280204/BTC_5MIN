const https = require('https');

class TelegramNotifier {
  constructor({ token, chatId, enabled }, log) {
    this.token = token;
    this.chatId = chatId;
    this.enabled = Boolean(enabled && token && chatId);
    this.log = log;
  }

  async send(text) {
    if (!this.enabled) return;
    const payload = JSON.stringify({ chat_id: this.chatId, text, parse_mode: 'Markdown' });
    const opts = {
      hostname: 'api.telegram.org',
      path: `/bot${this.token}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    };

    await new Promise((resolve) => {
      const req = https.request(opts, (res) => {
        res.on('data', () => {});
        res.on('end', resolve);
      });
      req.on('error', (err) => {
        this.log.warn(`Telegram notify failed: ${err.message}`);
        resolve();
      });
      req.write(payload);
      req.end();
    });
  }
}

module.exports = { TelegramNotifier };
