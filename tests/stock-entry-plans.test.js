const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { createContentHub } = require('../local-hub/src/content-hub.js');

async function withHub(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'x-assistant-entry-plans-'));
  const quoteCalls = [];
  const valuationCalls = [];
  const hub = createContentHub({
    dataDirectory: directory,
    quoteFetcher: async (symbol) => {
      quoteCalls.push(symbol);
      return { symbol, currentPrice: 210.25, quotedAt: '2026-08-21T00:00:00.000Z' };
    },
    valuationFetcher: async (symbol) => {
      valuationCalls.push(symbol);
      return { symbol, trailingPE: 38.4, forwardPE: 31.2 };
    }
  });
  const address = await hub.listen(0);
  const baseUrl = `http://127.0.0.1:${address.port}/v1`;
  try { await run({ baseUrl, quoteCalls, valuationCalls }); } finally { await hub.close(); fs.rmSync(directory, { recursive: true, force: true }); }
}

async function createPlan(baseUrl, input = {}) {
  const response = await fetch(`${baseUrl}/stock-entry-plans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol: 'NVDA', name: '英伟达', market: 'US', entryPrice: 180, targetPercent: 15, notes: '等待回踩', ...input })
  });
  return { response, payload: await response.json() };
}

test('待开仓股票可新增、编辑并删除', async () => {
  await withHub(async ({ baseUrl }) => {
    const { response, payload: created } = await createPlan(baseUrl);
    assert.equal(response.status, 201);
    assert.equal(created.plan.symbol, 'NVDA');
    assert.equal(created.plan.entryPrice, 180);
    assert.equal(created.plan.targetPercent, 15);

    const updated = await (await fetch(`${baseUrl}/stock-entry-plans/${created.plan.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entryPrice: 185.5, notes: '突破后关注' })
    })).json();
    assert.equal(updated.plan.entryPrice, 185.5);
    assert.equal(updated.plan.notes, '突破后关注');

    const listed = await (await fetch(`${baseUrl}/stock-entry-plans`)).json();
    assert.equal(listed.plans.length, 1);
    assert.equal((await fetch(`${baseUrl}/stock-entry-plans/${created.plan.id}`, { method: 'DELETE' })).status, 204);
    assert.equal((await (await fetch(`${baseUrl}/stock-entry-plans`)).json()).plans.length, 0);
  });
});

test('待开仓股票可按开仓价和数量转入仓位管理', async () => {
  await withHub(async ({ baseUrl, quoteCalls }) => {
    const { payload: created } = await createPlan(baseUrl, { entryPrice: 190, targetPercent: 20 });
    const response = await fetch(`${baseUrl}/stock-entry-plans/${created.plan.id}/open-position`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quantity: 8 })
    });
    const opened = await response.json();
    assert.equal(response.status, 201);
    assert.equal(opened.position.symbol, 'NVDA');
    assert.equal(opened.position.quantity, 8);
    assert.equal(opened.position.costPrice, 190);
    assert.equal(opened.position.currentPrice, 210.25);
    assert.equal(opened.position.targetPercent, 20);
    assert.deepEqual(quoteCalls, ['NVDA']);

    assert.equal((await (await fetch(`${baseUrl}/stock-entry-plans`)).json()).plans.length, 0);
    const positions = await (await fetch(`${baseUrl}/stock-positions`)).json();
    assert.equal(positions.positions.length, 1);
  });
});

test('待开仓股票刷新当前市价、开仓状态与估值指标', async () => {
  await withHub(async ({ baseUrl, quoteCalls, valuationCalls }) => {
    const { payload: openable } = await createPlan(baseUrl, { symbol: 'AAPL', name: '苹果', entryPrice: 220 });
    const { payload: waiting } = await createPlan(baseUrl, { symbol: 'MSFT', name: '微软', entryPrice: 200 });
    const { payload: skipped } = await createPlan(baseUrl, { symbol: '0700', name: '腾讯控股', market: 'HK', entryPrice: 300 });
    const response = await fetch(`${baseUrl}/stock-entry-plans/refresh-market-data`, { method: 'POST' });
    const marketData = await response.json();
    assert.equal(response.status, 200);
    const byId = new Map(marketData.updated.map((item) => [item.id, item]));
    assert.equal(byId.get(openable.plan.id).status, 'openable');
    assert.equal(byId.get(waiting.plan.id).status, 'waiting');
    assert.equal(byId.get(openable.plan.id).currentPrice, 210.25);
    assert.equal(byId.get(openable.plan.id).trailingPE, 38.4);
    assert.equal(byId.get(openable.plan.id).forwardPE, 31.2);
    assert.deepEqual(quoteCalls.sort(), ['AAPL', 'MSFT']);
    assert.deepEqual(valuationCalls.sort(), ['AAPL', 'MSFT']);
    assert.deepEqual(marketData.skipped, [{ id: skipped.plan.id, symbol: '0700', reason: '当前仅支持刷新美股行情与估值指标。' }]);
  });
});

test('待开仓股票校验开仓位置与转入数量', async () => {
  await withHub(async ({ baseUrl }) => {
    assert.equal((await createPlan(baseUrl, { entryPrice: -1 })).response.status, 400);
    const { payload: created } = await createPlan(baseUrl);
    const failed = await fetch(`${baseUrl}/stock-entry-plans/${created.plan.id}/open-position`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quantity: 0 })
    });
    assert.equal(failed.status, 400);
    assert.equal((await (await fetch(`${baseUrl}/stock-entry-plans`)).json()).plans.length, 1);
  });
});

test('待开仓行情和估值数据会写入 SQLite，并在重启后保留最近成功缓存', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'x-assistant-entry-plan-cache-'));
  const startHub = async (quoteFetcher, valuationFetcher) => {
    const hub = createContentHub({ dataDirectory: directory, quoteFetcher, valuationFetcher });
    const address = await hub.listen(0);
    return { hub, baseUrl: `http://127.0.0.1:${address.port}/v1` };
  };
  try {
    const first = await startHub(
      async (symbol) => ({ symbol, currentPrice: 210.25, quotedAt: '2026-08-21T00:00:00.000Z' }),
      async (symbol) => ({ symbol, trailingPE: 38.4, forwardPE: 31.2 })
    );
    const { payload: created } = await createPlan(first.baseUrl, { symbol: 'AAPL', name: '苹果', entryPrice: 220 });
    assert.equal((await fetch(`${first.baseUrl}/stock-entry-plans/refresh-market-data`, { method: 'POST' })).status, 200);
    await first.hub.close();

    const second = await startHub(
      async () => { throw new Error('不应在读取缓存时请求行情。'); },
      async () => { throw new Error('不应在读取缓存时请求估值。'); }
    );
    const plans = await (await fetch(`${second.baseUrl}/stock-entry-plans`)).json();
    assert.equal(plans.plans.length, 1);
    assert.equal(plans.plans[0].id, created.plan.id);
    assert.equal(plans.plans[0].currentPrice, 210.25);
    assert.equal(plans.plans[0].trailingPE, 38.4);
    assert.equal(plans.plans[0].forwardPE, 31.2);
    assert.equal(plans.plans[0].marketStatus, 'openable');
    assert.equal(plans.plans[0].marketUpdatedAt, '2026-08-21T00:00:00.000Z');
    await second.hub.close();
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
