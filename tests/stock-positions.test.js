const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { createContentHub } = require('../local-hub/src/content-hub.js');

async function withHub(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'x-assistant-stock-'));
  const quoteCalls = [];
  const hub = createContentHub({
    dataDirectory: directory,
    quoteFetcher: async (symbol) => {
      quoteCalls.push(symbol);
      return { symbol, currentPrice: 180, quotedAt: '2026-08-21T00:00:00.000Z' };
    }
  });
  const address = await hub.listen(0);
  const baseUrl = `http://127.0.0.1:${address.port}/v1/stock-positions`;
  try { await run({ baseUrl, quoteCalls }); } finally { await hub.close(); fs.rmSync(directory, { recursive: true, force: true }); }
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

    const savedResponse = await fetch(settingsUrl, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ totalAssets: 1000000 }) });
    const saved = await savedResponse.json();
    assert.equal(savedResponse.status, 200);
    assert.equal(saved.settings.totalAssets, 1000000);
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
