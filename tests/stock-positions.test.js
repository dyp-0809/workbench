const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');
const { createContentHub } = require('../local-hub/src/content-hub.js');

async function withHub(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'x-assistant-stock-'));
  const quoteCalls = [];
  const cnQuoteCalls = [];
  const cryptoQuoteCalls = [];
  const hub = createContentHub({
    dataDirectory: directory,
    quoteFetcher: async (symbol) => {
      quoteCalls.push(symbol);
      return { symbol, currentPrice: 180, quotedAt: '2026-08-21T00:00:00.000Z' };
    },
    cnQuoteFetcher: async (symbol) => {
      cnQuoteCalls.push(symbol);
      return { symbol, currentPrice: 12.34, iopv: 10, quotedAt: '2026-08-21T00:00:00.000Z' };
    },
    cryptoQuoteFetcher: async (symbol) => {
      cryptoQuoteCalls.push(symbol);
      return { symbol, currentPrice: 65000, quotedAt: '2026-08-21T00:00:00.000Z' };
    }
  });
  const address = await hub.listen(0);
  const baseUrl = `http://127.0.0.1:${address.port}/v1/stock-positions`;
  try { await run({ baseUrl, quoteCalls, cnQuoteCalls, cryptoQuoteCalls }); } finally { await hub.close(); fs.rmSync(directory, { recursive: true, force: true }); }
}

async function createPosition(baseUrl, input = {}) {
  const response = await fetch(baseUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: 'AAPL', name: '苹果', market: 'US', quantity: 10, costPrice: 150, notes: '', ...input }) });
  return { response, payload: await response.json() };
}

