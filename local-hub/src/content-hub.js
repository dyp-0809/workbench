const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const Database = require('better-sqlite3');
const { decryptBackup, encryptBackup } = require('./backup');
const { parseXArchive } = require('./archive-parser');
const { buildObjectiveProfile } = require('./archive-profile');
const { advanceFrom, nextOccurrence } = require('./recurrence');
const { Solar } = require('lunar-javascript');
const { getSafeBarkSettings, pushBarkNotification, writeBarkSettings } = require('./bark');
const { runKindleSync } = require('./kindle-sync');
const { buildDashboardPromptCandidates, dashboardTimeContext, dashboardDateKey } = require('./dashboard-prompts');
const DEFAULT_STOCK_ALERT_RULES = [
  { id: 'attention', level: '注意', uvxyThreshold: 8, marketThreshold: -1, twoDayThreshold: null, message: '波动率明显升温，关注仓位风险', enabled: true },
  { id: 'risk-warning', level: '风险预警', uvxyThreshold: 15, marketThreshold: -2, twoDayThreshold: null, message: '市场风险规避加剧，避免追涨杀跌', enabled: true },
  { id: 'high-risk', level: '高风险', uvxyThreshold: 25, marketThreshold: -3, twoDayThreshold: 30, message: '市场出现显著压力，审视杠杆与集中持仓', enabled: true }
];

const RETENTION_DAYS = 180;
const EXPIRY_GRACE_DAYS = 30;
const MAX_BODY_BYTES = 256 * 1024;
// X 官方归档 ZIP 含全部媒体，体积普遍超过 512MB；上限取 Node Buffer 单对象上限（2^32-1 字节）以内，
// 再大 Buffer.concat 会直接抛 RangeError
const MAX_ARCHIVE_BYTES = 4 * 1024 * 1024 * 1024 - 1;
const DEFAULT_STOCK_SYMBOLS = [
  { symbol: 'AAPL', name: '苹果', market: 'US' },
  { symbol: 'MSFT', name: '微软', market: 'US' },
  { symbol: 'GOOGL', name: '谷歌', market: 'US' },
  { symbol: 'AMZN', name: '亚马逊', market: 'US' },
  { symbol: 'META', name: 'Meta', market: 'US' },
  { symbol: 'NVDA', name: '英伟达', market: 'US' },
  { symbol: 'TSLA', name: '特斯拉', market: 'US' }
];

function createId() {
  return crypto.randomUUID();
}

function asIso(value, fallback = new Date()) {
  const date = value ? new Date(value) : fallback;
  if (!Number.isFinite(date.getTime())) throw new Error('日期无效。');
  return date.toISOString();
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {

    return fallback;
  }
}
function directorySize(directory) {
  if (!directory || !fs.existsSync(directory)) return 0;
  let total = 0;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) total += fs.statSync(full).size;
    }
  };
  walk(directory);
  return total;
}

function normalizeProfile(input = {}, now) {
  return {
    id: 'default',
    identity: String(input.identity || '').trim(),
    audience: String(input.audience || '').trim(),
    themes: Array.isArray(input.themes) ? [...new Set(input.themes.map((item) => String(item).trim()).filter(Boolean))].slice(0, 12) : [],
    perspective: String(input.perspective || '').trim(),
    boundaries: String(input.boundaries || '').trim(),
    language: String(input.language || 'zh').trim() || 'zh',
    tone: String(input.tone || 'direct').trim() || 'direct',
    length: String(input.length || 'short').trim() || 'short',
    updatedAt: asIso(input.updatedAt, now)
  };
}

