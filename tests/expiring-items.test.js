const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { createContentHub } = require('../local-hub/src/content-hub.js');

test('到期项在提醒阈值到达后显示为需要处理且可续期', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'x-assistant-expiring-'));
  const hub = createContentHub({ dataDirectory: directory, now: () => new Date('2026-08-13T00:00:00.000Z') });
  const address = await hub.listen(0);
  const baseUrl = `http://127.0.0.1:${address.port}/v1/expiring-items`;
  try {
    const created = await (await fetch(baseUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'VPN 续费', dueDate: '2026-08-20', reminderDays: 7 }) })).json();
    assert.equal(created.item.reminderStatus, 'due');
    const renewed = await (await fetch(`${baseUrl}/${created.item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dueDate: '2026-09-20' }) })).json();
    assert.equal(renewed.item.reminderStatus, 'upcoming');
    assert.equal((await fetch(`${baseUrl}/${created.item.id}`, { method: 'DELETE' })).status, 204);
  } finally { await hub.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});
