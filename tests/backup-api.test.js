const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createContentHub } = require('../local-hub/src/content-hub');

test('导出加密备份后需要显式确认才可恢复', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'x-backup-'));
  const hub = createContentHub({ dataDirectory: directory });
  const address = await hub.listen(0);
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await fetch(`${baseUrl}/v1/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: '原任务' }) });
    const backup = await (await fetch(`${baseUrl}/v1/backups/export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'correct-horse-battery-staple' }) })).json();
    assert.equal((await fetch(`${baseUrl}/v1/backups/restore`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archive: backup.archive, password: 'correct-horse-battery-staple' }) })).status, 400);
    assert.equal((await fetch(`${baseUrl}/v1/backups/restore`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archive: backup.archive, password: 'correct-horse-battery-staple', confirmation: 'RESTORE' }) })).status, 200);
  } finally { await hub.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});