test('用户可新增、更新并删除持仓', async () => {
  await withHub(async ({ baseUrl, quoteCalls }) => {
    const { payload: created, response } = await createPosition(baseUrl);
    assert.equal(response.status, 201);
    assert.equal(created.position.symbol, 'AAPL');
    assert.equal(created.position.name, '苹果');
    assert.equal(created.position.market, 'US');
    assert.equal(created.position.quantity, 10);
    assert.equal(created.position.costPrice, 150);
    assert.equal(created.position.currentPrice, 180);
    assert.equal(created.position.priceUpdatedAt, '2026-08-21T00:00:00.000Z');
    assert.deepEqual(quoteCalls, ['AAPL']);

    const listed = await (await fetch(baseUrl)).json();
    assert.equal(listed.positions.length, 1);

    const updated = await (await fetch(`${baseUrl}/${created.position.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPrice: 200, quantity: 12 }) })).json();
    assert.equal(updated.position.currentPrice, 200);
    assert.equal(updated.position.quantity, 12);
    assert.equal(updated.position.symbol, 'AAPL');

    assert.equal((await fetch(`${baseUrl}/${created.position.id}`, { method: 'DELETE' })).status, 204);
    const afterDelete = await (await fetch(baseUrl)).json();
    assert.equal(afterDelete.positions.length, 0);
  });
});

test('卖出持仓会记录成交并更新剩余数量', async () => {
  await withHub(async ({ baseUrl }) => {
    const soldUrl = `${baseUrl.replace('/v1/stock-positions', '')}/v1/stock-sold-positions`;
    const { payload: created } = await createPosition(baseUrl);

    const invalidResponse = await fetch(`${baseUrl}/${created.position.id}/sell`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: 11, sellPrice: 175 })
    });
    assert.equal(invalidResponse.status, 400);

    const partialResponse = await fetch(`${baseUrl}/${created.position.id}/sell`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: 4, sellPrice: 175, notes: '分批止盈' })
    });
    const partial = await partialResponse.json();
    assert.equal(partialResponse.status, 201);
    assert.equal(partial.sale.quantity, 4);
    assert.equal(partial.sale.sellPrice, 175);
    assert.equal(partial.sale.realizedPnl, 100);
    assert.equal(partial.position.quantity, 6);

    const activeAfterPartial = await (await fetch(baseUrl)).json();
    assert.equal(activeAfterPartial.positions[0].quantity, 6);
    const soldAfterPartial = await (await fetch(soldUrl)).json();
    assert.equal(soldAfterPartial.soldPositions.length, 1);
    assert.equal(soldAfterPartial.soldPositions[0].notes, '分批止盈');

    const finalResponse = await fetch(`${baseUrl}/${created.position.id}/sell`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: 6, sellPrice: 200 })
    });
    const final = await finalResponse.json();
    assert.equal(finalResponse.status, 201);
    assert.equal(final.position, null);
    assert.equal(final.sale.realizedPnl, 300);

    const activeAfterFinal = await (await fetch(baseUrl)).json();
    assert.equal(activeAfterFinal.positions.length, 0);
    const soldAfterFinal = await (await fetch(soldUrl)).json();
    assert.equal(soldAfterFinal.soldPositions.length, 2);
    assert.equal(soldAfterFinal.soldPositions.reduce((sum, item) => sum + item.quantity, 0), 10);
  });
});

test('持仓字段校验拒绝无效输入', async () => {
  await withHub(async ({ baseUrl }) => {
    assert.equal((await createPosition(baseUrl, { symbol: '' })).response.status, 400);
    assert.equal((await createPosition(baseUrl, { market: 'JP' })).response.status, 400);
    assert.equal((await createPosition(baseUrl, { quantity: 0 })).response.status, 400);
    assert.equal((await createPosition(baseUrl, { costPrice: -1 })).response.status, 400);
    const listed = await (await fetch(baseUrl)).json();
    assert.equal(listed.positions.length, 0);
  });
});

test('持仓支持目标仓位，总资产设置可读写', async () => {
  await withHub(async ({ baseUrl }) => {
    const settingsUrl = `${baseUrl.replace('/v1/stock-positions', '')}/v1/stock-settings`;

    const initialResponse = await fetch(settingsUrl);
    const initial = await initialResponse.json();
    assert.equal(initialResponse.status, 200);
    assert.equal(initial.settings.totalAssets, 0);
    assert.equal(initial.settings.cnTotalAssets, 0);
    assert.equal(initial.settings.cryptoTotalAssets, 0);

    const savedResponse = await fetch(settingsUrl, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ totalAssets: 1000000 }) });
    const saved = await savedResponse.json();
    assert.equal(savedResponse.status, 200);
    assert.equal(saved.settings.totalAssets, 1000000);
    const cnSaved = await (await fetch(settingsUrl, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cnTotalAssets: 500000 }) })).json();
    assert.equal(cnSaved.settings.cnTotalAssets, 500000);
    const cryptoSaved = await (await fetch(settingsUrl, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cryptoTotalAssets: 10000 }) })).json();
    assert.equal(cryptoSaved.settings.cryptoTotalAssets, 10000);
    const invalidResponse = await fetch(settingsUrl, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ totalAssets: -1 }) });
    assert.equal(invalidResponse.status, 400);

    const { payload: created } = await createPosition(baseUrl, { targetPercent: 20 });
    assert.equal(created.position.targetPercent, 20);

    const updated = await (await fetch(`${baseUrl}/${created.position.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetPercent: 35 }) })).json();
    assert.equal(updated.position.targetPercent, 35);

    assert.equal((await createPosition(baseUrl, { targetPercent: 101 })).response.status, 400);
    assert.equal((await createPosition(baseUrl, { targetPercent: -1 })).response.status, 400);
  });
});

test('已有股票数据库迁移后保留美元资产并补充 A 股资产', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'x-assistant-stock-settings-migration-'));
  const database = new Database(path.join(directory, 'stock.sqlite'));
  database.exec("CREATE TABLE stock_settings (id TEXT PRIMARY KEY, total_assets REAL NOT NULL, updated_at TEXT NOT NULL); INSERT INTO stock_settings VALUES ('default', 1000, '2026-01-01T00:00:00.000Z');");
  database.close();
  const hub = createContentHub({ dataDirectory: directory });
  const address = await hub.listen(0);
  try {
    const settings = await (await fetch(`http://127.0.0.1:${address.port}/v1/stock-settings`)).json();
    assert.deepEqual(settings.settings, { totalAssets: 1000, cnTotalAssets: 0, cryptoTotalAssets: 0 });
  } finally {
    await hub.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('A 股持仓使用独立行情源并可单独刷新', async () => {
  await withHub(async ({ baseUrl, quoteCalls, cnQuoteCalls }) => {
    const { response, payload } = await createPosition(baseUrl, { symbol: '000001', name: '平安银行', market: 'CN', costPrice: 10 });
    assert.equal(response.status, 201);
    assert.equal(payload.position.currentPrice, 12.34);
    assert.equal(payload.position.iopv, 10);
    assert.deepEqual(quoteCalls, []);
    assert.deepEqual(cnQuoteCalls, ['000001']);

    const refreshed = await (await fetch(`${baseUrl}/refresh-prices`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ market: 'CN' }) })).json();
    assert.deepEqual(refreshed.updated.map((item) => item.symbol), ['000001']);
    assert.equal(refreshed.updated[0].iopv, 10);
    assert.deepEqual(cnQuoteCalls, ['000001', '000001']);
  });
});

