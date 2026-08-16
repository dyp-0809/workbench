const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { createContentHub } = require('../local-hub/src/content-hub.js');

test('用户可创建、完成、重新打开并删除待办', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'x-assistant-tasks-'));
  const hub = createContentHub({ dataDirectory: directory });
  const address = await hub.listen(0);
  const baseUrl = `http://127.0.0.1:${address.port}/v1/tasks`;
  try {
    const created = await (await fetch(baseUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: '更新 VPN', category: '订阅', dueDate: '2026-08-14' }) })).json();
    assert.equal(created.task.status, 'open');
    const completed = await (await fetch(`${baseUrl}/${created.task.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'completed' }) })).json();
    assert.equal(completed.task.status, 'completed');
    const reopened = await (await fetch(`${baseUrl}/${created.task.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'open' }) })).json();
    assert.equal(reopened.task.status, 'open');
    assert.equal((await fetch(`${baseUrl}/${created.task.id}`, { method: 'DELETE' })).status, 204);
  } finally { await hub.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});
