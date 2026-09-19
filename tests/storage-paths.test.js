const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { createContentHub } = require('../local-hub/src/content-hub.js');

test('默认数据目录迁移为 workbench 并将旧股票数据迁移到 stock.sqlite', { concurrency: false }, async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'x-assistant-home-'));
  const legacyDirectory = path.join(home, 'Library', 'Application Support', 'X Assistant');
  const workbenchDirectory = path.join(home, 'Library', 'Application Support', 'workbench');
  const legacyDatabasePath = path.join(legacyDirectory, 'x-assistant.sqlite');
  fs.mkdirSync(legacyDirectory, { recursive: true });
  const legacyDb = new Database(legacyDatabasePath);
  legacyDb.exec(`CREATE TABLE stock_positions (
    id TEXT PRIMARY KEY, symbol TEXT NOT NULL, name TEXT NOT NULL,
    market TEXT NOT NULL, quantity REAL NOT NULL, cost_price REAL NOT NULL,
    current_price REAL NOT NULL, notes TEXT NOT NULL, created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL, target_percent REAL, price_updated_at TEXT,
    trailing_pe REAL, forward_pe REAL, market_error TEXT
  )`);
  legacyDb.prepare(`INSERT INTO stock_positions(
    id, symbol, name, market, quantity, cost_price, current_price, notes,
    created_at, updated_at, target_percent, price_updated_at, trailing_pe,
    forward_pe, market_error
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'legacy-position', 'AAPL', '苹果', 'US', 10, 150, 180, '旧数据',
    '2026-08-21T00:00:00.000Z', '2026-08-21T00:00:00.000Z', 20, null, null, null, null
  );
  legacyDb.close();

  const originalHome = process.env.HOME;
  process.env.HOME = home;
  let hub;
  try {
    hub = createContentHub();
    const address = await hub.listen(0);
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/stock-positions`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).positions[0].id, 'legacy-position');
    assert.equal(fs.existsSync(path.join(workbenchDirectory, 'workbench.sqlite')), true);
    assert.equal(fs.existsSync(path.join(workbenchDirectory, 'stock.sqlite')), true);
    assert.equal(fs.existsSync(path.join(workbenchDirectory, 'x-assistant.sqlite')), false);
    assert.equal(fs.existsSync(path.join(workbenchDirectory, 'workbench.sqlite.legacy')), false);
    assert.equal(fs.existsSync(legacyDirectory), false);

    const stockDb = new Database(path.join(workbenchDirectory, 'stock.sqlite'), { readonly: true });
    assert.equal(stockDb.prepare('SELECT COUNT(*) AS count FROM stock_positions').get().count, 1);
    stockDb.close();
    const workbenchDb = new Database(path.join(workbenchDirectory, 'workbench.sqlite'), { readonly: true });
    assert.equal(workbenchDb.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'stock_positions'").get(), undefined);
    workbenchDb.close();
  } finally {
    if (hub) await hub.close();
    process.env.HOME = originalHome;
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('部分迁移目录会保留旧 SQLite 文件但移除运行时旧文件名', { concurrency: false }, async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'x-assistant-partial-home-'));
  const workbenchDirectory = path.join(home, 'Library', 'Application Support', 'workbench');
  const workbenchDatabasePath = path.join(workbenchDirectory, 'workbench.sqlite');
  const legacyDatabasePath = path.join(workbenchDirectory, 'x-assistant.sqlite');
  fs.mkdirSync(workbenchDirectory, { recursive: true });
  new Database(workbenchDatabasePath).close();
  new Database(legacyDatabasePath).close();

  const originalHome = process.env.HOME;
  process.env.HOME = home;
  let hub;
  try {
    hub = createContentHub();
    assert.equal(fs.existsSync(legacyDatabasePath), false);
    assert.equal(fs.existsSync(`${workbenchDatabasePath}.legacy`), true);
  } finally {
    if (hub) await hub.close();
    process.env.HOME = originalHome;
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('工作台旧归档会恢复到服务端对应的股票接口', { concurrency: false }, async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'x-assistant-recovery-home-'));
  const workbenchDirectory = path.join(home, 'Library', 'Application Support', 'workbench');
  const workbenchDatabasePath = path.join(workbenchDirectory, 'workbench.sqlite');
  const archiveDatabasePath = path.join(workbenchDirectory, 'workbench.sqlite.legacy');
  fs.mkdirSync(workbenchDirectory, { recursive: true });
  new Database(workbenchDatabasePath).close();
  const archiveDb = new Database(archiveDatabasePath);
  archiveDb.exec(`CREATE TABLE stock_positions (
    id TEXT PRIMARY KEY, symbol TEXT NOT NULL, name TEXT NOT NULL,
    market TEXT NOT NULL, quantity REAL NOT NULL, cost_price REAL NOT NULL,
    current_price REAL NOT NULL, notes TEXT NOT NULL, created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL, target_percent REAL, price_updated_at TEXT,
    trailing_pe REAL, forward_pe REAL, market_error TEXT
  )`);
  archiveDb.prepare(`INSERT INTO stock_positions(
    id, symbol, name, market, quantity, cost_price, current_price, notes,
    created_at, updated_at, target_percent, price_updated_at, trailing_pe,
    forward_pe, market_error
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'recovered-position', 'NVDA', '英伟达', 'US', 3, 100, 120, '恢复数据',
    '2026-08-21T00:00:00.000Z', '2026-08-21T00:00:00.000Z', 10, null, null, null, null
  );
  archiveDb.close();

  const originalHome = process.env.HOME;
  process.env.HOME = home;
  let hub;
  try {
    hub = createContentHub();
    const address = await hub.listen(0);
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/stock-positions`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).positions[0].id, 'recovered-position');
  } finally {
    if (hub) await hub.close();
    process.env.HOME = originalHome;
    fs.rmSync(home, { recursive: true, force: true });
  }
});