test('加密货币持仓使用 Binance 行情、独立资产与刷新范围', async () => {
  await withHub(async ({ baseUrl, quoteCalls, cryptoQuoteCalls }) => {
    const settingsUrl = `${baseUrl.replace('/v1/stock-positions', '')}/v1/stock-settings`;
    const { response, payload } = await createPosition(baseUrl, { symbol: 'btc', name: '比特币', assetType: 'crypto', market: 'CN', quantity: 0.25, costPrice: 60000 });
    assert.equal(response.status, 201);
    assert.equal(payload.position.market, 'US');
    assert.equal(payload.position.assetType, 'crypto');
    assert.equal(payload.position.currentPrice, 65000);
    assert.deepEqual(quoteCalls, []);
    assert.deepEqual(cryptoQuoteCalls, ['BTC']);

    const refreshed = await (await fetch(`${baseUrl}/refresh-prices`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ market: 'CRYPTO' }) })).json();
    assert.deepEqual(refreshed.updated.map((item) => item.symbol), ['BTC']);
    assert.deepEqual(cryptoQuoteCalls, ['BTC', 'BTC']);

    const saved = await (await fetch(settingsUrl, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cryptoTotalAssets: 10000 }) })).json();
    assert.equal(saved.settings.cryptoTotalAssets, 10000);
  });
});

test('入金记录按市场隔离并保持初始资金独立', async () => {
  await withHub(async ({ baseUrl }) => {
    const rootUrl = baseUrl.replace('/v1/stock-positions', '');
    const depositsUrl = `${rootUrl}/v1/stock-deposits`;
    const created = await (await fetch(depositsUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ market: 'US', amount: 500, notes: '月度加仓' }) })).json();
    assert.equal(created.deposit.market, 'US');
    assert.equal(created.deposit.amount, 500);
    assert.equal(created.deposit.notes, '月度加仓');
    await fetch(depositsUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ market: 'CRYPTO', amount: 1000 }) });
    const listed = await (await fetch(depositsUrl)).json();
    assert.deepEqual(new Set(listed.deposits.map((deposit) => deposit.market)), new Set(['US', 'CRYPTO']));
    assert.equal((await fetch(depositsUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ market: 'US', amount: 0 }) })).status, 400);

    const settings = await (await fetch(`${rootUrl}/v1/stock-settings`)).json();
    assert.equal(settings.settings.totalAssets, 0);
  });
});

test('持仓代码目录提供美股七姐妹并保留用户新增股票', async () => {
  await withHub(async ({ baseUrl }) => {
    const symbolsUrl = `${baseUrl.replace('/v1/stock-positions', '')}/v1/stock-symbols`;
    const initial = await (await fetch(symbolsUrl)).json();
    assert.deepEqual(initial.symbols.filter((item) => item.isDefault).map((item) => item.symbol).sort(), ['AAPL', 'AMZN', 'GOOGL', 'META', 'MSFT', 'NVDA', 'TSLA']);

    const { response } = await createPosition(baseUrl, { symbol: 'pltr', name: 'Palantir', market: 'US' });
    assert.equal(response.status, 201);

    const saved = await (await fetch(symbolsUrl)).json();
    assert.deepEqual(saved.symbols.find((item) => item.symbol === 'PLTR'), { symbol: 'PLTR', name: 'Palantir', market: 'US', isDefault: false });
  });
});
