const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { createContentHub } = require('../local-hub/src/content-hub.js');

function fakeBark() {
  let saved = { configured: false, serverUrl: 'https://api.day.app' };
  const pushed = [];
  return {
    saved: () => saved,
    pushed,
    barkSettings: {
      get: async () => saved,
      set: async (input) => { saved = { configured: true, serverUrl: input.serverUrl || 'https://api.day.app' }; return saved; }
    },
    barkPusher: async (title, body) => { pushed.push({ title, body }); }
  };
}

async function withHub(run, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'x-bark-'));
  const hub = await createContentHub({ dataDirectory: directory, now: () => new Date('2026-08-13T00:00:00.000Z'), ...options });
  const address = await hub.listen(0);
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try { await run({ baseUrl, hub }); } finally { await hub.close(); fs.rmSync(directory, { recursive: true, force: true }); }
}

test('配置 Bark 后返回配置状态', async () => {
  const bark = fakeBark();
  await withHub(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/v1/bark-settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceKey: 'abc123', serverUrl: 'https://bark.example.com' }) });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).settings.configured, true);
    assert.equal(bark.saved().serverUrl, 'https://bark.example.com');
  }, { barkSettings: bark.barkSettings });
});

test('到达提醒时间的到期项触发 Bark 推送', async () => {
  const bark = fakeBark();
  await withHub(async ({ baseUrl, hub }) => {
    const created = await (await fetch(`${baseUrl}/v1/expiring-items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '信用卡还款', dueAt: '2026-08-10T10:00:00.000Z' }) })).json();
    await (await fetch(`${baseUrl}/v1/bark-settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceKey: 'abc123' }) })).json();
    assert.equal(created.item.id.length > 0, true);

    const result = await hub.runExpiringReminders(new Date('2026-08-13T00:00:00.000Z'));
    assert.equal(result.pushed, 1);
    assert.equal(bark.pushed.length, 1);
    assert.match(bark.pushed[0].title, /到期提醒/);
    assert.match(bark.pushed[0].body, /信用卡还款 · \d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
    assert.doesNotMatch(bark.pushed[0].body, /T\d{2}:\d{2}:\d{2}/);
  }, { barkSettings: bark.barkSettings, barkPusher: bark.barkPusher });
});

test('Bark 未配置时跳过推送但不阻断滚动', async () => {
  const bark = fakeBark();
  await withHub(async ({ baseUrl, hub }) => {
    await (await fetch(`${baseUrl}/v1/expiring-items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '浇花', mode: 'recurring-auto', dueAt: '2026-08-10T10:00:00.000Z', intervalValue: 3, intervalUnit: 'day' }) })).json();
    const result = await hub.runExpiringReminders(new Date('2026-08-13T00:00:00.000Z'));
    assert.equal(result.pushed, 0);
    assert.equal(bark.pushed.length, 0);
  }, { barkSettings: bark.barkSettings, barkPusher: bark.barkPusher });
});

test('单次提醒只推送一次，之后不再重复', async () => {
  const bark = fakeBark();
  await withHub(async ({ baseUrl, hub }) => {
    await (await fetch(`${baseUrl}/v1/expiring-items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '体检', dueAt: '2026-08-10T10:00:00.000Z' }) })).json();
    await (await fetch(`${baseUrl}/v1/bark-settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceKey: 'abc123' }) })).json();

    const first = await hub.runExpiringReminders(new Date('2026-08-13T00:00:00.000Z'));
    assert.equal(first.pushed, 1);
    assert.equal(bark.pushed.length, 1);
    const items = (await (await fetch(`${baseUrl}/v1/expiring-items`)).json()).items;
    assert.equal(items.find((item) => item.name === '体检').reminderStatus, 'notified');

    const second = await hub.runExpiringReminders(new Date('2026-08-13T00:01:00.000Z'));
    assert.equal(second.pushed, 0);
    assert.equal(bark.pushed.length, 1);
  }, { barkSettings: bark.barkSettings, barkPusher: bark.barkPusher });
});

test('编辑已通知的到期项后重置提醒并重新推送', async () => {
  const bark = fakeBark();
  await withHub(async ({ baseUrl, hub }) => {
    const created = await (await fetch(`${baseUrl}/v1/expiring-items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '体检', dueAt: '2026-08-10T10:00:00.000Z' }) })).json();
    await (await fetch(`${baseUrl}/v1/bark-settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceKey: 'abc123' }) })).json();
    await hub.runExpiringReminders(new Date('2026-08-13T00:00:00.000Z'));
    let item = (await (await fetch(`${baseUrl}/v1/expiring-items`)).json()).items.find((entry) => entry.id === created.item.id);
    assert.equal(item.reminderStatus, 'notified');

    const restart = await fetch(`${baseUrl}/v1/expiring-items/${created.item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '体检（改期）', dueAt: '2026-09-20T10:00:00.000Z' }) });
    assert.equal(restart.status, 200);
    item = (await (await fetch(`${baseUrl}/v1/expiring-items`)).json()).items.find((entry) => entry.id === created.item.id);
    assert.equal(item.name, '体检（改期）');
    assert.equal(item.remindedAt, null);
    assert.equal(item.reminderStatus, 'upcoming');

    await hub.runExpiringReminders(new Date('2026-09-20T10:00:01.000Z'));
    assert.equal(bark.pushed.length, 2);
  }, { barkSettings: bark.barkSettings, barkPusher: bark.barkPusher });
});

