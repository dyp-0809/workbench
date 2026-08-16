const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');
const { createContentHub } = require('../local-hub/src/content-hub.js');

test('旧日期级到期项迁移为单次模式并保留提前天数', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'x-expiring-migrate-'));
  const dbPath = path.join(directory, 'x-assistant.sqlite');
  const oldDb = new Database(dbPath);
  oldDb.exec(`CREATE TABLE expiring_items (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, due_date TEXT NOT NULL,
    reminder_days INTEGER NOT NULL, notes TEXT NOT NULL, enabled INTEGER NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`);
  oldDb.prepare('INSERT INTO expiring_items(id, name, category, due_date, reminder_days, notes, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run('1', 'VPN 续费', '生活', '2026-09-14', 7, '自动续费提醒', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
  oldDb.close();

  const hub = await createContentHub({ dataDirectory: directory, now: () => new Date('2026-08-13T00:00:00.000Z') });
  const address = await hub.listen(0);
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/expiring-items`);
    const items = (await response.json()).items;
    assert.equal(items.length, 1);
    assert.equal(items[0].mode, 'once');
    assert.equal(items[0].dueAt, '2026-09-14T00:00:00.000Z');
    assert.equal(items[0].advanceValue, 7);
    assert.equal(items[0].advanceUnit, 'day');
    assert.equal(items[0].dueDate, '2026-09-14');
  } finally {
    await hub.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
