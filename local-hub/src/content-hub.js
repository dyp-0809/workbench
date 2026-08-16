const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const Database = require('better-sqlite3');
const { decryptBackup, encryptBackup } = require('./backup');
const { parseXArchive } = require('./archive-parser');
const { buildObjectiveProfile } = require('./archive-profile');
const { advanceFrom, nextOccurrence } = require('./recurrence');
const { getSafeBarkSettings, pushBarkNotification, writeBarkSettings } = require('./bark');

const RETENTION_DAYS = 180;
const EXPIRY_GRACE_DAYS = 30;
const MAX_BODY_BYTES = 256 * 1024;
const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;

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


function initializeSchema(db) {
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
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
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS candidate_events (
      id TEXT PRIMARY KEY,
      candidate_id TEXT NOT NULL REFERENCES content_candidates(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL CHECK(event_type IN ('selected', 'copied', 'queued', 'published')),
      created_at TEXT NOT NULL,
      UNIQUE(candidate_id, event_type)
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
  `);
  migrateExpiringItems(db);
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
    db.prepare('UPDATE expiring_items SET name = ?, due_date = ?, due_at = ?, advance_value = ?, advance_unit = ?, mode = ?, interval_value = ?, interval_unit = ?, next_at = ?, notes = ?, enabled = ?, reminded_at = ?, updated_at = ? WHERE id = ?').run(name, effectiveDueAt.slice(0, 10), effectiveDueAt, advanceValue, advanceUnit, mode, intervalValue, intervalUnit, nextAt, notes, Number(enabled), reschedules ? null : current.reminded_at, updatedAt, id);
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
      const alreadyStarted = db.prepare(`SELECT id FROM generation_runs
        WHERE operating_date = ? AND trigger_type IN ('scheduled', 'catchUp')`).get(local.date);
      if (alreadyStarted) continue;

      const runId = createId();
      const startedAt = asIso(undefined, currentTime);
      db.prepare(`INSERT INTO generation_runs(id, operating_date, trigger_type, status, error_message, created_at, completed_at)
        VALUES (?, ?, 'scheduled', 'started', NULL, ?, NULL)`).run(runId, local.date, startedAt);
      try {
        const candidates = await generator({
          trigger: 'scheduled',
          operatingDate: local.date,
          profile: getProfile(),
          materials: listMaterials().filter((material) => !material.archivedAt),
          preferences: getStyle(),
          archiveProfile: getArchiveProfile().objective
        });
        if (!Array.isArray(candidates) || candidates.length !== 10) throw new Error('定时生成必须返回完整的十条候选。');
        const pack = createContentPack({ trigger: 'scheduled', operatingDate: local.date, candidates, createdAt: startedAt });
        db.prepare(`UPDATE generation_runs SET status = 'succeeded', completed_at = ? WHERE id = ?`).run(asIso(undefined, currentTime), runId);
        created.push(pack);
      } catch (error) {
        db.prepare(`UPDATE generation_runs SET status = 'failed', error_message = ?, completed_at = ? WHERE id = ?`)
          .run(String(error.message || '生成失败').slice(0, 500), asIso(undefined, currentTime), runId);
      }
    }
    return { created };
  }
  async function runManualGeneration(generator, currentTime = now()) {
    if (typeof generator !== 'function') throw new Error('内容生成器不可用。');
    const runId = createId();
    const createdAt = asIso(undefined, currentTime);
    const operatingDate = createdAt.slice(0, 10);
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
      const statement = db.prepare(`INSERT INTO content_candidates(id, pack_id, content, topic, format, language, tone, recommendation, source_material_ids, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const item of candidates) {
        const content = String(item.content || '').trim();
        if (!content) throw new Error('候选内容不能为空。');
        statement.run(createId(), pack.id, content, String(item.topic || '未分类').trim(), String(item.format || 'post').trim(), String(item.language || 'zh').trim(), String(item.tone || 'direct').trim(), item.recommendation === 'explore' ? 'explore' : 'recommended', JSON.stringify(Array.isArray(item.sourceMaterialIds) ? item.sourceMaterialIds : []), timestamp);
      }
    });
    insert();
    return getPack(pack.id);
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

  function getDashboard() {
    const packs = listPacks();
    const tasks = listTasks('open');
    const expiringItems = listExpiringItems();
    const pendingCandidates = packs.flatMap((pack) => pack.retentionStatus === 'active' ? pack.candidates : []).length;
    return { profile: getProfile(), materialCount: materialCount(), contentPackCount: packs.length, replySessionCount: db.prepare('SELECT COUNT(*) AS count FROM reply_sessions').get().count, expiringCount: packs.filter((pack) => pack.retentionStatus === 'expired').length, recentPacks: packs.slice(0, 5), tasks, expiringItems, pendingCandidateCount: pendingCandidates };
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
    const weights = { selected: 1, copied: 2, queued: 3, published: 3 };
    const replyRows = db.prepare(`SELECT s.language, s.style, s.human_tone AS humanTone, e.event_type
      FROM reply_draft_events e JOIN reply_drafts d ON d.id = e.draft_id JOIN reply_sessions s ON s.id = d.session_id`).all();
    const candidateRows = db.prepare(`SELECT c.topic, c.format, c.language, c.tone, e.event_type
      FROM candidate_events e JOIN content_candidates c ON c.id = e.candidate_id`).all();
    const replyEntries = preferenceEntries(replyRows, ['style', 'language', 'humanTone'], weights);
    const originalEntries = preferenceEntries(candidateRows, ['topic', 'format', 'language', 'tone'], weights);
    return {
      profile: getProfile(),
      originalPreferences: { topics: originalEntries.topic, formats: originalEntries.format, languages: originalEntries.language, tones: originalEntries.tone },
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

  function getDashboard() {
    const packs = listPacks();
    const tasks = listTasks('open');
    const expiringItems = listExpiringItems();
    const pendingCandidateCount = packs.flatMap((pack) => pack.retentionStatus === 'active' ? pack.candidates : []).length;
    const completedTaskCount = db.prepare("SELECT COUNT(*) AS count FROM personal_tasks WHERE status = 'completed'").get().count;
    const expiredCandidateCount = packs.flatMap((pack) => pack.retentionStatus !== 'active' ? pack.candidates : []).length;
    const archivedMaterialCount = db.prepare('SELECT COUNT(*) AS count FROM materials WHERE archived_at IS NOT NULL').get().count;
    const databaseSizeBytes = fs.statSync(databasePath).size;
    const backupSizeBytes = directorySize(backupDirectory);
    const frontendSizeBytes = directorySize(staticDirectory);
    return { profile: getProfile(), materialCount: materialCount(), contentPackCount: packs.length, replySessionCount: db.prepare('SELECT COUNT(*) AS count FROM reply_sessions').get().count, expiringCount: packs.filter((pack) => pack.retentionStatus === 'expired').length, recentPacks: packs.slice(0, 5), tasks, expiringItems, pendingCandidateCount, taskStats: { open: tasks.length, completed: completedTaskCount }, candidateStats: { active: pendingCandidateCount, expired: expiredCandidateCount }, materialStats: { active: materialCount(), archived: archivedMaterialCount }, databasePath, databaseSizeBytes, dataLocations: { database: databasePath, backups: backupDirectory, frontend: staticDirectory, keychain: 'macOS Keychain (com.x-assistant.local-hub)' }, storageBreakdown: [{ key: 'sqlite', label: 'SQLite 数据库', bytes: databaseSizeBytes }, { key: 'backups', label: '加密备份', bytes: backupSizeBytes }, { key: 'frontend', label: '工作台前端', bytes: frontendSizeBytes }] };
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
      if (request.method === 'GET' && pathname === '/v1/dashboard') return sendJson(response, 200, getDashboard());
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
      if (request.method === 'GET' && pathname === '/v1/tasks') return sendJson(response, 200, { tasks: listTasks(url.searchParams.get('status') || 'open') });
      if (request.method === 'POST' && pathname === '/v1/tasks') return sendJson(response, 201, { task: createTask(await parseRequest(request)) });
      const taskMatch = pathname.match(/^\/v1\/tasks\/([^/]+)$/);
      if (taskMatch && request.method === 'PATCH') {
        const task = updateTask(taskMatch[1], await parseRequest(request));
        return task ? sendJson(response, 200, { task }) : sendJson(response, 404, { error: '待办不存在。' });
      }
      if (taskMatch && request.method === 'DELETE') return deleteTask(taskMatch[1]) ? sendJson(response, 204, {}) : sendJson(response, 404, { error: '待办不存在。' });
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
        return sendJson(response, 201, { pack: await runManualGeneration(generator) });
      }
      if (request.method === 'GET' && pathname === '/v1/content-packs') return sendJson(response, 200, { packs: listPacks(Object.fromEntries(url.searchParams)) });
      if (request.method === 'POST' && pathname === '/v1/content-packs') return sendJson(response, 201, { pack: createContentPack(await parseRequest(request)) });
      const packMatch = pathname.match(/^\/v1\/content-packs\/([^/]+)$/);
      if (request.method === 'GET' && packMatch) {
        const pack = getPack(packMatch[1]);
        return pack ? sendJson(response, 200, { pack }) : sendJson(response, 404, { error: '内容包不存在。' });
      }
      if (request.method === 'POST' && pathname === '/v1/reply-sessions') return sendJson(response, 201, { session: createReplySession(await parseRequest(request)) });
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
    listSchedules
  };
}

module.exports = { createContentHub, EXPIRY_GRACE_DAYS, RETENTION_DAYS };
