const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { createContentHub } = require('../local-hub/src/content-hub.js');

function fakeFinnhub() {
  let apiKey = '';
  const quoteCalls = [];
  return {
    options: {
      finnhubSettings: {
        get: async () => ({ configured: Boolean(apiKey), provider: 'Finnhub' }),
        set: async (input) => {
          apiKey = String(input.apiKey || '').trim() || apiKey;
          if (!apiKey) throw new Error('Finnhub API Key 不能为空。');
          return { configured: true, provider: 'Finnhub' };
        },
        test: async (input) => {
          const key = String(input.apiKey || '').trim() || apiKey;
          if (key !== 'test-key') throw new Error('Finnhub API Key 无效。');
          return { connected: true, quote: { symbol: 'AAPL', currentPrice: 210.25, quotedAt: '2026-08-21T00:00:00.000Z' } };
        }
      },
      quoteFetcher: async (symbol) => {
        if (apiKey !== 'test-key') throw new Error('请先在设置中配置 Finnhub API Key。');
        quoteCalls.push(symbol);
        return { symbol, currentPrice: symbol === 'AAPL' ? 210.25 : 450.5, change: 1.5, changePercent: 0.72, quotedAt: '2026-08-21T00:00:00.000Z' };
      }
    },
    quoteCalls
  };
}

async function withHub(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'x-assistant-finnhub-'));
  const fake = fakeFinnhub();
  const hub = createContentHub({ dataDirectory: directory, ...fake.options });
  const address = await hub.listen(0);
  const baseUrl = `http://127.0.0.1:${address.port}/v1`;
  try { await run({ baseUrl, fake }); } finally { await hub.close(); fs.rmSync(directory, { recursive: true, force: true }); }
}

async function createPosition(baseUrl, input = {}) {
  const response = await fetch(`${baseUrl}/stock-positions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol: 'AAPL', name: '苹果', market: 'US', quantity: 10, costPrice: 150, currentPrice: 180, notes: '', ...input })
  });
  return { response, payload: await response.json() };
}

test('Finnhub 设置只返回配置状态且支持连接检测', async () => {
  await withHub(async ({ baseUrl }) => {
    const initial = await (await fetch(`${baseUrl}/finnhub-settings`)).json();
    assert.deepEqual(initial, { configured: false, provider: 'Finnhub' });
    assert.equal((await fetch(`${baseUrl}/finnhub-settings/test`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 400);

    const saved = await (await fetch(`${baseUrl}/finnhub-settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: 'test-key' }) })).json();
    assert.deepEqual(saved.settings, { configured: true, provider: 'Finnhub' });

    const settings = await (await fetch(`${baseUrl}/finnhub-settings`)).json();
    assert.deepEqual(settings, { configured: true, provider: 'Finnhub' });
    assert.equal(Object.hasOwn(settings, 'apiKey'), false);

    const checked = await (await fetch(`${baseUrl}/finnhub-settings/test`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json();
    assert.equal(checked.connected, true);
    assert.equal(checked.quote.currentPrice, 210.25);
  });
});

test('刷新现价只更新美股持仓并保存报价时间', async () => {
  await withHub(async ({ baseUrl, fake }) => {
    await (await fetch(`${baseUrl}/finnhub-settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: 'test-key' }) })).json();
    const { payload: us } = await createPosition(baseUrl);
    const { payload: hk } = await createPosition(baseUrl, { symbol: '0700', name: '腾讯控股', market: 'HK', currentPrice: 380 });
    assert.deepEqual(fake.quoteCalls, ['AAPL']);
    fake.quoteCalls.length = 0;

    const refreshed = await (await fetch(`${baseUrl}/stock-positions/refresh-prices`, { method: 'POST' })).json();
    assert.deepEqual(refreshed.updated.map((item) => item.symbol), ['AAPL']);
    assert.deepEqual(refreshed.skipped, [{ id: hk.position.id, symbol: '0700', reason: '当前仅支持刷新美股行情。' }]);
    assert.deepEqual(fake.quoteCalls, ['AAPL']);

    const positions = await (await fetch(`${baseUrl}/stock-positions`)).json();
    const refreshedUs = positions.positions.find((item) => item.id === us.position.id);
    const untouchedHk = positions.positions.find((item) => item.id === hk.position.id);
    assert.equal(refreshedUs.currentPrice, 210.25);
    assert.equal(refreshedUs.priceUpdatedAt, '2026-08-21T00:00:00.000Z');
    assert.equal(untouchedHk.currentPrice, 0);
    assert.equal(untouchedHk.priceUpdatedAt, null);
  });
});
