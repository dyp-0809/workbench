const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { createContentHub } = require('../local-hub/src/content-hub.js');

async function withHub(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'personal-workbench-overseas-'));
  const hub = createContentHub({ dataDirectory: directory });
  const address = await hub.listen(0);
  const baseUrl = `http://127.0.0.1:${address.port}/v1/overseas-items`;
  try { await run(baseUrl); } finally { await hub.close(); fs.rmSync(directory, { recursive: true, force: true }); }
}

async function createItem(baseUrl, input) {
  const response = await fetch(baseUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  return { response, payload: await response.json() };
}

test('用户可维护 VPN、手机卡与银行金融服务', async () => {
  await withHub(async (baseUrl) => {
    const { response: vpnResponse, payload: vpn } = await createItem(baseUrl, { type: 'vpn', name: 'Mullvad', url: 'https://mullvad.net', notes: '备用线路' });
    assert.equal(vpnResponse.status, 201);
    assert.equal(vpn.item.url, 'https://mullvad.net');

    const { payload: sim } = await createItem(baseUrl, { type: 'sim', name: 'T-Mobile', areaCode: '+1', phoneNumber: '5551234567', purchasedAt: '2026-01-15T00:00:00.000Z', planDetails: '无限流量', expiresAt: '2026-12-31T00:00:00.000Z', notes: '自动续费' });
    assert.equal(sim.item.areaCode, '+1');
    assert.equal(sim.item.planDetails, '无限流量');

    const { payload: finance } = await createItem(baseUrl, { type: 'finance', name: 'Wise', purpose: '跨境收款', owned: true, url: 'https://wise.com' });
    assert.equal(finance.item.owned, true);
    assert.equal(finance.item.purpose, '跨境收款');

    const listed = await (await fetch(baseUrl)).json();
    assert.deepEqual(new Set(listed.items.map((item) => item.type)), new Set(['vpn', 'sim', 'finance']));

    const updated = await (await fetch(`${baseUrl}/${sim.item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planDetails: '无限流量，含加拿大漫游' }) })).json();
    assert.equal(updated.item.planDetails, '无限流量,含加拿大漫游');
    assert.equal(updated.item.phoneNumber, '5551234567');

    assert.equal((await fetch(`${baseUrl}/${vpn.item.id}`, { method: 'DELETE' })).status, 204);
    const afterDelete = await (await fetch(baseUrl)).json();
    assert.equal(afterDelete.items.length, 2);
  });
});

test('出海服务拒绝未知类别及缺失名称', async () => {
  await withHub(async (baseUrl) => {
    assert.equal((await createItem(baseUrl, { type: 'unknown', name: '服务' })).response.status, 400);
    assert.equal((await createItem(baseUrl, { type: 'vpn', url: 'https://example.com' })).response.status, 400);
  });
});
