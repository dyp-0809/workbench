const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { createContentHub } = require('../local-hub/src/content-hub.js');

async function withHub(run, now = () => new Date('2026-08-13T00:00:00.000Z')) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'x-expiring-modes-'));
  const hub = await createContentHub({ dataDirectory: directory, now });
  const address = await hub.listen(0);
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try { await run({ baseUrl, hub }); } finally { await hub.close(); fs.rmSync(directory, { recursive: true, force: true }); }
}

async function create(baseUrl, input) {
  const response = await fetch(`${baseUrl}/v1/expiring-items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  return { status: response.status, payload: await response.json() };
}

test('创建单次到期项精确到秒并计算提前提醒时间', async () => {
  await withHub(async ({ baseUrl }) => {
    const result = await create(baseUrl, { name: '看牙医', dueAt: '2026-09-14T10:30:00.000Z', advanceValue: 30, advanceUnit: 'minute' });
    assert.equal(result.status, 201);
    assert.equal(result.payload.item.mode, 'once');
    assert.equal(result.payload.item.dueAt, '2026-09-14T10:30:00.000Z');
    assert.equal(result.payload.item.nextAt, '2026-09-14T10:00:00.000Z');
  });
});

test('创建周期自动滚动到期项并计算下次提醒', async () => {
  await withHub(async ({ baseUrl }) => {
    const result = await create(baseUrl, { name: '浇花', mode: 'recurring-auto', dueAt: '2026-09-14T10:00:00.000Z', intervalValue: 3, intervalUnit: 'day', advanceValue: 1, advanceUnit: 'hour' });
    assert.equal(result.status, 201);
    assert.equal(result.payload.item.mode, 'recurring-auto');
    assert.equal(result.payload.item.intervalValue, 3);
    assert.equal(result.payload.item.intervalUnit, 'day');
    assert.equal(result.payload.item.nextAt, '2026-09-14T09:00:00.000Z');
  });
});

test('周期提醒缺少周期时报错', async () => {
  await withHub(async ({ baseUrl }) => {
    const result = await create(baseUrl, { name: '浇花', mode: 'recurring-auto', dueAt: '2026-09-14T10:00:00.000Z' });
    assert.equal(result.status, 400);
    assert.match(result.payload.error, /周期/);
  });
});

test('自动滚动到期项到点后推进下次提醒', async () => {
  await withHub(async ({ baseUrl, hub }) => {
    const created = await create(baseUrl, { name: '浇花', mode: 'recurring-auto', dueAt: '2026-09-10T10:00:00.000Z', intervalValue: 3, intervalUnit: 'day' });
    assert.equal(created.status, 201);
    const id = created.payload.item.id;
    const triggered = await hub.rolloverExpiringItems(new Date('2026-09-10T10:00:01.000Z'));
    assert.equal(triggered.length, 1);
    const after = (await (await fetch(`${baseUrl}/v1/expiring-items`)).json()).items.find((item) => item.id === id);
    assert.equal(after.nextAt, '2026-09-13T10:00:00.000Z');
  });
});

test('手动确认到期项到点后待确认，确认才推进', async () => {
  await withHub(async ({ baseUrl, hub }) => {
    const created = await create(baseUrl, { name: '换滤芯', mode: 'recurring-manual', dueAt: '2026-09-10T10:00:00.000Z', intervalValue: 1, intervalUnit: 'month' });
    const id = created.payload.item.id;
    await hub.rolloverExpiringItems(new Date('2026-09-10T10:00:01.000Z'));
    const pending = (await (await fetch(`${baseUrl}/v1/expiring-items`)).json()).items.find((item) => item.id === id);
    assert.equal(pending.reminderStatus, 'pending');

    const confirmResponse = await fetch(`${baseUrl}/v1/expiring-items/${id}/confirm`, { method: 'POST' });
    assert.equal(confirmResponse.status, 200);
    const confirmed = (await (await fetch(`${baseUrl}/v1/expiring-items`)).json()).items.find((item) => item.id === id);
    assert.equal(confirmed.nextAt, '2026-10-10T10:00:00.000Z');
    assert.equal(confirmed.reminderStatus, 'upcoming');
  });
});