function retentionFor(createdAt, now) {
  const createdAtTime = new Date(createdAt).getTime();
  const expiresAt = new Date(createdAtTime + RETENTION_DAYS * 86400000).toISOString();
  const purgesAt = new Date(createdAtTime + (RETENTION_DAYS + EXPIRY_GRACE_DAYS) * 86400000).toISOString();
  const age = now.getTime() - createdAtTime;
  if (age < RETENTION_DAYS * 86400000) return { retentionStatus: 'active', readOnly: false, expiresAt, purgesAt };
  if (age < (RETENTION_DAYS + EXPIRY_GRACE_DAYS) * 86400000) return { retentionStatus: 'expired', readOnly: true, expiresAt, purgesAt };
  return { retentionStatus: 'purgeable', readOnly: true, expiresAt, purgesAt };
}
function settleRecurring(dueAt, intervalValue, intervalUnit, advanceValue, advanceUnit, currentIso) {
  let settledDueAt = dueAt;
  let nextAt = advanceFrom(settledDueAt, advanceValue, advanceUnit);
  let guard = 0;
  while (nextAt <= currentIso && guard < 1000) {
    settledDueAt = nextOccurrence(settledDueAt, intervalValue, intervalUnit);
    nextAt = advanceFrom(settledDueAt, advanceValue, advanceUnit);
    guard += 1;
  }
  return { dueAt: settledDueAt, nextAt };
}
function formatDateTime(iso) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return iso;
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function normalizeOperatingDate(value) {
  const date = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T00:00:00.000Z`).toISOString().slice(0, 10) !== date) {
    throw new Error('发布日期无效。');
  }
  return date;
}
function nextOperatingDate(value) {
  const date = new Date(`${normalizeOperatingDate(value)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
function normalizePublishTime(value, label) {
  if (value === null || value === undefined || value === '') return null;
  const time = String(value).trim();
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error(`${label}无效。`);
  return time;
}

function migrateExpiringItems(db) {
  const columns = db.prepare('PRAGMA table_info(expiring_items)').all().map((column) => column.name);
  if (!columns.includes('mode')) {
    db.exec(`
      ALTER TABLE expiring_items ADD COLUMN mode TEXT NOT NULL DEFAULT 'once';
      ALTER TABLE expiring_items ADD COLUMN due_at TEXT;
      ALTER TABLE expiring_items ADD COLUMN interval_value INTEGER;
      ALTER TABLE expiring_items ADD COLUMN interval_unit TEXT;
      ALTER TABLE expiring_items ADD COLUMN advance_value INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE expiring_items ADD COLUMN advance_unit TEXT NOT NULL DEFAULT 'day';
      ALTER TABLE expiring_items ADD COLUMN next_at TEXT;
    `);
    db.prepare("UPDATE expiring_items SET due_at = due_date || 'T00:00:00.000Z', advance_value = reminder_days WHERE due_at IS NULL").run();
  }
  if (!columns.includes('reminded_at')) {
    db.exec('ALTER TABLE expiring_items ADD COLUMN reminded_at TEXT');
  }
}
function migrateStockPositions(db) {
  const columns = db.prepare('PRAGMA table_info(stock_positions)').all().map((column) => column.name);
  if (!columns.includes('target_percent')) {
    db.exec('ALTER TABLE stock_positions ADD COLUMN target_percent REAL');
  }
  if (!columns.includes('price_updated_at')) {
    db.exec('ALTER TABLE stock_positions ADD COLUMN price_updated_at TEXT');
  }
  if (!columns.includes('trailing_pe')) {
    db.exec('ALTER TABLE stock_positions ADD COLUMN trailing_pe REAL');
  }
  if (!columns.includes('forward_pe')) {
    db.exec('ALTER TABLE stock_positions ADD COLUMN forward_pe REAL');
  }
  if (!columns.includes('market_error')) {
    db.exec('ALTER TABLE stock_positions ADD COLUMN market_error TEXT');
  }
}

function migrateStockEntryPlans(db) {
  const columns = db.prepare('PRAGMA table_info(stock_entry_plans)').all().map((column) => column.name);
  if (!columns.includes('current_price')) db.exec('ALTER TABLE stock_entry_plans ADD COLUMN current_price REAL');
  if (!columns.includes('trailing_pe')) db.exec('ALTER TABLE stock_entry_plans ADD COLUMN trailing_pe REAL');
  if (!columns.includes('forward_pe')) db.exec('ALTER TABLE stock_entry_plans ADD COLUMN forward_pe REAL');
  if (!columns.includes('market_status')) db.exec('ALTER TABLE stock_entry_plans ADD COLUMN market_status TEXT');
  if (!columns.includes('market_updated_at')) db.exec('ALTER TABLE stock_entry_plans ADD COLUMN market_updated_at TEXT');
  if (!columns.includes('market_error')) db.exec('ALTER TABLE stock_entry_plans ADD COLUMN market_error TEXT');
}
function migrateContentCandidates(db) {
  const columns = db.prepare('PRAGMA table_info(content_candidates)').all().map((column) => column.name);
  if (!columns.includes('suggested_publish_time')) db.exec('ALTER TABLE content_candidates ADD COLUMN suggested_publish_time TEXT');
  if (!columns.includes('planned_publish_time')) db.exec('ALTER TABLE content_candidates ADD COLUMN planned_publish_time TEXT');
  db.exec('DROP INDEX IF EXISTS content_candidates_unique_planned_time');
}

function migrateGenerationSchedules(db) {
  const timestamp = asIso();
  const migration = db.prepare('INSERT OR IGNORE INTO schema_migrations(name, applied_at) VALUES (?, ?)').run('daily-next-day-generation-at-22', timestamp);
  if (!migration.changes) return;

  const migrate = db.transaction(() => {
    db.prepare("UPDATE weekly_schedules SET time = '22:00', enabled = 1, updated_at = ?").run(timestamp);
    const insert = db.prepare(`INSERT OR IGNORE INTO weekly_schedules(weekday, time, enabled, time_zone, updated_at)
      VALUES (?, '22:00', 1, 'Asia/Shanghai', ?)`);
    for (let weekday = 0; weekday < 7; weekday += 1) insert.run(weekday, timestamp);
  });
  migrate();
}


function seedStockSymbols(db) {
  const timestamp = asIso();
  const insertDefault = db.prepare(`INSERT OR IGNORE INTO stock_symbols(symbol, name, market, is_default, created_at, updated_at)
    VALUES (?, ?, ?, 1, ?, ?)`);
  const insertExisting = db.prepare(`INSERT OR IGNORE INTO stock_symbols(symbol, name, market, is_default, created_at, updated_at)
    SELECT symbol, name, market, 0, created_at, updated_at FROM stock_positions`);
  const seed = db.transaction(() => {
    for (const item of DEFAULT_STOCK_SYMBOLS) insertDefault.run(item.symbol, item.name, item.market, timestamp, timestamp);
    insertExisting.run();
  });
  seed();
}

function initializeSchema(db) {
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS weekly_schedules (
      weekday INTEGER PRIMARY KEY CHECK(weekday BETWEEN 0 AND 6),
      time TEXT NOT NULL,
      enabled INTEGER NOT NULL,
      time_zone TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS generation_runs (
      id TEXT PRIMARY KEY,
      operating_date TEXT NOT NULL,
      trigger_type TEXT NOT NULL CHECK(trigger_type IN ('scheduled', 'catchUp', 'manual')),
      status TEXT NOT NULL CHECK(status IN ('started', 'succeeded', 'failed')),
      error_message TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS preference_overrides (
      preference_key TEXT PRIMARY KEY,
      mode TEXT NOT NULL CHECK(mode IN ('automatic', 'fixed', 'reduced', 'ignored')),
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS stock_alert_rules (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS stock_alert_snapshots (
      symbol TEXT NOT NULL,
      trading_date TEXT NOT NULL,
      change_percent REAL,
      captured_at TEXT NOT NULL,
      PRIMARY KEY(symbol, trading_date)
    );
    CREATE TABLE IF NOT EXISTS stock_alert_deliveries (
      rule_id TEXT NOT NULL,
      trading_date TEXT NOT NULL,
      pushed_at TEXT NOT NULL,
      PRIMARY KEY(rule_id, trading_date)
    );
    CREATE TABLE IF NOT EXISTS extension_tokens (
      token_hash TEXT PRIMARY KEY,
      extension_origin TEXT NOT NULL,
      created_at TEXT NOT NULL,
      revoked_at TEXT
    );
    CREATE TABLE IF NOT EXISTS materials (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      topic TEXT NOT NULL,
      may_quote_verbatim INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived_at TEXT
    );
    CREATE TABLE IF NOT EXISTS personal_tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      notes TEXT NOT NULL,
      category TEXT NOT NULL,
      due_date TEXT,
      status TEXT NOT NULL CHECK(status IN ('open', 'completed')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS expiring_items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      due_date TEXT NOT NULL,
      reminder_days INTEGER NOT NULL CHECK(reminder_days >= 0),
      notes TEXT NOT NULL,
      enabled INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'once',
      due_at TEXT,
      interval_value INTEGER,
      interval_unit TEXT,
      advance_value INTEGER NOT NULL DEFAULT 0,
      advance_unit TEXT NOT NULL DEFAULT 'day',
      next_at TEXT,
      reminded_at TEXT
    );
    CREATE TABLE IF NOT EXISTS content_packs (
      id TEXT PRIMARY KEY,
      trigger_type TEXT NOT NULL CHECK(trigger_type IN ('manual', 'scheduled', 'catchUp')),
      operating_date TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS scheduled_content_pack_per_day
      ON content_packs(operating_date, trigger_type)
      WHERE trigger_type IN ('scheduled', 'catchUp') AND operating_date IS NOT NULL;
    CREATE TABLE IF NOT EXISTS content_candidates (
      id TEXT PRIMARY KEY,
      pack_id TEXT NOT NULL REFERENCES content_packs(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      topic TEXT NOT NULL,
      format TEXT NOT NULL,
      language TEXT NOT NULL,
      tone TEXT NOT NULL,
      recommendation TEXT NOT NULL CHECK(recommendation IN ('recommended', 'explore')),
      source_material_ids TEXT NOT NULL DEFAULT '[]',
      suggested_publish_time TEXT,
      planned_publish_time TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS candidate_events (
      id TEXT PRIMARY KEY,
      candidate_id TEXT NOT NULL REFERENCES content_candidates(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL CHECK(event_type IN ('selected', 'copied', 'queued', 'published')),
      created_at TEXT NOT NULL,
      UNIQUE(candidate_id, event_type)
    );
    CREATE TABLE IF NOT EXISTS content_feedback_archive (
      id TEXT PRIMARY KEY,
      candidate_id TEXT UNIQUE REFERENCES content_candidates(id) ON DELETE SET NULL,
      content TEXT NOT NULL,
      topic TEXT NOT NULL,
      format TEXT NOT NULL,
      language TEXT NOT NULL,
      tone TEXT NOT NULL,
      operating_date TEXT,
      planned_publish_time TEXT,
      performance TEXT NOT NULL CHECK(performance IN ('pending', 'good', 'poor')),
      archived_at TEXT NOT NULL,
      assessed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS reply_sessions (
      id TEXT PRIMARY KEY,
      target_post_text TEXT NOT NULL,
      source_kind TEXT NOT NULL CHECK(source_kind IN ('clipboard', 'manualInput', 'xPage')),
      source_url TEXT,
      language TEXT NOT NULL,
      style TEXT NOT NULL,
      human_tone INTEGER NOT NULL,
      analysis TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reply_drafts (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES reply_sessions(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      translation TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reply_draft_events (
      id TEXT PRIMARY KEY,
      draft_id TEXT NOT NULL REFERENCES reply_drafts(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL CHECK(event_type IN ('selected', 'copied', 'queued')),
      created_at TEXT NOT NULL,
      UNIQUE(draft_id, event_type)
    );
    CREATE TABLE IF NOT EXISTS archive_imports (
      id TEXT PRIMARY KEY,
      account_id TEXT,
      tweet_count INTEGER NOT NULL,
      following_count INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS archive_profiles (
      import_id TEXT PRIMARY KEY REFERENCES archive_imports(id),
      objective TEXT NOT NULL,
      semantic TEXT,
      sample_tweets TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS stock_positions (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      name TEXT NOT NULL,
      market TEXT NOT NULL CHECK(market IN ('US', 'HK', 'CN')),
      quantity REAL NOT NULL,
      cost_price REAL NOT NULL,
      current_price REAL NOT NULL,
      notes TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      target_percent REAL,
      price_updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS stock_entry_plans (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      name TEXT NOT NULL,
      market TEXT NOT NULL CHECK(market IN ('US', 'HK', 'CN')),
      entry_price REAL NOT NULL,
      target_percent REAL,
      notes TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      current_price REAL,
      trailing_pe REAL,
      forward_pe REAL,
      market_status TEXT,
      market_updated_at TEXT,
      market_error TEXT
    );
    CREATE TABLE IF NOT EXISTS stock_settings (
      id TEXT PRIMARY KEY,
      total_assets REAL NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS stock_symbols (
      symbol TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      market TEXT NOT NULL CHECK(market IN ('US', 'HK', 'CN')),
      is_default INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS menstrual_cycles (
      id TEXT PRIMARY KEY,
      start_date TEXT NOT NULL,
      end_date TEXT,
      flow TEXT NOT NULL CHECK(flow IN ('light', 'medium', 'heavy')),
      symptoms TEXT NOT NULL,
      notes TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS menstrual_mood_logs (
      id TEXT PRIMARY KEY,
      logged_on TEXT NOT NULL UNIQUE,
      mood INTEGER NOT NULL CHECK(mood BETWEEN 1 AND 5),
      notes TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  migrateExpiringItems(db);
  migrateStockPositions(db);
  migrateGenerationSchedules(db);
  migrateStockEntryPlans(db);
  migrateContentCandidates(db);
  seedStockSymbols(db);
}
function createContentHub(options = {}) {
  const now = options.now || (() => new Date());
  const dataDirectory = options.dataDirectory || path.join(process.env.HOME || process.cwd(), 'Library', 'Application Support', 'X Assistant');
  const staticDirectory = options.staticDirectory ? path.resolve(options.staticDirectory) : null;
  const generator = options.generator;
  const modelSettings = options.modelSettings;
  const semanticExtractor = options.semanticExtractor;
  const barkSettings = options.barkSettings;
  const barkPusher = options.barkPusher;
  const finnhubSettings = options.finnhubSettings;
  const quoteFetcher = options.quoteFetcher;
  const valuationFetcher = options.valuationFetcher;
  const kindleSync = typeof options.kindleSync === 'function' ? options.kindleSync : runKindleSync;
  fs.mkdirSync(dataDirectory, { recursive: true });
  const databasePath = path.join(dataDirectory, 'x-assistant.sqlite');
  const db = new Database(databasePath);
  initializeSchema(db);
  const backupDirectory = path.join(dataDirectory, 'backups');
  fs.mkdirSync(backupDirectory, { recursive: true });
  let retentionNow = now();
  let expiringNow = null;
  let server;
  let pairing;

  function tokenHash(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  function pairingCode() {
    const currentTime = now().getTime();
    if (!pairing || pairing.expiresAt <= currentTime) {
      pairing = { code: String(crypto.randomInt(100000, 1000000)), expiresAt: currentTime + 5 * 60 * 1000 };
    }
    return { code: pairing.code, expiresAt: new Date(pairing.expiresAt).toISOString() };
  }

  function createExtensionToken(origin, code) {
    if (!origin?.startsWith('chrome-extension://') || !pairing || pairing.expiresAt < now().getTime() || code !== pairing.code) {
      throw new Error('配对码无效或已过期。');
    }
    const token = crypto.randomBytes(32).toString('base64url');
    db.prepare('INSERT INTO extension_tokens(token_hash, extension_origin, created_at, revoked_at) VALUES (?, ?, ?, NULL)')
      .run(tokenHash(token), origin, asIso(undefined, now()));
    pairing = null;
    return { token };
  }

  function isAuthorizedExtension(request) {
    const origin = request.headers.origin;
    if (!origin?.startsWith('chrome-extension://')) return true;
    const token = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '');
    return Boolean(token && db.prepare('SELECT token_hash FROM extension_tokens WHERE token_hash = ? AND extension_origin = ? AND revoked_at IS NULL').get(tokenHash(token), origin));
  }

  function getProfile() {
    const row = db.prepare('SELECT payload FROM profiles WHERE id = ?').get('default');
    return row ? normalizeProfile(parseJson(row.payload, {}), new Date()) : normalizeProfile({}, new Date());
  }

  function setProfile(input) {
    const profile = normalizeProfile(input, now());
    db.prepare(`INSERT INTO profiles(id, payload, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`)
      .run('default', JSON.stringify(profile), profile.updatedAt);
    return profile;
  }

  function listMaterials() {
    return db.prepare(`SELECT id, content, topic, may_quote_verbatim, created_at, updated_at, archived_at
      FROM materials ORDER BY archived_at IS NOT NULL, updated_at DESC`).all().map((row) => ({
      id: row.id,
      content: row.content,
      topic: row.topic,
      mayQuoteVerbatim: Boolean(row.may_quote_verbatim),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      archivedAt: row.archived_at
    }));
  }

  function createMaterial(input) {
    const content = String(input.content || '').trim();
    const topic = String(input.topic || '').trim();
    if (!content || !topic) throw new Error('素材内容和主题不能为空。');
    const timestamp = asIso(undefined, now());
    const material = { id: createId(), content, topic, mayQuoteVerbatim: Boolean(input.mayQuoteVerbatim), createdAt: timestamp, updatedAt: timestamp, archivedAt: null };
    db.prepare(`INSERT INTO materials(id, content, topic, may_quote_verbatim, created_at, updated_at, archived_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(material.id, material.content, material.topic, Number(material.mayQuoteVerbatim), timestamp, timestamp, null);
    return material;
  }

  function materialCount() {
    return db.prepare('SELECT COUNT(*) AS count FROM materials WHERE archived_at IS NULL').get().count;
  }

  function mapTask(row) {
    return { id: row.id, title: row.title, notes: row.notes, category: row.category, dueDate: row.due_date, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at, completedAt: row.completed_at };
  }

  function listTasks(status) {
    const validStatus = status === 'completed' ? 'completed' : status === 'all' ? null : 'open';
    const rows = validStatus
      ? db.prepare('SELECT * FROM personal_tasks WHERE status = ? ORDER BY due_date IS NULL, due_date, created_at').all(validStatus)
      : db.prepare('SELECT * FROM personal_tasks ORDER BY status, due_date IS NULL, due_date, created_at').all();
    return rows.map(mapTask);
  }

  function createTask(input) {
    const title = String(input.title || '').trim();
    if (!title) throw new Error('待办标题不能为空。');
    const dueDate = input.dueDate ? String(input.dueDate) : null;
    if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new Error('截止日期必须是有效日期。');
    const timestamp = asIso(undefined, now());
    const task = { id: createId(), title, notes: String(input.notes || '').trim(), category: String(input.category || '').trim(), dueDate, status: 'open', createdAt: timestamp, updatedAt: timestamp, completedAt: null };
    db.prepare('INSERT INTO personal_tasks(id, title, notes, category, due_date, status, created_at, updated_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(task.id, task.title, task.notes, task.category, task.dueDate, task.status, timestamp, timestamp, null);
    return task;
  }

  function updateTask(id, input) {
    const existing = db.prepare('SELECT * FROM personal_tasks WHERE id = ?').get(id);
    if (!existing) return null;
    const status = ['open', 'completed'].includes(input.status) ? input.status : existing.status;
    const timestamp = asIso(undefined, now());
    db.prepare('UPDATE personal_tasks SET status = ?, updated_at = ?, completed_at = ? WHERE id = ?')
      .run(status, timestamp, status === 'completed' ? timestamp : null, id);
    return mapTask(db.prepare('SELECT * FROM personal_tasks WHERE id = ?').get(id));
  }

  function deleteTask(id) {
    return db.prepare('DELETE FROM personal_tasks WHERE id = ?').run(id).changes > 0;
  }

function normalizeCycleDate(value, label, { optional = false } = {}) {
  if (optional && (value === undefined || value === null || value === '')) return null;
  const date = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`${label}必须是有效日期。`);
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error(`${label}必须是有效日期。`);
  return date;
}

function normalizeCycleFlow(value, fallback = 'medium') {
  if (value === undefined || value === null || value === '') return fallback;
  if (!['light', 'medium', 'heavy'].includes(value)) throw new Error('经量必须是少量、适中或较多。');
  return value;
}

function mapMenstrualCycle(row) {
  return {
    id: row.id,
    startDate: row.start_date,
    endDate: row.end_date,
    flow: row.flow,
    symptoms: row.symptoms,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function listMenstrualCycles() {
  return db.prepare('SELECT * FROM menstrual_cycles ORDER BY start_date DESC, created_at DESC').all().map(mapMenstrualCycle);
}


function getMenstrualSettings() {
  const row = db.prepare("SELECT mode FROM preference_overrides WHERE preference_key = 'privacy:menstrual'").get();
  return { menstrualEnabled: row ? row.mode === 'fixed' : true };
}

function setMenstrualSettings(input) {
  const enabled = input?.menstrualEnabled === true;
  setPreferenceOverride({ key: 'privacy:menstrual', mode: enabled ? 'fixed' : 'ignored' });
  return getMenstrualSettings();
}

function createMenstrualCycle(input) {
  const startDate = normalizeCycleDate(input.startDate, '开始日期');
  const endDate = normalizeCycleDate(input.endDate, '结束日期', { optional: true });
  if (endDate && endDate < startDate) throw new Error('结束日期不能早于开始日期。');
  const timestamp = asIso(undefined, now());
  const cycle = {
    id: createId(),
    startDate,
    endDate,
    flow: normalizeCycleFlow(input.flow),
    symptoms: String(input.symptoms || '').trim(),
    notes: String(input.notes || '').trim(),
    createdAt: timestamp,
    updatedAt: timestamp
  };
  db.prepare('INSERT INTO menstrual_cycles(id, start_date, end_date, flow, symptoms, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(cycle.id, cycle.startDate, cycle.endDate, cycle.flow, cycle.symptoms, cycle.notes, timestamp, timestamp);
  return cycle;
}

function updateMenstrualCycle(id, input) {
  const existing = db.prepare('SELECT * FROM menstrual_cycles WHERE id = ?').get(id);
  if (!existing) return null;
  const startDate = input.startDate === undefined ? existing.start_date : normalizeCycleDate(input.startDate, '开始日期');
  const endDate = input.endDate === undefined ? existing.end_date : normalizeCycleDate(input.endDate, '结束日期', { optional: true });
  if (endDate && endDate < startDate) throw new Error('结束日期不能早于开始日期。');
  const flow = input.flow === undefined ? existing.flow : normalizeCycleFlow(input.flow);
  const symptoms = typeof input.symptoms === 'string' ? input.symptoms.trim() : existing.symptoms;
  const notes = typeof input.notes === 'string' ? input.notes.trim() : existing.notes;
  const timestamp = asIso(undefined, now());
  db.prepare('UPDATE menstrual_cycles SET start_date = ?, end_date = ?, flow = ?, symptoms = ?, notes = ?, updated_at = ? WHERE id = ?')
    .run(startDate, endDate, flow, symptoms, notes, timestamp, id);
  return mapMenstrualCycle(db.prepare('SELECT * FROM menstrual_cycles WHERE id = ?').get(id));
}

function deleteMenstrualCycle(id) {
  return db.prepare('DELETE FROM menstrual_cycles WHERE id = ?').run(id).changes > 0;
}
function normalizeMood(value) {
  const mood = Number(value);
  if (!Number.isInteger(mood) || mood < 1 || mood > 5) throw new Error('情绪评分必须在 1 到 5 之间。');
  return mood;
}

function mapMenstrualMoodLog(row) {
  return {
    id: row.id,
    loggedOn: row.logged_on,
    mood: row.mood,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function listMenstrualMoodLogs() {
  return db.prepare('SELECT * FROM menstrual_mood_logs ORDER BY logged_on DESC, created_at DESC').all().map(mapMenstrualMoodLog);
}

function assertMoodLogDateAvailable(loggedOn, excludedId) {
  const existing = excludedId
    ? db.prepare('SELECT id FROM menstrual_mood_logs WHERE logged_on = ? AND id != ?').get(loggedOn, excludedId)
    : db.prepare('SELECT id FROM menstrual_mood_logs WHERE logged_on = ?').get(loggedOn);
  if (existing) throw new Error('当天已有情绪记录，请编辑该记录。');
}

function createMenstrualMoodLog(input) {
  const loggedOn = normalizeCycleDate(input.loggedOn, '记录日期');
  assertMoodLogDateAvailable(loggedOn);
  const timestamp = asIso(undefined, now());
  const moodLog = {
    id: createId(),
    loggedOn,
    mood: normalizeMood(input.mood),
    notes: String(input.notes || '').trim(),
    createdAt: timestamp,
    updatedAt: timestamp
  };
  db.prepare('INSERT INTO menstrual_mood_logs(id, logged_on, mood, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(moodLog.id, moodLog.loggedOn, moodLog.mood, moodLog.notes, timestamp, timestamp);
  return moodLog;
}

function updateMenstrualMoodLog(id, input) {
  const existing = db.prepare('SELECT * FROM menstrual_mood_logs WHERE id = ?').get(id);
  if (!existing) return null;
  const loggedOn = input.loggedOn === undefined ? existing.logged_on : normalizeCycleDate(input.loggedOn, '记录日期');
  assertMoodLogDateAvailable(loggedOn, id);
  const mood = input.mood === undefined ? existing.mood : normalizeMood(input.mood);
  const notes = typeof input.notes === 'string' ? input.notes.trim() : existing.notes;
  const timestamp = asIso(undefined, now());
  db.prepare('UPDATE menstrual_mood_logs SET logged_on = ?, mood = ?, notes = ?, updated_at = ? WHERE id = ?')
    .run(loggedOn, mood, notes, timestamp, id);
  return mapMenstrualMoodLog(db.prepare('SELECT * FROM menstrual_mood_logs WHERE id = ?').get(id));
}

function deleteMenstrualMoodLog(id) {
  return db.prepare('DELETE FROM menstrual_mood_logs WHERE id = ?').run(id).changes > 0;
}


function normalizeStockSymbol(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeStockNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label}必须是数字。`);
  return number;
}

  function normalizeTargetPercent(value) {
    if (value === undefined || value === null || value === '') return null;
    const number = normalizeStockNumber(value, '目标仓位');
    if (number < 0 || number > 100) throw new Error('目标仓位必须在 0 到 100 之间。');
    return number;
  }

  function mapStockPosition(row) {
    return { id: row.id, symbol: row.symbol, name: row.name, market: row.market, quantity: row.quantity, costPrice: row.cost_price, currentPrice: row.current_price, targetPercent: row.target_percent, notes: row.notes, createdAt: row.created_at, updatedAt: row.updated_at, priceUpdatedAt: row.price_updated_at, trailingPE: row.trailing_pe, forwardPE: row.forward_pe, valuationError: row.market_error };
  }

  function listStockPositions() {
  return db.prepare('SELECT * FROM stock_positions ORDER BY created_at').all().map(mapStockPosition);
}

function mapStockSymbol(row) {
  return { symbol: row.symbol, name: row.name, market: row.market, isDefault: Boolean(row.is_default) };
}

function listStockSymbols() {
  return db.prepare('SELECT * FROM stock_symbols ORDER BY is_default DESC, updated_at DESC, symbol COLLATE NOCASE').all().map(mapStockSymbol);
}

function upsertStockSymbol(input) {
  const symbol = normalizeStockSymbol(input.symbol);
  const name = String(input.name || '').trim();
  const market = ['US', 'HK', 'CN'].includes(input.market) ? input.market : null;
  if (!symbol || !name || !market) return null;
  const timestamp = asIso(undefined, now());
  db.prepare(`INSERT INTO stock_symbols(symbol, name, market, is_default, created_at, updated_at)
    VALUES (?, ?, ?, 0, ?, ?)
    ON CONFLICT(symbol) DO UPDATE SET name = excluded.name, market = excluded.market, updated_at = excluded.updated_at`)
    .run(symbol, name, market, timestamp, timestamp);
  return { symbol, name, market };
}

function mapStockEntryPlan(row) {
  return {
    id: row.id,
    symbol: row.symbol,
    name: row.name,
    market: row.market,
    entryPrice: row.entry_price,
    targetPercent: row.target_percent,
    notes: row.notes,
    currentPrice: row.current_price,
    trailingPE: row.trailing_pe,
    forwardPE: row.forward_pe,
    marketStatus: row.market_status,
    marketUpdatedAt: row.market_updated_at,
    marketError: row.market_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function listStockEntryPlans() {
  return db.prepare('SELECT * FROM stock_entry_plans ORDER BY created_at').all().map(mapStockEntryPlan);
}

function createStockEntryPlan(input) {
  const symbol = normalizeStockSymbol(input.symbol);
  const name = String(input.name || '').trim();
  const market = ['US', 'HK', 'CN'].includes(input.market) ? input.market : null;
  if (!symbol) throw new Error('股票代码不能为空。');
  if (!name) throw new Error('股票名称不能为空。');
  if (!market) throw new Error('市场必须是 US、HK 或 CN。');
  const entryPrice = normalizeStockNumber(input.entryPrice, '开仓位置');
  if (entryPrice < 0) throw new Error('开仓位置不能为负数。');
  const targetPercent = normalizeTargetPercent(input.targetPercent);
  const timestamp = asIso(undefined, now());
  const plan = { id: createId(), symbol, name, market, entryPrice, targetPercent, notes: String(input.notes || '').trim(), createdAt: timestamp, updatedAt: timestamp };
  db.prepare('INSERT INTO stock_entry_plans(id, symbol, name, market, entry_price, target_percent, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(plan.id, plan.symbol, plan.name, plan.market, plan.entryPrice, plan.targetPercent, plan.notes, timestamp, timestamp);
  upsertStockSymbol(plan);
  return plan;
}

function updateStockEntryPlan(id, input) {
  const existing = db.prepare('SELECT * FROM stock_entry_plans WHERE id = ?').get(id);
  if (!existing) return null;
  const symbol = typeof input.symbol === 'string' && input.symbol.trim() ? normalizeStockSymbol(input.symbol) : existing.symbol;
  const name = typeof input.name === 'string' && input.name.trim() ? input.name.trim() : existing.name;
  const market = ['US', 'HK', 'CN'].includes(input.market) ? input.market : existing.market;
  const entryPrice = input.entryPrice === undefined ? existing.entry_price : normalizeStockNumber(input.entryPrice, '开仓位置');
  if (entryPrice < 0) throw new Error('开仓位置不能为负数。');
  const targetPercent = input.targetPercent === undefined ? existing.target_percent : normalizeTargetPercent(input.targetPercent);
    const notes = typeof input.notes === 'string' ? input.notes.trim() : existing.notes;
    const cacheInvalidated = symbol !== existing.symbol || market !== existing.market;
    const currentPrice = cacheInvalidated ? null : existing.current_price;
    const trailingPE = cacheInvalidated ? null : existing.trailing_pe;
    const forwardPE = cacheInvalidated ? null : existing.forward_pe;
    const marketUpdatedAt = cacheInvalidated ? null : existing.market_updated_at;
    const marketError = cacheInvalidated ? null : existing.market_error;
    const marketStatus = cacheInvalidated ? null : (currentPrice !== null && currentPrice !== undefined ? (currentPrice <= entryPrice ? 'openable' : 'waiting') : existing.market_status);
    const timestamp = asIso(undefined, now());
    db.prepare('UPDATE stock_entry_plans SET symbol = ?, name = ?, market = ?, entry_price = ?, target_percent = ?, notes = ?, current_price = ?, trailing_pe = ?, forward_pe = ?, market_status = ?, market_updated_at = ?, market_error = ?, updated_at = ? WHERE id = ?')
      .run(symbol, name, market, entryPrice, targetPercent, notes, currentPrice, trailingPE, forwardPE, marketStatus, marketUpdatedAt, marketError, timestamp, id);
  upsertStockSymbol({ symbol, name, market });
  return mapStockEntryPlan(db.prepare('SELECT * FROM stock_entry_plans WHERE id = ?').get(id));
}

function deleteStockEntryPlan(id) {
  return db.prepare('DELETE FROM stock_entry_plans WHERE id = ?').run(id).changes > 0;
}

async function moveStockEntryPlanToPosition(id, input) {
  const plan = db.prepare('SELECT * FROM stock_entry_plans WHERE id = ?').get(id);
  if (!plan) return null;
  const quantity = normalizeStockNumber(input.quantity, '持仓数量');
  const costPrice = input.costPrice === undefined ? plan.entry_price : normalizeStockNumber(input.costPrice, '成本价');
  if (quantity <= 0) throw new Error('持仓数量必须大于 0。');
  if (costPrice < 0) throw new Error('成本价不能为负数。');
  const position = await createStockPosition({
    symbol: plan.symbol,
    name: plan.name,
    market: plan.market,
    quantity,
    costPrice,
    targetPercent: input.targetPercent === undefined ? plan.target_percent : input.targetPercent,
    notes: typeof input.notes === 'string' ? input.notes : plan.notes
  });
  deleteStockEntryPlan(id);
  return { position, plan: mapStockEntryPlan(plan) };
}

async function createStockPosition(input) {
  const symbol = normalizeStockSymbol(input.symbol);
    const name = String(input.name || '').trim();
    const market = ['US', 'HK', 'CN'].includes(input.market) ? input.market : null;
    if (!symbol) throw new Error('股票代码不能为空。');
    if (!name) throw new Error('股票名称不能为空。');
    if (!market) throw new Error('市场必须是 US、HK 或 CN。');
    const quantity = normalizeStockNumber(input.quantity, '持仓数量');
    const costPrice = normalizeStockNumber(input.costPrice, '成本价');
    if (quantity <= 0) throw new Error('持仓数量必须大于 0。');
    if (costPrice < 0) throw new Error('成本价不能为负数。');
    const targetPercent = normalizeTargetPercent(input.targetPercent);
    const timestamp = asIso(undefined, now());
    let currentPrice = 0;
    let priceUpdatedAt = null;
    if (market === 'US') {
      if (typeof quoteFetcher !== 'function') throw new Error('Finnhub 行情服务不可用。');
      const quote = await quoteFetcher(symbol);
      currentPrice = normalizeStockNumber(quote.currentPrice, 'Finnhub 现价');
      if (currentPrice <= 0) throw new Error('Finnhub 未返回有效现价。');
      priceUpdatedAt = quote.quotedAt || timestamp;
    }
    const position = { id: createId(), symbol, name, market, quantity, costPrice, currentPrice, targetPercent, notes: String(input.notes || '').trim(), createdAt: timestamp, updatedAt: timestamp, priceUpdatedAt };
    db.prepare('INSERT INTO stock_positions(id, symbol, name, market, quantity, cost_price, current_price, target_percent, notes, created_at, updated_at, price_updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(position.id, position.symbol, position.name, position.market, position.quantity, position.costPrice, position.currentPrice, position.targetPercent, position.notes, timestamp, timestamp, position.priceUpdatedAt);
    upsertStockSymbol(position);
    return position;
  }

  function updateStockPosition(id, input) {
    const existing = db.prepare('SELECT * FROM stock_positions WHERE id = ?').get(id);
    if (!existing) return null;
    const symbol = typeof input.symbol === 'string' && input.symbol.trim() ? normalizeStockSymbol(input.symbol) : existing.symbol;
    const name = typeof input.name === 'string' && input.name.trim() ? input.name.trim() : existing.name;
    const market = ['US', 'HK', 'CN'].includes(input.market) ? input.market : existing.market;
    const quantity = input.quantity === undefined ? existing.quantity : normalizeStockNumber(input.quantity, '持仓数量');
    const costPrice = input.costPrice === undefined ? existing.cost_price : normalizeStockNumber(input.costPrice, '成本价');
    const currentPrice = input.currentPrice === undefined ? existing.current_price : normalizeStockNumber(input.currentPrice, '现价');
    if (quantity <= 0) throw new Error('持仓数量必须大于 0。');
    if (costPrice < 0 || currentPrice < 0) throw new Error('价格不能为负数。');
    const notes = typeof input.notes === 'string' ? input.notes.trim() : existing.notes;
    const targetPercent = input.targetPercent === undefined ? existing.target_percent : normalizeTargetPercent(input.targetPercent);
    const timestamp = asIso(undefined, now());
    db.prepare('UPDATE stock_positions SET symbol = ?, name = ?, market = ?, quantity = ?, cost_price = ?, current_price = ?, target_percent = ?, notes = ?, updated_at = ? WHERE id = ?')
      .run(symbol, name, market, quantity, costPrice, currentPrice, targetPercent, notes, timestamp, id);
    upsertStockSymbol({ symbol, name, market });
    return mapStockPosition(db.prepare('SELECT * FROM stock_positions WHERE id = ?').get(id));
  }

  function deleteStockPosition(id) {
    return db.prepare('DELETE FROM stock_positions WHERE id = ?').run(id).changes > 0;
  }

  async function refreshStockPrices() {
    if (typeof quoteFetcher !== 'function') throw new Error('Finnhub 行情服务不可用。');
    const positions = listStockPositions();
    const skipped = positions.filter((position) => position.market !== 'US').map((position) => ({ id: position.id, symbol: position.symbol, reason: '当前仅支持刷新美股行情。' }));
    const usPositions = positions.filter((position) => position.market === 'US');
    const quotesBySymbol = new Map();
    for (const position of usPositions) {
      if (!quotesBySymbol.has(position.symbol)) quotesBySymbol.set(position.symbol, await quoteFetcher(position.symbol));
    }
    const timestamp = asIso(undefined, now());
    const update = db.prepare('UPDATE stock_positions SET current_price = ?, trailing_pe = ?, forward_pe = ?, price_updated_at = ?, market_error = ?, updated_at = ? WHERE id = ?');
    const updated = [];
    for (const position of usPositions) {
      const quote = quotesBySymbol.get(position.symbol);
      let valuation = { trailingPE: null, forwardPE: null };
      let valuationError = null;
      if (typeof valuationFetcher === 'function') {
        try { valuation = await valuationFetcher(position.symbol); } catch (error) { valuationError = error.message; }
      }
      update.run(quote.currentPrice, valuation.trailingPE ?? null, valuation.forwardPE ?? null, quote.quotedAt || timestamp, valuationError, timestamp, position.id);
      updated.push({ id: position.id, symbol: position.symbol, currentPrice: quote.currentPrice, change: quote.change, changePercent: quote.changePercent, priceUpdatedAt: quote.quotedAt || timestamp, trailingPE: valuation.trailingPE ?? null, forwardPE: valuation.forwardPE ?? null, valuationError });
    }
    return { updated, skipped };
  }

  async function refreshStockEntryPlanMarketData() {
    if (typeof quoteFetcher !== 'function') throw new Error('Finnhub 行情服务不可用。');
    const plans = listStockEntryPlans();
    const skipped = plans.filter((plan) => plan.market !== 'US').map((plan) => ({ id: plan.id, symbol: plan.symbol, reason: '当前仅支持刷新美股行情与估值指标。' }));
    const usPlans = plans.filter((plan) => plan.market === 'US');
    const dataBySymbol = new Map();
    const failedBySymbol = new Map();
    for (const plan of usPlans) {
      if (dataBySymbol.has(plan.symbol) || failedBySymbol.has(plan.symbol)) continue;
      try {
        const quote = await quoteFetcher(plan.symbol);
        let valuation = { trailingPE: null, forwardPE: null };
        let valuationError = null;
        if (typeof valuationFetcher === 'function') {
          try { valuation = await valuationFetcher(plan.symbol); } catch (error) { valuationError = error.message; }
        }
        dataBySymbol.set(plan.symbol, { quote, valuation, valuationError });
      } catch (error) {
        failedBySymbol.set(plan.symbol, error.message);
      }
    }
    const timestamp = asIso(undefined, now());
    const updateSuccess = db.prepare('UPDATE stock_entry_plans SET current_price = ?, trailing_pe = ?, forward_pe = ?, market_status = ?, market_updated_at = ?, market_error = ?, updated_at = ? WHERE id = ?');
    const updateFailure = db.prepare('UPDATE stock_entry_plans SET market_error = ?, updated_at = ? WHERE id = ?');
    const updated = usPlans.filter((plan) => dataBySymbol.has(plan.symbol)).map((plan) => {
      const { quote, valuation, valuationError } = dataBySymbol.get(plan.symbol);
      const marketUpdatedAt = quote.quotedAt || timestamp;
      const status = quote.currentPrice <= plan.entryPrice ? 'openable' : 'waiting';
      const trailingPE = valuation?.trailingPE ?? null;
      const forwardPE = valuation?.forwardPE ?? null;
      updateSuccess.run(quote.currentPrice, trailingPE, forwardPE, status, marketUpdatedAt, valuationError, timestamp, plan.id);
      return { id: plan.id, symbol: plan.symbol, currentPrice: quote.currentPrice, priceUpdatedAt: marketUpdatedAt, trailingPE, forwardPE, valuationError, status };
    });
    const failed = usPlans.filter((plan) => failedBySymbol.has(plan.symbol)).map((plan) => {
      const reason = failedBySymbol.get(plan.symbol);
      updateFailure.run(reason, timestamp, plan.id);
      return { id: plan.id, symbol: plan.symbol, reason };
    });
    return { updated, skipped, failed };
  }

  function getStockAlertRules() {
    const rows = db.prepare('SELECT id, payload FROM stock_alert_rules ORDER BY rowid').all();
    if (!rows.length) {
      const timestamp = asIso(undefined, now());
      const insert = db.prepare('INSERT INTO stock_alert_rules(id, payload, updated_at) VALUES (?, ?, ?)');
      for (const rule of DEFAULT_STOCK_ALERT_RULES) insert.run(rule.id, JSON.stringify(rule), timestamp);
      return DEFAULT_STOCK_ALERT_RULES;
    }
    return rows.map((row) => parseJson(row.payload, null)).filter(Boolean);
  }

  function setStockAlertRules(input) {
    if (!Array.isArray(input?.rules) || input.rules.length !== DEFAULT_STOCK_ALERT_RULES.length) throw new Error('预警规则格式无效。');
    const defaultsById = new Map(DEFAULT_STOCK_ALERT_RULES.map((rule) => [rule.id, rule]));
    const rules = input.rules.map((rule) => {
      const base = defaultsById.get(String(rule.id));
      if (!base) throw new Error('预警规则标识无效。');
      const uvxyThreshold = Number(rule.uvxyThreshold);
      const marketThreshold = Number(rule.marketThreshold);
      const twoDayThreshold = rule.twoDayThreshold === null || rule.twoDayThreshold === '' ? null : Number(rule.twoDayThreshold);
      if (![uvxyThreshold, marketThreshold].every(Number.isFinite) || (twoDayThreshold !== null && !Number.isFinite(twoDayThreshold))) throw new Error('预警阈值必须是数字。');
      return { ...base, level: String(rule.level || base.level).trim() || base.level, uvxyThreshold, marketThreshold, twoDayThreshold, message: String(rule.message || '').trim() || base.message, enabled: rule.enabled !== false };
    });
    const timestamp = asIso(undefined, now());
    const update = db.prepare('INSERT INTO stock_alert_rules(id, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at');
    const transaction = db.transaction(() => rules.forEach((rule) => update.run(rule.id, JSON.stringify(rule), timestamp)));
    transaction();
    return rules;
  }

  async function evaluateStockMarketAlerts(quotes, { deliver = true } = {}) {
    const validQuotes = new Map((quotes || []).filter((quote) => Number.isFinite(Number(quote.changePercent))).map((quote) => [quote.symbol, quote]));
    const uvxy = validQuotes.get('UVXY');
    if (!uvxy) return { triggered: [], deliveryErrors: [] };
    const tradingDate = new Date(uvxy.quotedAt || now()).toISOString().slice(0, 10);
    const snapshot = db.prepare('INSERT INTO stock_alert_snapshots(symbol, trading_date, change_percent, captured_at) VALUES (?, ?, ?, ?) ON CONFLICT(symbol, trading_date) DO UPDATE SET change_percent = excluded.change_percent, captured_at = excluded.captured_at');
    const timestamp = asIso(undefined, now());
    for (const symbol of ['UVXY', 'VOO', 'QQQ']) {
      const quote = validQuotes.get(symbol);
      if (quote) snapshot.run(symbol, tradingDate, Number(quote.changePercent), timestamp);
    }
    const previous = db.prepare("SELECT change_percent FROM stock_alert_snapshots WHERE symbol = 'UVXY' AND trading_date < ? ORDER BY trading_date DESC LIMIT 1").get(tradingDate);
    const twoDayChange = previous && Number.isFinite(Number(previous.change_percent)) ? Number(uvxy.changePercent) + Number(previous.change_percent) : null;
    const rules = getStockAlertRules();
    const triggered = [];
    const deliveryErrors = [];
    for (const rule of rules) {
      const marketCondition = ['VOO', 'QQQ'].some((symbol) => Number(validQuotes.get(symbol)?.changePercent) <= rule.marketThreshold);
      const twoDayCondition = rule.twoDayThreshold !== null && twoDayChange !== null && twoDayChange >= rule.twoDayThreshold;
      if (!rule.enabled || Number(uvxy.changePercent) < rule.uvxyThreshold || (!marketCondition && !twoDayCondition)) continue;
      const alert = { ...rule, tradingDate, uvxyChangePercent: Number(uvxy.changePercent), marketCondition, twoDayChange, pushed: false };
      triggered.push(alert);
      const delivered = db.prepare('SELECT 1 FROM stock_alert_deliveries WHERE rule_id = ? AND trading_date = ?').get(rule.id, tradingDate);
      if (delivered) { alert.pushed = true; continue; }
      if (!deliver) continue;
      try {
        const configured = typeof barkSettings?.get === 'function' && (await barkSettings.get()).configured;
        if (!configured || typeof barkPusher !== 'function') { deliveryErrors.push({ ruleId: rule.id, error: 'Bark 未配置。' }); continue; }
        const marketText = ['VOO', 'QQQ'].map((symbol) => `${symbol} ${validQuotes.get(symbol)?.changePercent === undefined ? '—' : `${Number(validQuotes.get(symbol).changePercent).toFixed(2)}%`}`).join('，');
        await barkPusher(`市场预警 · ${rule.level}`, `${rule.message}\nUVXY ${Number(uvxy.changePercent).toFixed(2)}%，${marketText}${twoDayChange === null ? '' : `\nUVXY 两日累计 ${twoDayChange.toFixed(2)}%`}`);
        db.prepare('INSERT INTO stock_alert_deliveries(rule_id, trading_date, pushed_at) VALUES (?, ?, ?)').run(rule.id, tradingDate, timestamp);
        alert.pushed = true;
      } catch (error) { deliveryErrors.push({ ruleId: rule.id, error: error.message }); }
    }
    return { triggered, deliveryErrors };
  }

  async function getStockMarketQuotes(symbols, { deliver = true } = {}) {
    if (typeof quoteFetcher !== 'function') throw new Error('Finnhub 行情服务不可用。');
    const normalizedSymbols = [...new Set((Array.isArray(symbols) ? symbols : [])
      .map((symbol) => String(symbol || '').trim().toUpperCase().split(':').pop())
      .filter(Boolean))];
    const quotes = await Promise.all(normalizedSymbols.map(async (symbol) => {
      try {
        const quote = await quoteFetcher(symbol);
        return { ...quote, symbol };
      } catch (error) {
        return { symbol, error: error.message };
      }
    }));
    const alerts = await evaluateStockMarketAlerts(quotes, { deliver });
    return { quotes, updatedAt: new Date().toISOString(), alerts };
  }

  async function getDashboardStockAlerts() {
    const unavailable = { configured: false, available: false, status: 'unconfigured', triggered: [], deliveryErrors: [], updatedAt: null };
    try {
      const settings = typeof finnhubSettings?.get === 'function' ? await finnhubSettings.get() : { configured: false };
      if (!settings.configured) return unavailable;
      if (typeof quoteFetcher !== 'function') return { ...unavailable, configured: true, status: 'unavailable', error: 'Finnhub 行情服务不可用。' };
      const market = await getStockMarketQuotes(['UVXY', 'VOO', 'QQQ'], { deliver: false });
      const validQuotes = market.quotes.filter((quote) => Number.isFinite(Number(quote.changePercent)));
      if (!validQuotes.length) return { ...unavailable, configured: true, status: 'error', error: '行情未返回有效涨跌幅。', updatedAt: market.updatedAt };
      return {
        configured: true,
        available: true,
        status: 'ok',
        triggered: market.alerts.triggered,
        deliveryErrors: market.alerts.deliveryErrors,
        updatedAt: market.updatedAt
      };
    } catch (error) {
      return { ...unavailable, configured: true, status: 'error', error: error.message };
    }
  }

  function getStockSettings() {
    const row = db.prepare("SELECT * FROM stock_settings WHERE id = 'default'").get();
    return { totalAssets: row ? row.total_assets : 0 };
  }

  function setStockSettings(input) {
    const totalAssets = Number(input.totalAssets);
    if (!Number.isFinite(totalAssets) || totalAssets < 0) throw new Error('总资产必须是非负数字。');
    const timestamp = asIso(undefined, now());
    db.prepare("INSERT INTO stock_settings(id, total_assets, updated_at) VALUES ('default', ?, ?) ON CONFLICT(id) DO UPDATE SET total_assets = excluded.total_assets, updated_at = excluded.updated_at").run(totalAssets, timestamp);
    return { totalAssets };
  }

  function reminderStatus(item, currentTime = expiringNow || now()) {
    if (!item.enabled) return 'disabled';
    if (item.mode === 'once' && item.remindedAt) return 'notified';
    const currentIso = asIso(undefined, currentTime);
    const nextAt = item.nextAt || advanceFrom(item.dueAt, item.advanceValue, item.advanceUnit);
    if (nextAt > currentIso) return 'upcoming';
    if (item.mode === 'recurring-manual') return 'pending';
    if (item.mode === 'once' && item.dueAt <= currentIso) return 'overdue';
    return 'due';
  }

  function mapExpiringItem(row) {
    const item = { id: row.id, name: row.name, category: row.category, mode: row.mode || 'once', dueAt: row.due_at || `${row.due_date}T00:00:00.000Z`, dueDate: row.due_date, reminderDays: row.reminder_days, intervalValue: row.interval_value, intervalUnit: row.interval_unit, advanceValue: row.advance_value ?? row.reminder_days, advanceUnit: row.advance_unit || 'day', nextAt: row.next_at, remindedAt: row.reminded_at, notes: row.notes, enabled: Boolean(row.enabled), createdAt: row.created_at, updatedAt: row.updated_at };
    return { ...item, reminderStatus: reminderStatus(item) };
  }

  function createExpiringItem(input) {
    const name = String(input.name || '').trim();
    const mode = ['once', 'recurring-auto', 'recurring-manual'].includes(input.mode) ? input.mode : 'once';
    const dueAt = String(input.dueAt || (input.dueDate ? `${input.dueDate}T00:00:00.000Z` : '')).trim();
    if (!name || !Number.isFinite(new Date(dueAt).getTime())) throw new Error('到期项必须包含名称和有效的到期时间。');
    const advanceValue = Number.isInteger(Number(input.advanceValue)) ? Number(input.advanceValue) : (Number.isInteger(Number(input.reminderDays)) ? Number(input.reminderDays) : 0);
    const advanceUnit = ['minute', 'hour', 'day'].includes(input.advanceUnit) ? input.advanceUnit : 'day';
    if (advanceValue < 0) throw new Error('提前量不能为负。');
    let intervalValue = null;
    let intervalUnit = null;
    if (mode !== 'once') {
      intervalValue = Number(input.intervalValue);
      intervalUnit = input.intervalUnit;
      if (!Number.isInteger(intervalValue) || intervalValue < 1 || !['day', 'week', 'month', 'year'].includes(intervalUnit)) throw new Error('周期提醒必须包含有效的周期。');
    }
    const timestamp = asIso(undefined, now());
    let effectiveDueAt = dueAt;
    let nextAt = advanceFrom(dueAt, advanceValue, advanceUnit);
    if (mode === 'recurring-auto') {
      const settled = settleRecurring(dueAt, intervalValue, intervalUnit, advanceValue, advanceUnit, timestamp);
      effectiveDueAt = settled.dueAt;
      nextAt = settled.nextAt;
    }
    const item = { id: createId(), name, category: String(input.category || '').trim(), mode, dueAt: effectiveDueAt, dueDate: effectiveDueAt.slice(0, 10), reminderDays: advanceUnit === 'day' ? advanceValue : 0, intervalValue, intervalUnit, advanceValue, advanceUnit, nextAt, remindedAt: null, notes: String(input.notes || '').trim(), enabled: input.enabled !== false, createdAt: timestamp, updatedAt: timestamp };
    db.prepare('INSERT INTO expiring_items(id, name, category, due_date, reminder_days, notes, enabled, created_at, updated_at, mode, due_at, interval_value, interval_unit, advance_value, advance_unit, next_at, reminded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(item.id, item.name, item.category, item.dueDate, item.reminderDays, item.notes, Number(item.enabled), timestamp, timestamp, item.mode, item.dueAt, item.intervalValue, item.intervalUnit, item.advanceValue, item.advanceUnit, item.nextAt, item.remindedAt);
    return { ...item, reminderStatus: reminderStatus(item) };
  }

  function updateExpiringItem(id, input) {
    const current = db.prepare('SELECT * FROM expiring_items WHERE id = ?').get(id);
    if (!current) return null;
    const name = typeof input.name === 'string' && input.name.trim() ? input.name.trim() : current.name;
    const notes = typeof input.notes === 'string' ? input.notes.trim() : current.notes;
    const category = typeof input.category === 'string' ? input.category.trim() : current.category;
    const dueAt = input.dueAt ? String(input.dueAt) : (input.dueDate ? `${input.dueDate}T00:00:00.000Z` : (current.due_at || `${current.due_date}T00:00:00.000Z`));
    if (!Number.isFinite(new Date(dueAt).getTime())) throw new Error('到期时间无效。');
    const enabled = typeof input.enabled === 'boolean' ? input.enabled : Boolean(current.enabled);
    const advanceValue = input.advanceValue !== undefined && input.advanceValue !== null ? Number(input.advanceValue) : (current.advance_value ?? current.reminder_days);
    const advanceUnit = input.advanceUnit || current.advance_unit || 'day';
    const mode = ['once', 'recurring-auto', 'recurring-manual'].includes(input.mode) ? input.mode : (current.mode || 'once');
    let intervalValue = current.interval_value;
    let intervalUnit = current.interval_unit;
    if (mode !== 'once') {
      if (input.intervalValue !== undefined && input.intervalValue !== null) intervalValue = Number(input.intervalValue);
      if (input.intervalUnit) intervalUnit = input.intervalUnit;
      if (!Number.isInteger(intervalValue) || intervalValue < 1 || !['day', 'week', 'month', 'year'].includes(intervalUnit)) throw new Error('周期提醒必须包含有效的周期。');
    } else {
      intervalValue = null;
      intervalUnit = null;
    }
    const updatedAt = asIso(undefined, now());
    let effectiveDueAt = dueAt;
    let nextAt = advanceFrom(dueAt, advanceValue, advanceUnit);
    if (mode === 'recurring-auto') {
      const settled = settleRecurring(dueAt, intervalValue, intervalUnit, advanceValue, advanceUnit, updatedAt);
      effectiveDueAt = settled.dueAt;
      nextAt = settled.nextAt;
    }
    const reschedules = input.mode !== undefined || input.intervalValue !== undefined || Boolean(input.dueAt || input.dueDate || input.advanceUnit || input.intervalUnit) || input.advanceValue !== undefined;
    db.prepare('UPDATE expiring_items SET name = ?, category = ?, due_date = ?, due_at = ?, advance_value = ?, advance_unit = ?, mode = ?, interval_value = ?, interval_unit = ?, next_at = ?, notes = ?, enabled = ?, reminded_at = ?, updated_at = ? WHERE id = ?').run(name, category, effectiveDueAt.slice(0, 10), effectiveDueAt, advanceValue, advanceUnit, mode, intervalValue, intervalUnit, nextAt, notes, Number(enabled), reschedules ? null : current.reminded_at, updatedAt, id);
    return mapExpiringItem(db.prepare('SELECT * FROM expiring_items WHERE id = ?').get(id));
  }

  function listExpiringItems() {
    return db.prepare('SELECT * FROM expiring_items ORDER BY enabled DESC, due_date').all().map(mapExpiringItem);
  }

  function deleteExpiringItem(id) {
    return db.prepare('DELETE FROM expiring_items WHERE id = ?').run(id).changes > 0;
  }

  function rolloverExpiringItems(currentTime = now()) {
    expiringNow = currentTime;
    const currentIso = asIso(undefined, currentTime);
    const dueItems = listExpiringItems().filter((item) => item.enabled && item.nextAt && item.nextAt <= currentIso && (item.mode !== 'once' || !item.remindedAt));
    const rolled = [];
    for (const item of dueItems) {
      if (item.mode === 'recurring-auto') {
        const nextDue = nextOccurrence(item.dueAt, item.intervalValue, item.intervalUnit);
        const nextAt = advanceFrom(nextDue, item.advanceValue, item.advanceUnit);
        db.prepare('UPDATE expiring_items SET due_at = ?, next_at = ?, updated_at = ? WHERE id = ?').run(nextDue, nextAt, currentIso, item.id);
        rolled.push({ ...item, nextDueAt: nextDue, nextAt });
      } else {
        rolled.push(item);
      }
    }
    return rolled;
  }

  function confirmExpiringItem(id) {
    const current = db.prepare('SELECT * FROM expiring_items WHERE id = ?').get(id);
    if (!current) return null;
    const item = mapExpiringItem(current);
    if (item.mode !== 'recurring-manual') throw new Error('仅周期手动确认项可确认。');
    const nextDue = nextOccurrence(item.dueAt, item.intervalValue, item.intervalUnit);
    const nextAt = advanceFrom(nextDue, item.advanceValue, item.advanceUnit);
    db.prepare('UPDATE expiring_items SET due_at = ?, next_at = ?, updated_at = ? WHERE id = ?').run(nextDue, nextAt, asIso(undefined, now()), id);
    return mapExpiringItem(db.prepare('SELECT * FROM expiring_items WHERE id = ?').get(id));
  }
  async function runExpiringReminders(currentTime = now()) {
    const currentIso = asIso(undefined, currentTime);
    const dueItems = rolloverExpiringItems(currentTime);
    if (!dueItems.length || typeof barkPusher !== 'function') return { pushed: 0, due: dueItems.length, results: [] };
    let configured = true;
    if (typeof barkSettings?.get === 'function') {
      configured = Boolean((await barkSettings.get())?.configured);
    }
    if (!configured) return { pushed: 0, due: dueItems.length, results: [] };
    const results = [];
    for (const item of dueItems) {
      try {
        await barkPusher('到期提醒', `${item.name} · ${formatDateTime(item.dueAt)}${item.notes ? ` · ${item.notes}` : ''}`);
        if (item.mode === 'once') {
          db.prepare('UPDATE expiring_items SET reminded_at = ?, updated_at = ? WHERE id = ?').run(currentIso, currentIso, item.id);
        }
        results.push({ id: item.id, pushed: true });
      } catch (error) {
        results.push({ id: item.id, pushed: false, error: error.message });
      }
    }
    return { pushed: results.filter((result) => result.pushed).length, due: dueItems.length, results };
  }

  function normalizeSchedule(input) {
    const weekday = Number(input.weekday);
    const time = String(input.time || '').trim();
    const timeZone = String(input.timeZone || 'Asia/Shanghai').trim();
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6 || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      throw new Error('排期必须包含有效的星期和时间。');
    }
    try {
      Intl.DateTimeFormat('en-US', { timeZone }).format();
    } catch {
      throw new Error('时区无效。');
    }
    return { weekday, time, enabled: Boolean(input.enabled), timeZone, updatedAt: asIso(undefined, now()) };
  }

  function setSchedule(input) {
    const schedule = normalizeSchedule(input);
    db.prepare(`INSERT INTO weekly_schedules(weekday, time, enabled, time_zone, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(weekday) DO UPDATE SET time = excluded.time, enabled = excluded.enabled, time_zone = excluded.time_zone, updated_at = excluded.updated_at`)
      .run(schedule.weekday, schedule.time, Number(schedule.enabled), schedule.timeZone, schedule.updatedAt);
    return schedule;
  }

  function listSchedules() {
    return db.prepare('SELECT weekday, time, enabled, time_zone, updated_at FROM weekly_schedules ORDER BY weekday').all().map((row) => ({
      weekday: row.weekday,
      time: row.time,
      enabled: Boolean(row.enabled),
      timeZone: row.time_zone,
      updatedAt: row.updated_at
    }));
  }

  function localDateTime(date, timeZone) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(date);
    const value = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
    const weekday = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[value.weekday];
    return { weekday, date: `${value.year}-${value.month}-${value.day}`, time: `${value.hour}:${value.minute}` };
  }

  async function runDueSchedules(generator, currentTime = now()) {
    if (typeof generator !== 'function') throw new Error('排期生成器不可用。');
    const created = [];
    for (const schedule of listSchedules().filter((item) => item.enabled)) {
      const local = localDateTime(currentTime, schedule.timeZone);
      if (local.weekday !== schedule.weekday || local.time < schedule.time) continue;
      const operatingDate = nextOperatingDate(local.date);
      const alreadyStarted = db.prepare(`SELECT id FROM generation_runs
        WHERE operating_date = ? AND trigger_type IN ('scheduled', 'catchUp')`).get(operatingDate);
      if (alreadyStarted) continue;

      const runId = createId();
      const startedAt = asIso(undefined, currentTime);
      db.prepare(`INSERT INTO generation_runs(id, operating_date, trigger_type, status, error_message, created_at, completed_at)
        VALUES (?, ?, 'scheduled', 'started', NULL, ?, NULL)`).run(runId, operatingDate, startedAt);
      try {
        const candidates = await generator({
          trigger: 'scheduled',
          operatingDate,
          profile: getProfile(),
          materials: listMaterials().filter((material) => !material.archivedAt),
          preferences: getStyle(),
          archiveProfile: getArchiveProfile().objective
        });
        if (!Array.isArray(candidates) || candidates.length !== 10) throw new Error('定时生成必须返回完整的十条候选。');
        const pack = createContentPack({ trigger: 'scheduled', operatingDate, candidates, createdAt: startedAt });
        db.prepare(`UPDATE generation_runs SET status = 'succeeded', completed_at = ? WHERE id = ?`).run(asIso(undefined, currentTime), runId);
        created.push(pack);
      } catch (error) {
        db.prepare(`UPDATE generation_runs SET status = 'failed', error_message = ?, completed_at = ? WHERE id = ?`)
          .run(String(error.message || '生成失败').slice(0, 500), asIso(undefined, currentTime), runId);
      }
    }
    return { created };
  }
  async function runManualGeneration(generator, currentTime = now(), targetOperatingDate) {
    if (typeof generator !== 'function') throw new Error('内容生成器不可用。');
    const runId = createId();
    const createdAt = asIso(undefined, currentTime);
    const operatingDate = targetOperatingDate ? normalizeOperatingDate(targetOperatingDate) : createdAt.slice(0, 10);
    db.prepare(`INSERT INTO generation_runs(id, operating_date, trigger_type, status, error_message, created_at, completed_at)
      VALUES (?, ?, 'manual', 'started', NULL, ?, NULL)`).run(runId, operatingDate, createdAt);
    try {
      const candidates = await generator({ trigger: 'manual', operatingDate, profile: getProfile(), materials: listMaterials().filter((material) => !material.archivedAt), preferences: getStyle(), archiveProfile: getArchiveProfile().objective });
      if (!Array.isArray(candidates) || candidates.length !== 10) throw new Error('手动生成必须返回完整的十条候选。');
      const pack = createContentPack({ trigger: 'manual', operatingDate, candidates, createdAt });
      db.prepare(`UPDATE generation_runs SET status = 'succeeded', completed_at = ? WHERE id = ?`).run(asIso(undefined, currentTime), runId);
      return pack;
    } catch (error) {
      db.prepare(`UPDATE generation_runs SET status = 'failed', error_message = ?, completed_at = ? WHERE id = ?`)
        .run(String(error.message || '生成失败').slice(0, 500), asIso(undefined, currentTime), runId);
      throw error;
    }
  }

  function mapCandidate(row) {
    return {
      id: row.id,
      content: row.content,
      topic: row.topic,
      format: row.format,
      language: row.language,
      tone: row.tone,
      recommendation: row.recommendation,
      sourceMaterialIds: parseJson(row.source_material_ids, []),
      suggestedPublishTime: row.suggested_publish_time,
      plannedPublishTime: row.planned_publish_time,
      createdAt: row.created_at
    };
  }

  function getPack(id, currentTime = retentionNow) {
    const pack = db.prepare('SELECT * FROM content_packs WHERE id = ?').get(id);
    if (!pack) return null;
    const candidates = db.prepare('SELECT * FROM content_candidates WHERE pack_id = ? ORDER BY created_at').all(id).map(mapCandidate);
    return {
      id: pack.id,
      trigger: pack.trigger_type,
      operatingDate: pack.operating_date,
      createdAt: pack.created_at,
      updatedAt: pack.updated_at,
      ...retentionFor(pack.created_at, currentTime),
      candidates
    };
  }

  function createContentPack(input) {
    const trigger = ['manual', 'scheduled', 'catchUp'].includes(input.trigger) ? input.trigger : 'manual';
    const candidates = Array.isArray(input.candidates) ? input.candidates : [];
    if (!candidates.length) throw new Error('内容包至少需要一条候选。');
    if (candidates.length > 10) throw new Error('内容包最多保留十条候选。');
    const timestamp = asIso(input.createdAt, now());
    const pack = { id: createId(), trigger, operatingDate: input.operatingDate ? String(input.operatingDate) : null, createdAt: timestamp, updatedAt: timestamp };
    const insert = db.transaction(() => {
      db.prepare('INSERT INTO content_packs(id, trigger_type, operating_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
        .run(pack.id, trigger, pack.operatingDate, timestamp, timestamp);
      const statement = db.prepare(`INSERT INTO content_candidates(
        id, pack_id, content, topic, format, language, tone, recommendation, source_material_ids, suggested_publish_time, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const item of candidates) {
        const content = String(item.content || '').trim();
        if (!content) throw new Error('候选内容不能为空。');
        statement.run(createId(), pack.id, content, String(item.topic || '未分类').trim(), String(item.format || 'post').trim(), String(item.language || 'zh').trim(), String(item.tone || 'direct').trim(), item.recommendation === 'explore' ? 'explore' : 'recommended', JSON.stringify(Array.isArray(item.sourceMaterialIds) ? item.sourceMaterialIds : []), normalizePublishTime(item.suggestedPublishTime, '建议发布时间'), timestamp);
      }
    });
    insert();
    return getPack(pack.id);
  }
  function setCandidatePublicationPlan(candidateId, plannedPublishTime) {
    const candidate = db.prepare(`SELECT c.*, p.operating_date
      FROM content_candidates c JOIN content_packs p ON p.id = c.pack_id
      WHERE c.id = ?`).get(candidateId);
    if (!candidate) return null;

    const time = normalizePublishTime(plannedPublishTime, '计划发布时间');
    if (time && !candidate.operating_date) throw new Error('该候选没有对应的发布日期。');
    db.prepare('UPDATE content_candidates SET planned_publish_time = ? WHERE id = ?').run(time, candidateId);
    if (time) createCandidateEvent(candidateId, 'queued');
    return mapCandidate(db.prepare('SELECT * FROM content_candidates WHERE id = ?').get(candidateId));
  }

  function createCandidateEvent(candidateId, type) {
    if (!['selected', 'copied', 'queued', 'published'].includes(type)) throw new Error('候选行为无效。');
    const candidate = db.prepare('SELECT id FROM content_candidates WHERE id = ?').get(candidateId);
    if (!candidate) return null;
    const timestamp = asIso(undefined, now());
    db.prepare('INSERT OR IGNORE INTO candidate_events(id, candidate_id, event_type, created_at) VALUES (?, ?, ?, ?)')
      .run(createId(), candidateId, type, timestamp);
    return { candidateId, type, createdAt: timestamp };
  }

  function mapContentFeedbackArchive(row) {
    return {
      id: row.id,
      candidateId: row.candidate_id,
      content: row.content,
      topic: row.topic,
      format: row.format,
      language: row.language,
      tone: row.tone,
      operatingDate: row.operating_date,
      plannedPublishTime: row.planned_publish_time,
      performance: row.performance,
      archivedAt: row.archived_at,
      assessedAt: row.assessed_at
    };
  }

  function archiveCandidateCopy(candidateId) {
    const candidate = db.prepare(`SELECT c.*, p.operating_date
      FROM content_candidates c JOIN content_packs p ON p.id = c.pack_id
      WHERE c.id = ?`).get(candidateId);
    if (!candidate) return null;
    const timestamp = asIso(undefined, now());
    db.prepare(`INSERT INTO content_feedback_archive(
      id, candidate_id, content, topic, format, language, tone, operating_date, planned_publish_time, performance, archived_at, assessed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, NULL)
      ON CONFLICT(candidate_id) DO NOTHING`)
      .run(createId(), candidate.id, candidate.content, candidate.topic, candidate.format, candidate.language, candidate.tone, candidate.operating_date, candidate.planned_publish_time, timestamp);
    createCandidateEvent(candidateId, 'copied');
    return mapContentFeedbackArchive(db.prepare('SELECT * FROM content_feedback_archive WHERE candidate_id = ?').get(candidateId));
  }

  function listContentFeedbackArchive() {
    return db.prepare('SELECT * FROM content_feedback_archive ORDER BY archived_at DESC').all().map(mapContentFeedbackArchive);
  }

  function setContentFeedbackPerformance(archiveId, performance) {
    if (!['good', 'poor'].includes(performance)) throw new Error('流量表现只能标记为好或一般。');
    const timestamp = asIso(undefined, now());
    db.prepare('UPDATE content_feedback_archive SET performance = ?, assessed_at = ? WHERE id = ?').run(performance, timestamp, archiveId);
    const entry = db.prepare('SELECT * FROM content_feedback_archive WHERE id = ?').get(archiveId);
    return entry ? mapContentFeedbackArchive(entry) : null;
  }

  function listPacks(filters = {}) {
    const rows = db.prepare('SELECT id FROM content_packs ORDER BY created_at DESC').all();
    return rows.map(({ id }) => getPack(id)).filter((pack) => {
      if (filters.status && pack.retentionStatus !== filters.status) return false;
      if (filters.topic && !pack.candidates.some((candidate) => candidate.topic === filters.topic)) return false;
      if (filters.language && !pack.candidates.some((candidate) => candidate.language === filters.language)) return false;
      return true;
    });
  }

  function getReplySession(id, currentTime = retentionNow) {
    const session = db.prepare('SELECT * FROM reply_sessions WHERE id = ?').get(id);
    if (!session) return null;
    const drafts = db.prepare('SELECT * FROM reply_drafts WHERE session_id = ? ORDER BY created_at').all(id).map((draft) => ({
      id: draft.id,
      content: draft.content,
      translation: draft.translation,
      createdAt: draft.created_at
    }));
    return {
      id: session.id,
      targetPostText: session.target_post_text,
      sourceKind: session.source_kind,
      sourceUrl: session.source_url,
      language: session.language,
      style: session.style,
      humanTone: session.human_tone,
      ...parseJson(session.analysis, {}),
      createdAt: session.created_at,
      ...retentionFor(session.created_at, currentTime),
      drafts
    };
  }

  function createReplySession(input) {
    const targetPostText = String(input.targetPostText || '').trim();
    if (!targetPostText) throw new Error('回复目标帖子不能为空。');
    const sourceKind = ['clipboard', 'manualInput', 'xPage'].includes(input.sourceKind) ? input.sourceKind : 'manualInput';
    const timestamp = asIso(undefined, now());
    const result = input.result && typeof input.result === 'object' ? input.result : {};
    const drafts = Array.isArray(result.drafts) ? result.drafts.map((item) => String(item).trim()).filter(Boolean).slice(0, 5) : [];
    const session = { id: createId(), targetPostText, sourceKind, sourceUrl: input.sourceUrl ? String(input.sourceUrl) : null, language: String(input.language || 'zh'), style: String(input.style || 'insightful'), humanTone: Number.isInteger(input.humanTone) ? input.humanTone : 3, createdAt: timestamp };
    const insert = db.transaction(() => {
      db.prepare(`INSERT INTO reply_sessions(id, target_post_text, source_kind, source_url, language, style, human_tone, analysis, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(session.id, session.targetPostText, session.sourceKind, session.sourceUrl, session.language, session.style, session.humanTone, JSON.stringify({ shouldReply: Boolean(result.shouldReply), recommendedAction: String(result.recommendedAction || 'skip'), reason: String(result.reason || ''), risk: String(result.risk || ''), angle: String(result.angle || '') }), timestamp);
      const insertDraft = db.prepare('INSERT INTO reply_drafts(id, session_id, content, translation, created_at) VALUES (?, ?, ?, ?, ?)');
      drafts.forEach((content, index) => insertDraft.run(createId(), session.id, content, Array.isArray(result.translations) ? String(result.translations[index] || '') || null : null, timestamp));
    });
    insert();
    return getReplySession(session.id);
  }

  function createReplyDraftEvent(draftId, type) {
    if (!['selected', 'copied', 'queued'].includes(type)) throw new Error('回复草稿行为无效。');
    const exists = db.prepare('SELECT id FROM reply_drafts WHERE id = ?').get(draftId);
    if (!exists) return null;
    const timestamp = asIso(undefined, now());
    db.prepare('INSERT OR IGNORE INTO reply_draft_events(id, draft_id, event_type, created_at) VALUES (?, ?, ?, ?)').run(createId(), draftId, type, timestamp);
    return { draftId, type, createdAt: timestamp };
  }

  function preferenceEntries(rows, dimensions, weights) {
    const values = Object.fromEntries(dimensions.map((dimension) => [dimension, new Map()]));
    for (const row of rows) {
      const weight = weights[row.event_type] || 0;
      for (const dimension of dimensions) {
        const value = String(row[dimension]);
        values[dimension].set(value, (values[dimension].get(value) || 0) + weight);
      }
    }
    const overrides = new Map(db.prepare('SELECT preference_key, mode FROM preference_overrides').all().map((row) => [row.preference_key, row.mode]));
    return Object.fromEntries(dimensions.map((dimension) => [dimension, [...values[dimension]].map(([value, weight]) => ({
      value,
      weight,
      mode: overrides.get(`${dimension}:${value}`) || 'automatic'
    })).sort((left, right) => right.weight - left.weight)]));
  }

  function setPreferenceOverride(input) {
    const key = String(input.key || '').trim();
    const mode = String(input.mode || '').trim();
    if (!key || !['automatic', 'fixed', 'reduced', 'ignored'].includes(mode)) throw new Error('偏好控制无效。');
    const updatedAt = asIso(undefined, now());
    db.prepare(`INSERT INTO preference_overrides(preference_key, mode, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(preference_key) DO UPDATE SET mode = excluded.mode, updated_at = excluded.updated_at`).run(key, mode, updatedAt);
    return { key, mode, updatedAt };
  }

  function getStyle() {
    const weights = { selected: 1, copied: 0, queued: 3, published: 3 };
    const replyRows = db.prepare(`SELECT s.language, s.style, s.human_tone AS humanTone, e.event_type
      FROM reply_draft_events e JOIN reply_drafts d ON d.id = e.draft_id JOIN reply_sessions s ON s.id = d.session_id`).all();
    const candidateRows = db.prepare(`SELECT c.topic, c.format, c.language, c.tone, e.event_type
      FROM candidate_events e JOIN content_candidates c ON c.id = e.candidate_id`).all();
    const feedbackRows = db.prepare(`SELECT topic, format, language, tone, performance
      FROM content_feedback_archive WHERE performance != 'pending'`).all();
    const replyEntries = preferenceEntries(replyRows, ['style', 'language', 'humanTone'], weights);
    const originalEntries = preferenceEntries(candidateRows, ['topic', 'format', 'language', 'tone'], weights);
    const feedbackEntries = (performance) => {
      const entries = preferenceEntries(
        feedbackRows.filter((row) => row.performance === performance).map((row) => ({ ...row, event_type: 'feedback' })),
        ['topic', 'format', 'language', 'tone'],
        { feedback: 1 }
      );
      return { topics: entries.topic, formats: entries.format, languages: entries.language, tones: entries.tone };
    };
    return {
      profile: getProfile(),
      originalPreferences: { topics: originalEntries.topic, formats: originalEntries.format, languages: originalEntries.language, tones: originalEntries.tone },
      archiveFeedback: { good: feedbackEntries('good'), poor: feedbackEntries('poor') },
      replyPreferences: {
        styles: replyEntries.style,
        languages: replyEntries.language,
        humanTones: replyEntries.humanTone,
        style: Object.fromEntries(replyEntries.style.map((item) => [item.value, item.weight])),
        language: Object.fromEntries(replyEntries.language.map((item) => [item.value, item.weight])),
        humanTone: Object.fromEntries(replyEntries.humanTone.map((item) => [item.value, item.weight]))
      }
    };
  }


  function lunarLabelForDate(dateKey) {
    try {
      const [year, month, day] = dateKey.split('-').map(Number);
      const lunar = Solar.fromYmd(year, month, day).getLunar();
      return `农历${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`;
    } catch {
      return null;
    }
  }

  function dashboardCalendar(tasks, expiringItems, currentTime = now()) {
    const events = [
      ...tasks.filter((task) => task.dueDate).map((task) => ({ id: `task-${task.id}`, entityId: `task:${task.id}`, date: dashboardDateKey(task.dueDate), time: null, title: task.title, type: 'task', status: task.status, action: { label: '去处理', page: 'tasks', entityId: task.id } })),
      ...expiringItems.filter((item) => item.dueDate).map((item) => ({ id: `expiring-${item.id}`, entityId: `expiring:${item.id}`, date: dashboardDateKey(item.dueDate), time: item.dueAt ? new Date(item.dueAt).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false }) : null, title: item.name, type: 'expiring', status: item.reminderStatus, action: { label: '去查看', page: 'expiring', entityId: item.id } })),
    ];
    const eventDates = new Set(events.map((event) => event.date));
    const today = dashboardDateKey(currentTime);
    const todayDate = new Date(`${today}T00:00:00+08:00`);
    const days = Array.from({ length: 42 }, (_, index) => {
      const date = new Date(todayDate);
      date.setDate(date.getDate() + index - 14);
      const dateKey = dashboardDateKey(date);
      return { date: dateKey, lunarLabel: lunarLabelForDate(dateKey), hasEvents: eventDates.has(dateKey) };
    });
    return { timezone: 'Asia/Shanghai', days, events };
  }



  async function getDashboard() {
    const packs = listPacks();
    const tasks = listTasks('open');
    const expiringItems = listExpiringItems();
    const promptGeneratedAt = asIso(undefined, now());
    const contentPromptActions = packs
      .filter((pack) => pack.retentionStatus === 'active')
      .flatMap((pack) => pack.candidates
        .filter((candidate) => candidate.plannedPublishTime)
        .map((candidate) => {
          const content = String(candidate.content || '').trim();
          return {
            id: candidate.id,
            title: content.length > 60 ? `${content.slice(0, 60)}…` : content,
            reason: `已加入 ${candidate.plannedPublishTime} 发布计划`,
            date: candidate.plannedPublishTime,
            updatedAt: candidate.createdAt,
            action: { label: '去内容库', page: 'library', entityId: candidate.id }
          };
        }));
    const specialDays = { configured: false, available: false, events: [] };
    const pendingCandidateCount = packs.flatMap((pack) => pack.retentionStatus === 'active' ? pack.candidates : []).length;
    const completedTaskCount = db.prepare("SELECT COUNT(*) AS count FROM personal_tasks WHERE status = 'completed'").get().count;
    const expiredCandidateCount = packs.flatMap((pack) => pack.retentionStatus !== 'active' ? pack.candidates : []).length;
    const archivedMaterialCount = db.prepare('SELECT COUNT(*) AS count FROM materials WHERE archived_at IS NOT NULL').get().count;
    const databaseSizeBytes = fs.statSync(databasePath).size;
    const backupSizeBytes = directorySize(backupDirectory);
    const frontendSizeBytes = directorySize(staticDirectory);
    const calendar = dashboardCalendar(tasks, expiringItems, promptGeneratedAt);
    const menstrualSettings = getMenstrualSettings();
    const menstrualCycles = menstrualSettings.menstrualEnabled ? listMenstrualCycles() : [];
    const menstrualMoodLogs = menstrualSettings.menstrualEnabled ? listMenstrualMoodLogs() : [];
    const menstrualPrediction = null;
    const stockAlertResult = await getDashboardStockAlerts();
    const personalizedPrompts = buildDashboardPromptCandidates({
      tasks,
      expiringItems,
      calendarEvents: calendar.events,
      menstrual: { enabled: menstrualSettings.menstrualEnabled, prediction: menstrualPrediction },
      stocks: stockAlertResult,
      content: { available: contentPromptActions.length > 0, actions: contentPromptActions },
      specialDays,
      now: promptGeneratedAt
    });
    const personalizedPrompt = personalizedPrompts[0] || null;
    return {
      profile: getProfile(),
      materialCount: materialCount(),
      contentPackCount: packs.length,
      replySessionCount: db.prepare('SELECT COUNT(*) AS count FROM reply_sessions').get().count,
      expiringCount: packs.filter((pack) => pack.retentionStatus === 'expired').length,
      recentPacks: packs.slice(0, 5),
      tasks,
      expiringItems,
      calendar,
      contentPromptActions,
      specialDays,
      stockHistory: { available: false, points: [] },
      stockAlertResult,
      personalizedPrompt,
      personalizedPrompts,
      personalizedPromptGeneratedAt: promptGeneratedAt,
      personalizedPromptTimeContext: dashboardTimeContext(promptGeneratedAt),
      privacy: menstrualSettings,
      menstrualCycles,
      menstrualMoodLogs,
      menstrualPrediction,
      personalizedSources: {
        tasks: { configured: true, available: tasks.length > 0 },
        expiring: { configured: true, available: expiringItems.length > 0 },
        calendar: { configured: true, available: calendar.events.length > 0 },
        menstrual: { configured: menstrualSettings.menstrualEnabled, available: menstrualCycles.length > 0 || Boolean(menstrualPrediction) },
        stocks: { configured: stockAlertResult.configured, available: stockAlertResult.available, status: stockAlertResult.status },
        content: { configured: true, available: contentPromptActions.length > 0 },
        specialDays: { configured: specialDays.configured, available: specialDays.available },
      },
      pendingCandidateCount,
      taskStats: { open: tasks.length, completed: completedTaskCount },
      candidateStats: { active: pendingCandidateCount, expired: expiredCandidateCount },
      materialStats: { active: materialCount(), archived: archivedMaterialCount },
      databasePath,
      databaseSizeBytes,
      dataLocations: { database: databasePath, backups: backupDirectory, frontend: staticDirectory, keychain: 'macOS Keychain (com.x-assistant.local-hub)' },
      storageBreakdown: [
        { key: 'sqlite', label: 'SQLite 数据库', bytes: databaseSizeBytes },
        { key: 'backups', label: '加密备份', bytes: backupSizeBytes },
        { key: 'frontend', label: '工作台前端', bytes: frontendSizeBytes }
      ]
    };
  }

  async function readRawBody(request) {
    const chunks = [];
    let length = 0;
    for await (const chunk of request) {
      length += chunk.length;
      if (length > MAX_ARCHIVE_BYTES) throw new Error('归档文件过大。');
      chunks.push(chunk);
    }
    if (!length) throw new Error('归档文件为空。');
    return Buffer.concat(chunks);
  }

  async function importArchive(buffer) {
    const archive = parseXArchive(buffer);
    if (!archive.tweets.length) throw new Error('归档中没有推文。');
    const objective = buildObjectiveProfile(archive.tweets);
    const samples = [...archive.tweets]
      .sort((a, b) => (b.favoriteCount + b.retweetCount + b.replyCount) - (a.favoriteCount + a.retweetCount + a.replyCount))
      .slice(0, 20)
      .map((tweet) => ({ id: tweet.id, text: tweet.text, lang: tweet.lang, createdAt: tweet.createdAt, favoriteCount: tweet.favoriteCount, retweetCount: tweet.retweetCount, replyCount: tweet.replyCount }));
    const importId = createId();
    const timestamp = asIso(undefined, now());
    db.transaction(() => {
      db.prepare('INSERT INTO archive_imports(id, account_id, tweet_count, following_count, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(importId, archive.account?.accountId || null, archive.tweets.length, archive.following.length, timestamp);
      db.prepare('INSERT INTO archive_profiles(import_id, objective, semantic, sample_tweets, created_at) VALUES (?, ?, NULL, ?, ?)')
        .run(importId, JSON.stringify(objective), JSON.stringify(samples), timestamp);
    })();
    let semantic = null;
    if (typeof semanticExtractor === 'function') {
      try {
        semantic = await semanticExtractor({ tweets: archive.tweets, account: archive.account, profile: archive.profile, following: archive.following, objective });
        if (semantic) db.prepare('UPDATE archive_profiles SET semantic = ? WHERE import_id = ?').run(JSON.stringify(semantic), importId);
      } catch {
        semantic = null;
      }
    }
    return { import: { id: importId, accountId: archive.account?.accountId || null, tweetCount: archive.tweets.length, followingCount: archive.following.length }, profile: { objective, semantic, sampleTweets: samples, importedAt: timestamp } };
  }

  function getArchiveProfile() {
    const row = db.prepare('SELECT import_id, objective, semantic, sample_tweets, created_at FROM archive_profiles ORDER BY created_at DESC LIMIT 1').get();
    if (!row) return { objective: null, semantic: null, sampleTweets: [], importedAt: null, tweetCount: 0, followingCount: 0 };
    const importRow = db.prepare('SELECT tweet_count, following_count FROM archive_imports WHERE id = ?').get(row.import_id);
    return { objective: parseJson(row.objective, null), semantic: parseJson(row.semantic, null), sampleTweets: parseJson(row.sample_tweets, []), importedAt: row.created_at, tweetCount: importRow?.tweet_count || 0, followingCount: importRow?.following_count || 0 };
  }

  function confirmArchiveProfile(input) {
    const current = getProfile();
    const fields = ['identity', 'audience', 'tone', 'perspective'];
    const updates = {};
    for (const field of fields) {
      if (input[field] === undefined || input[field] === null) continue;
      updates[field] = String(input[field]).trim();
    }
    if (!Object.keys(updates).length) throw new Error('没有需要确认的语义项。');
    return setProfile({ ...current, ...updates, updatedAt: null });
  }


  function runMaintenance(currentTime = now()) {
    retentionNow = currentTime;
    const purgeBefore = new Date(currentTime.getTime() - (RETENTION_DAYS + EXPIRY_GRACE_DAYS) * 86400000).toISOString();
    const packs = db.prepare('SELECT id FROM content_packs WHERE created_at <= ?').all(purgeBefore);
    const sessions = db.prepare('SELECT id FROM reply_sessions WHERE created_at <= ?').all(purgeBefore);
    const remove = db.transaction(() => {
      db.prepare('DELETE FROM content_packs WHERE created_at <= ?').run(purgeBefore);
      db.prepare('DELETE FROM reply_sessions WHERE created_at <= ?').run(purgeBefore);
    });
    remove();
    return { purgedContentPacks: packs.length, purgedReplySessions: sessions.length };
  }

  function snapshotDatabase() {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'extension_tokens' ORDER BY name").all().map(({ name }) => name);
    return { exportedAt: now().toISOString(), tables: Object.fromEntries(tables.map((table) => [table, db.prepare(`SELECT * FROM "${table}"`).all()])) };
  }

  function exportEncryptedBackup(password) {
    return { createdAt: now().toISOString(), archive: encryptBackup(snapshotDatabase(), password) };
  }

  function restoreEncryptedBackup(archive, password) {
    const snapshot = decryptBackup(archive, password);
    if (!snapshot?.tables || typeof snapshot.tables !== 'object') throw new Error('备份内容无效。');
    const available = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'extension_tokens'").all().map(({ name }) => name));
    const tables = Object.keys(snapshot.tables).filter((table) => available.has(table));
    if (!tables.length) throw new Error('备份不包含可恢复的数据。');
    fs.writeFileSync(path.join(backupDirectory, `before-restore-${Date.now()}.json`), encryptBackup(snapshotDatabase(), password), { mode: 0o600 });
    db.transaction(() => {
      for (const table of tables) db.prepare(`DELETE FROM "${table}"`).run();
      for (const table of tables) {
        const rows = Array.isArray(snapshot.tables[table]) ? snapshot.tables[table] : [];
        if (!rows.length) continue;
        const columns = Object.keys(rows[0]);
        const insert = db.prepare(`INSERT INTO "${table}" (${columns.map((column) => `"${column}"`).join(', ')}) VALUES (${columns.map((column) => `@${column}`).join(', ')})`);
        for (const row of rows) insert.run(row);
      }
    })();
    return { restoredAt: now().toISOString(), tableCount: tables.length };
  }

  function sendJson(response, status, payload) {
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
    if (response.extensionOrigin) Object.assign(headers, { 'Access-Control-Allow-Origin': response.extensionOrigin, 'Access-Control-Allow-Headers': 'Authorization, Content-Type', Vary: 'Origin' });
    response.writeHead(status, headers);
    response.end(JSON.stringify(payload));
  }
  function serveStatic(pathname, response) {
    if (!staticDirectory) return sendJson(response, 404, { error: '接口不存在。' });
    const requestedPath = pathname === '/' ? 'index.html' : pathname.slice(1);
    const resolved = path.resolve(staticDirectory, requestedPath);
    const filePath = resolved.startsWith(`${staticDirectory}${path.sep}`) || resolved === staticDirectory
      ? resolved
      : path.join(staticDirectory, 'index.html');
    const fallback = fs.existsSync(filePath) && fs.statSync(filePath).isFile() ? filePath : path.join(staticDirectory, 'index.html');
    if (!fs.existsSync(fallback)) return sendJson(response, 404, { error: '本地工作台尚未构建。' });
    const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8' };
    response.writeHead(200, { 'Content-Type': contentTypes[path.extname(fallback)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(fs.readFileSync(fallback));
  }

  async function parseRequest(request) {
    const chunks = [];
    let length = 0;
    for await (const chunk of request) {
      length += chunk.length;
      if (length > MAX_BODY_BYTES) throw new Error('请求内容过大。');
      chunks.push(chunk);
    }
    if (!chunks.length) return {};
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new Error('请求必须是 JSON。');
    }
  }

  async function handle(request, response) {
    const url = new URL(request.url, 'http://127.0.0.1');
    const { pathname } = url;
    const origin = request.headers.origin;
    if (origin?.startsWith('chrome-extension://')) response.extensionOrigin = origin;
    try {
      if (request.method === 'OPTIONS' && response.extensionOrigin) {
        response.writeHead(204, { 'Access-Control-Allow-Origin': response.extensionOrigin, 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS', Vary: 'Origin' });
        return response.end();
      }
      if (request.method === 'GET' && pathname === '/v1/health') return sendJson(response, 200, { ok: true });
      if (request.method === 'GET' && pathname === '/v1/pairing-code') return sendJson(response, 200, pairingCode());
      if (request.method === 'POST' && pathname === '/v1/pairings') return sendJson(response, 201, createExtensionToken(origin, (await parseRequest(request)).code));
      if (!isAuthorizedExtension(request)) return sendJson(response, 401, { error: '本机服务未配对或访问令牌已失效。' });
      if (request.method === 'GET' && pathname === '/v1/dashboard') return sendJson(response, 200, await getDashboard());
      if (request.method === 'GET' && pathname === '/v1/model-settings') {
        return sendJson(response, 200, typeof modelSettings?.get === 'function' ? await modelSettings.get() : { configured: false });
      }
      if (request.method === 'PUT' && pathname === '/v1/model-settings') {
        if (typeof modelSettings?.set !== 'function') return sendJson(response, 503, { error: '模型配置不可用。' });
        return sendJson(response, 200, { settings: await modelSettings.set(await parseRequest(request)) });
      }
      if (request.method === 'POST' && pathname === '/v1/model-settings/discover') {
        if (typeof modelSettings?.discover !== 'function') return sendJson(response, 503, { error: '模型发现不可用。' });
        return sendJson(response, 200, await modelSettings.discover(await parseRequest(request)));
      }
      if (request.method === 'GET' && pathname === '/v1/bark-settings') {
        return sendJson(response, 200, typeof barkSettings?.get === 'function' ? await barkSettings.get() : { configured: false, serverUrl: 'https://api.day.app' });
      }
      if (request.method === 'GET' && pathname === '/v1/finnhub-settings') {
        return sendJson(response, 200, typeof finnhubSettings?.get === 'function' ? await finnhubSettings.get() : { configured: false, provider: 'Finnhub' });
      }
      if (request.method === 'PUT' && pathname === '/v1/finnhub-settings') {
        if (typeof finnhubSettings?.set !== 'function') return sendJson(response, 503, { error: 'Finnhub 配置不可用。' });
        return sendJson(response, 200, { settings: await finnhubSettings.set(await parseRequest(request)) });
      }
      if (request.method === 'POST' && pathname === '/v1/finnhub-settings/test') {
        if (typeof finnhubSettings?.test !== 'function') return sendJson(response, 503, { error: 'Finnhub 连接检测不可用。' });
        return sendJson(response, 200, await finnhubSettings.test(await parseRequest(request)));
      }
      if (request.method === 'PUT' && pathname === '/v1/bark-settings') {
        if (typeof barkSettings?.set !== 'function') return sendJson(response, 503, { error: 'Bark 配置不可用。' });
        return sendJson(response, 200, { settings: await barkSettings.set(await parseRequest(request)) });
      }
      if (request.method === 'POST' && pathname === '/v1/backups/export') {
        const input = await parseRequest(request);
        return sendJson(response, 201, exportEncryptedBackup(input.password));
      }
      if (request.method === 'POST' && pathname === '/v1/archive-profile/confirm') {
        return sendJson(response, 200, { profile: confirmArchiveProfile(await parseRequest(request)) });
      }
      if (request.method === 'POST' && pathname === '/v1/backups/restore') {
        const input = await parseRequest(request);
        if (input.confirmation !== 'RESTORE') return sendJson(response, 400, { error: '恢复操作必须输入 RESTORE 确认。' });
        return sendJson(response, 200, restoreEncryptedBackup(input.archive, input.password));
      }
      if (request.method === 'POST' && pathname === '/v1/archive/import') {
        const buffer = await readRawBody(request);
        return sendJson(response, 201, await importArchive(buffer));
      }
      if (request.method === 'GET' && pathname === '/v1/archive-profile') {
        return sendJson(response, 200, getArchiveProfile());
      }
      if (request.method === 'GET' && pathname === '/v1/profile') return sendJson(response, 200, { profile: getProfile() });
      if (request.method === 'PUT' && pathname === '/v1/preference-overrides') return sendJson(response, 200, { preference: setPreferenceOverride(await parseRequest(request)) });
      if (request.method === 'GET' && pathname === '/v1/expiring-items') return sendJson(response, 200, { items: listExpiringItems() });
      if (request.method === 'POST' && pathname === '/v1/expiring-items') return sendJson(response, 201, { item: createExpiringItem(await parseRequest(request)) });
      const expiringItemMatch = pathname.match(/^\/v1\/expiring-items\/([^/]+)$/);
      if (expiringItemMatch && request.method === 'PATCH') {
        const item = updateExpiringItem(expiringItemMatch[1], await parseRequest(request));
        return item ? sendJson(response, 200, { item }) : sendJson(response, 404, { error: '到期项不存在。' });
      }
      if (expiringItemMatch && request.method === 'DELETE') return deleteExpiringItem(expiringItemMatch[1]) ? sendJson(response, 204, {}) : sendJson(response, 404, { error: '到期项不存在。' });
      const expiringConfirmMatch = pathname.match(/^\/v1\/expiring-items\/([^/]+)\/confirm$/);
      if (request.method === 'POST' && expiringConfirmMatch) {
        const item = confirmExpiringItem(expiringConfirmMatch[1]);
        return item ? sendJson(response, 200, { item }) : sendJson(response, 404, { error: '到期项不存在。' });
      }
      if (request.method === 'GET' && pathname === '/v1/menstrual-settings') return sendJson(response, 200, { settings: getMenstrualSettings() });
      if (request.method === 'PUT' && pathname === '/v1/menstrual-settings') return sendJson(response, 200, { settings: setMenstrualSettings(await parseRequest(request)) });
      if (request.method === 'GET' && pathname === '/v1/menstrual-cycles') return sendJson(response, 200, { cycles: listMenstrualCycles() });
      if (request.method === 'POST' && pathname === '/v1/menstrual-cycles') return sendJson(response, 201, { cycle: createMenstrualCycle(await parseRequest(request)) });
      const menstrualCycleMatch = pathname.match(/^\/v1\/menstrual-cycles\/([^/]+)$/);
      if (menstrualCycleMatch && request.method === 'PATCH') {
        const cycle = updateMenstrualCycle(menstrualCycleMatch[1], await parseRequest(request));
        return cycle ? sendJson(response, 200, { cycle }) : sendJson(response, 404, { error: '经期记录不存在。' });
      }
      if (menstrualCycleMatch && request.method === 'DELETE') return deleteMenstrualCycle(menstrualCycleMatch[1]) ? sendJson(response, 204, {}) : sendJson(response, 404, { error: '经期记录不存在。' });
      if (request.method === 'GET' && pathname === '/v1/menstrual-mood-logs') return sendJson(response, 200, { logs: listMenstrualMoodLogs() });
      if (request.method === 'POST' && pathname === '/v1/menstrual-mood-logs') return sendJson(response, 201, { log: createMenstrualMoodLog(await parseRequest(request)) });
      const menstrualMoodLogMatch = pathname.match(/^\/v1\/menstrual-mood-logs\/([^/]+)$/);
      if (menstrualMoodLogMatch && request.method === 'PATCH') {
        const moodLog = updateMenstrualMoodLog(menstrualMoodLogMatch[1], await parseRequest(request));
        return moodLog ? sendJson(response, 200, { log: moodLog }) : sendJson(response, 404, { error: '情绪记录不存在。' });
      }
      if (menstrualMoodLogMatch && request.method === 'DELETE') return deleteMenstrualMoodLog(menstrualMoodLogMatch[1]) ? sendJson(response, 204, {}) : sendJson(response, 404, { error: '情绪记录不存在。' });
      if (request.method === 'GET' && pathname === '/v1/tasks') return sendJson(response, 200, { tasks: listTasks(url.searchParams.get('status') || 'open') });
      if (request.method === 'POST' && pathname === '/v1/tasks') return sendJson(response, 201, { task: createTask(await parseRequest(request)) });
      const taskMatch = pathname.match(/^\/v1\/tasks\/([^/]+)$/);
      if (taskMatch && request.method === 'PATCH') {
        const task = updateTask(taskMatch[1], await parseRequest(request));
        return task ? sendJson(response, 200, { task }) : sendJson(response, 404, { error: '待办不存在。' });
      }
      if (taskMatch && request.method === 'DELETE') return deleteTask(taskMatch[1]) ? sendJson(response, 204, {}) : sendJson(response, 404, { error: '待办不存在。' });
      if (request.method === 'POST' && pathname === '/v1/kindle/sync') return sendJson(response, 200, await kindleSync(await parseRequest(request)));
      if (request.method === 'GET' && pathname === '/v1/stock-entry-plans') return sendJson(response, 200, { plans: listStockEntryPlans() });
      if (request.method === 'POST' && pathname === '/v1/stock-entry-plans/refresh-market-data') return sendJson(response, 200, await refreshStockEntryPlanMarketData());
      if (request.method === 'POST' && pathname === '/v1/stock-entry-plans') return sendJson(response, 201, { plan: createStockEntryPlan(await parseRequest(request)) });
      const stockEntryPlanMatch = pathname.match(/^\/v1\/stock-entry-plans\/([^/]+)$/);
      const stockEntryPlanOpenMatch = pathname.match(/^\/v1\/stock-entry-plans\/([^/]+)\/open-position$/);
      if (stockEntryPlanOpenMatch && request.method === 'POST') {
        const result = await moveStockEntryPlanToPosition(stockEntryPlanOpenMatch[1], await parseRequest(request));
        return result ? sendJson(response, 201, result) : sendJson(response, 404, { error: '待开仓股票不存在。' });
      }
      if (stockEntryPlanMatch && request.method === 'PATCH') {
        const plan = updateStockEntryPlan(stockEntryPlanMatch[1], await parseRequest(request));
        return plan ? sendJson(response, 200, { plan }) : sendJson(response, 404, { error: '待开仓股票不存在。' });
      }
      if (stockEntryPlanMatch && request.method === 'DELETE') return deleteStockEntryPlan(stockEntryPlanMatch[1]) ? sendJson(response, 204, {}) : sendJson(response, 404, { error: '待开仓股票不存在。' });
      if (request.method === 'GET' && pathname === '/v1/stock-positions') return sendJson(response, 200, { positions: listStockPositions() });
      if (request.method === 'POST' && pathname === '/v1/stock-positions/refresh-prices') return sendJson(response, 200, await refreshStockPrices());
      if (request.method === 'POST' && pathname === '/v1/stock-positions') return sendJson(response, 201, { position: await createStockPosition(await parseRequest(request)) });
      const stockPositionMatch = pathname.match(/^\/v1\/stock-positions\/([^/]+)$/);
      if (stockPositionMatch && request.method === 'PATCH') {
        const position = updateStockPosition(stockPositionMatch[1], await parseRequest(request));
        return position ? sendJson(response, 200, { position }) : sendJson(response, 404, { error: '持仓不存在。' });
      }
      if (stockPositionMatch && request.method === 'DELETE') return deleteStockPosition(stockPositionMatch[1]) ? sendJson(response, 204, {}) : sendJson(response, 404, { error: '持仓不存在。' });
      if (request.method === 'GET' && pathname === '/v1/stock-symbols') return sendJson(response, 200, { symbols: listStockSymbols() });
      if (request.method === 'GET' && pathname === '/v1/stock-market/alerts') return sendJson(response, 200, { rules: getStockAlertRules() });
      if (request.method === 'PUT' && pathname === '/v1/stock-market/alerts') return sendJson(response, 200, { rules: setStockAlertRules(await parseRequest(request)) });
      if (request.method === 'GET' && pathname === '/v1/stock-market') {
        const symbols = String(url.searchParams.get('symbols') || '').split(',');
        return sendJson(response, 200, await getStockMarketQuotes(symbols));
      }
      if (request.method === 'GET' && pathname === '/v1/stock-settings') return sendJson(response, 200, { settings: getStockSettings() });
      if (request.method === 'PUT' && pathname === '/v1/stock-settings') return sendJson(response, 200, { settings: setStockSettings(await parseRequest(request)) });
      if (request.method === 'PUT' && pathname === '/v1/profile') return sendJson(response, 200, { profile: setProfile(await parseRequest(request)) });
      if (request.method === 'GET' && pathname === '/v1/materials') return sendJson(response, 200, { materials: listMaterials() });
      if (request.method === 'POST' && pathname === '/v1/materials') return sendJson(response, 201, { material: createMaterial(await parseRequest(request)) });
      if (request.method === 'GET' && pathname === '/v1/style') return sendJson(response, 200, getStyle());
      if (request.method === 'GET' && pathname === '/v1/schedules') return sendJson(response, 200, { schedules: listSchedules() });
      const scheduleMatch = pathname.match(/^\/v1\/schedules\/([0-6])$/);
      if (request.method === 'PUT' && scheduleMatch) {
        return sendJson(response, 200, { schedule: setSchedule({ ...(await parseRequest(request)), weekday: Number(scheduleMatch[1]) }) });
      }
      if (request.method === 'POST' && pathname === '/v1/generation-runs') {
        if (typeof generator !== 'function') return sendJson(response, 503, { error: '模型服务尚未配置。' });
        const input = await parseRequest(request);
        return sendJson(response, 201, { pack: await runManualGeneration(generator, now(), input.operatingDate) });
      }
      if (request.method === 'GET' && pathname === '/v1/content-packs') return sendJson(response, 200, { packs: listPacks(Object.fromEntries(url.searchParams)) });
      if (request.method === 'POST' && pathname === '/v1/content-packs') return sendJson(response, 201, { pack: createContentPack(await parseRequest(request)) });
      if (request.method === 'GET' && pathname === '/v1/content-feedback-archive') return sendJson(response, 200, { entries: listContentFeedbackArchive() });
      const packMatch = pathname.match(/^\/v1\/content-packs\/([^/]+)$/);
      if (request.method === 'GET' && packMatch) {
        const pack = getPack(packMatch[1]);
        return pack ? sendJson(response, 200, { pack }) : sendJson(response, 404, { error: '内容包不存在。' });
      }
      if (request.method === 'POST' && pathname === '/v1/reply-sessions') return sendJson(response, 201, { session: createReplySession(await parseRequest(request)) });
      const candidatePlanMatch = pathname.match(/^\/v1\/content-candidates\/([^/]+)\/publication-plan$/);
      if (request.method === 'PUT' && candidatePlanMatch) {
        const candidate = setCandidatePublicationPlan(candidatePlanMatch[1], (await parseRequest(request)).plannedPublishTime);
        return candidate ? sendJson(response, 200, { candidate }) : sendJson(response, 404, { error: '内容候选不存在。' });
      }
      const candidateArchiveMatch = pathname.match(/^\/v1\/content-candidates\/([^/]+)\/archive$/);
      if (request.method === 'POST' && candidateArchiveMatch) {
        const entry = archiveCandidateCopy(candidateArchiveMatch[1]);
        return entry ? sendJson(response, 201, { entry }) : sendJson(response, 404, { error: '内容候选不存在。' });
      }
      const contentFeedbackMatch = pathname.match(/^\/v1\/content-feedback-archive\/([^/]+)$/);
      if (request.method === 'PUT' && contentFeedbackMatch) {
        const entry = setContentFeedbackPerformance(contentFeedbackMatch[1], (await parseRequest(request)).performance);
        return entry ? sendJson(response, 200, { entry }) : sendJson(response, 404, { error: '归档内容不存在。' });
      }
      const candidateEventMatch = pathname.match(/^\/v1\/content-candidates\/([^/]+)\/events$/);
      if (request.method === 'POST' && candidateEventMatch) {
        const event = createCandidateEvent(candidateEventMatch[1], (await parseRequest(request)).type);
        return event ? sendJson(response, 201, { event }) : sendJson(response, 404, { error: '内容候选不存在。' });
      }
      if (request.method === 'GET' && pathname === '/v1/reply-sessions') return sendJson(response, 200, { sessions: db.prepare('SELECT id FROM reply_sessions ORDER BY created_at DESC').all().map(({ id }) => getReplySession(id)) });
      const replyEventMatch = pathname.match(/^\/v1\/reply-drafts\/([^/]+)\/events$/);
      if (request.method === 'POST' && replyEventMatch) {
        const event = createReplyDraftEvent(replyEventMatch[1], (await parseRequest(request)).type);
        return event ? sendJson(response, 201, { event }) : sendJson(response, 404, { error: '回复草稿不存在。' });
      }
      if (request.method === 'GET' && !pathname.startsWith('/v1/')) return serveStatic(pathname, response);
      return sendJson(response, 404, { error: '接口不存在。' });
    } catch (error) {
      return sendJson(response, 400, { error: error.message || '请求失败。' });
    }
  }

  return {
    async listen(port = 4318) {
      if (server) throw new Error('服务已经启动。');
      server = http.createServer(handle);
      await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
      return server.address();
    },
    async close() {
      if (server) await new Promise((resolve) => server.close(resolve));
      db.close();
    },
    runMaintenance,
    runDueSchedules,
    rolloverExpiringItems,
    runExpiringReminders,
    runManualGeneration,
    setSchedule,
    listSchedules,
    createContentPack,
    setCandidatePublicationPlan,
    archiveCandidateCopy,
    listContentFeedbackArchive,
    setContentFeedbackPerformance,
    getStyle,
    runKindleSync: kindleSync
  };
}

module.exports = { createContentHub, EXPIRY_GRACE_DAYS, RETENTION_DAYS };