test('编辑到期项可切换为周期模式并按新模式执行', async () => {
  await withHub(async ({ baseUrl }) => {
    const created = await (await fetch(`${baseUrl}/v1/expiring-items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '体检', dueAt: '2026-08-10T10:00:00.000Z' }) })).json();
    const edit = await fetch(`${baseUrl}/v1/expiring-items/${created.item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'recurring-auto', dueAt: '2026-09-10T10:00:00.000Z', intervalValue: 3, intervalUnit: 'day' }) });
    assert.equal(edit.status, 200);
    const item = (await (await fetch(`${baseUrl}/v1/expiring-items`)).json()).items.find((entry) => entry.id === created.item.id);
    assert.equal(item.mode, 'recurring-auto');
    assert.equal(item.intervalValue, 3);
    assert.equal(item.intervalUnit, 'day');
    assert.equal(item.remindedAt, null);
  });
});

test('周期滚动项开始时间在过去时滚动到未来周期', async () => {
  await withHub(async ({ baseUrl }) => {
    const created = await (await fetch(`${baseUrl}/v1/expiring-items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '续费', mode: 'recurring-auto', dueAt: '2026-07-31T00:00:00.000Z', intervalValue: 30, intervalUnit: 'day' }) })).json();
    assert.equal(created.item.dueAt, '2026-08-30T00:00:00.000Z');
    assert.equal(created.item.nextAt, '2026-08-30T00:00:00.000Z');
    assert.equal(created.item.reminderStatus, 'upcoming');
  });
});

test('编辑为周期滚动且开始时间在过去时不立即推送', async () => {
  const bark = fakeBark();
  await withHub(async ({ baseUrl, hub }) => {
    const created = await (await fetch(`${baseUrl}/v1/expiring-items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '续费', dueAt: '2026-08-31T00:00:00.000Z' }) })).json();
    await (await fetch(`${baseUrl}/v1/bark-settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceKey: 'abc123' }) })).json();
    const edit = await fetch(`${baseUrl}/v1/expiring-items/${created.item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'recurring-auto', dueAt: '2026-07-31T00:00:00.000Z', intervalValue: 30, intervalUnit: 'day' }) });
    assert.equal(edit.status, 200);
    const item = (await (await fetch(`${baseUrl}/v1/expiring-items`)).json()).items.find((entry) => entry.id === created.item.id);
    assert.equal(item.dueAt, '2026-08-30T00:00:00.000Z');
    assert.equal(item.reminderStatus, 'upcoming');
    await hub.runExpiringReminders(new Date('2026-08-13T00:00:00.000Z'));
    assert.equal(bark.pushed.length, 0);
  }, { barkSettings: bark.barkSettings, barkPusher: bark.barkPusher });
});

test('到期项可保存并更新备注，推送包含备注', async () => {
  const bark = fakeBark();
  await withHub(async ({ baseUrl, hub }) => {
    const created = await (await fetch(`${baseUrl}/v1/expiring-items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '体检', dueAt: '2026-08-10T10:00:00.000Z', notes: '空腹前往' }) })).json();
    assert.equal(created.item.notes, '空腹前往');

    const edit = await fetch(`${baseUrl}/v1/expiring-items/${created.item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes: '改到下午' }) });
    assert.equal(edit.status, 200);
    let item = (await (await fetch(`${baseUrl}/v1/expiring-items`)).json()).items.find((entry) => entry.id === created.item.id);
    assert.equal(item.notes, '改到下午');

    await (await fetch(`${baseUrl}/v1/bark-settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceKey: 'abc123' }) })).json();
    await hub.runExpiringReminders(new Date('2026-08-13T00:00:00.000Z'));
    assert.match(bark.pushed[0].body, /体检 · .* · 改到下午/);
  }, { barkSettings: bark.barkSettings, barkPusher: bark.barkPusher });
});
