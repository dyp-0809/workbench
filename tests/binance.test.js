const test = require('node:test');
const assert = require('node:assert/strict');
const { fetchBinanceQuote, toBinanceSymbol } = require('../local-hub/src/binance.js');

test('Binance 行情使用 USDT 交易对并标准化加密货币代码', async () => {
  assert.equal(toBinanceSymbol('btc'), 'BTCUSDT');
  const originalFetch = global.fetch;
  let request;
  global.fetch = async (url) => {
    request = new URL(url);
    return { ok: true, json: async () => ({ symbol: 'BTCUSDT', price: '65000.12' }) };
  };
  try {
    const quote = await fetchBinanceQuote('btc');
    assert.equal(request.searchParams.get('symbol'), 'BTCUSDT');
    assert.equal(quote.symbol, 'BTC');
    assert.equal(quote.currentPrice, 65000.12);
  } finally {
    global.fetch = originalFetch;
  }
});
