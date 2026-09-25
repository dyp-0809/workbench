const test = require('node:test');
const assert = require('node:assert/strict');
const { fetchEastmoneyEtfQuote, fetchEastmoneyQuote, toEastmoneySecid } = require('../local-hub/src/eastmoney.js');

test('东方财富行情适配 A 股代码并标准化价格', async () => {
  assert.equal(toEastmoneySecid('600519'), '1.600519');
  assert.equal(toEastmoneySecid('000001'), '0.000001');

  const originalFetch = global.fetch;
  let request;
  global.fetch = async (url) => {
    request = new URL(url);
    return { ok: true, json: async () => ({ data: { f43: 12.34, f57: '000001', f58: '平安银行', f169: 0.56, f170: 4.56 } }) };
  };
  try {
    const quote = await fetchEastmoneyQuote('000001');
    assert.equal(request.searchParams.get('secid'), '0.000001');
    assert.equal(quote.currentPrice, 12.34);
    assert.equal(quote.change, 0.56);
    assert.equal(quote.changePercent, 4.56);
  } finally {
    global.fetch = originalFetch;
  }
});

test('东方财富 ETF 行情返回 IOPV 与溢价率', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => ({ data: { total: 1, diff: [{ f2: 3.049, f12: '159509', f14: '纳指科技ETF景顺', f402: -27.74, f441: 2.3868 }] } }) });
  try {
    const quote = await fetchEastmoneyEtfQuote('159509');
    assert.equal(quote.iopv, 2.3868);
    assert.equal(quote.premiumRate.toFixed(4), '0.2774');
  } finally {
    global.fetch = originalFetch;
  }
});
