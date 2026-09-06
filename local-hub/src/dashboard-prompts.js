const DASHBOARD_TIME_ZONE = 'Asia/Shanghai';

const SOURCE_LABELS = {
  tasks: '待办',
  expiring: '到期提醒',
  calendar: '日历',
  menstrual: '经期',
  stocks: '股票',
  content: '内容',
  specialDays: '特殊日子',
};

const PRIORITY = {
  overdue: 100,
  due: 90,
  calendar: 80,
  taskDeadline: 70,
  upcoming: 60,
  taskUndated: 50,
  menstrual: 55,
  stock: 45,
  content: 40,
  specialDay: 30,
};

function contextualPriority(basePriority, bucket, timeContext) {
  if (basePriority === PRIORITY.overdue) return basePriority;
  if (timeContext === 'early' && (bucket === 'due' || bucket === 'taskDeadline')) return basePriority + 5;
  if (timeContext === 'daytime' && bucket === 'taskDeadline') return basePriority + 10;
  if (timeContext === 'evening' && bucket === 'upcoming') return basePriority + 20;
  return basePriority;
}

function formatParts(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('提示时间无效。');
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: DASHBOARD_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
}

function partValue(parts, type) {
  return parts.find((part) => part.type === type)?.value;
}

function dashboardDateKey(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const parts = formatParts(value);
  return `${partValue(parts, 'year')}-${partValue(parts, 'month')}-${partValue(parts, 'day')}`;
}

function dashboardTimeContext(value) {
  const hour = Number(partValue(formatParts(value), 'hour'));
  if (hour >= 6 && hour < 12) return 'early';
  if (hour >= 12 && hour < 18) return 'daytime';
  return 'evening';
}

function addDays(dateKey, amount) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}


function calendarEventDate(event) {
  const date = String(event?.date || '').slice(0, 10);
  const time = /^\d{2}:[0-5]\d$/.test(String(event?.time || '')) ? event.time : '00:00';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T${time}:00+08:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function calendarEventIsEligible(event, now) {
  const eventDate = calendarEventDate(event);
  if (!eventDate) return false;
  const date = String(event.date).slice(0, 10);
  if (date === dashboardDateKey(now) && !event.time) return true;
  const delta = eventDate.getTime() - new Date(now).getTime();
  return delta >= 0 && delta <= 24 * 60 * 60 * 1000;
}

function stableEventId(event) {
  const explicit = String(event?.id || '').trim();
  if (explicit) return explicit;
  return [String(event?.date || '').slice(0, 10), String(event?.time || ''), String(event?.title || '').trim()].join('|') || 'unknown';
}

function canonicalEntityKey(value, fallback) {
  const explicit = String(value || '').trim();
  if (!explicit) return fallback;
  return explicit.startsWith('entity:') ? explicit : `entity:${explicit}`;
}

function recordEntityKey(kind, record) {
  const sharedEntity = record?.taskId ? `task:${record.taskId}` : record?.entityId || record?.entityKey;
  return canonicalEntityKey(sharedEntity, `entity:${kind}:${record?.id}`);
}

function calendarEntityKey(event) {
  let explicit = String(event?.entityId || event?.action?.entityId || '').trim();
  if (explicit && !explicit.includes(':') && event?.action?.page === 'tasks') explicit = `task:${explicit}`;
  if (explicit && !explicit.includes(':') && event?.action?.page === 'expiring') explicit = `expiring:${explicit}`;
  return canonicalEntityKey(explicit, `entity:calendar:${stableEventId(event)}`);
}

function addEntityId(action, id) {
  return id ? { ...action, entityId: String(id) } : action;
}
function sortKey(value, fallback = '9999-12-31T23:59:59.999Z') {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function sourceFor(key) {
  return { key, label: SOURCE_LABELS[key] || key };
}

function buildDashboardPromptCandidates({ tasks = [], expiringItems = [], calendarEvents = [], menstrual = null, stocks = null, content = null, specialDays = null, now = new Date() } = {}) {
  const today = dashboardDateKey(now);
  const deadlineLimit = addDays(today, 3);
  const timeContext = dashboardTimeContext(now);
  const records = [];
  const recordsByEntity = new Map();
  const add = (record) => {
    const normalized = { ...record, timeContext };
    if (normalized.entityKey && recordsByEntity.has(normalized.entityKey)) return;
    if (normalized.entityKey) recordsByEntity.set(normalized.entityKey, normalized);
    records.push(normalized);
  };

  for (const item of expiringItems) {
    if (!['overdue', 'due', 'upcoming'].includes(item.reminderStatus)) continue;
    const bucket = item.reminderStatus === 'upcoming' && item.dueDate === today ? 'due' : item.reminderStatus;
    const prefix = bucket === 'overdue' ? '先处理已逾期事项' : bucket === 'due' ? '今天先处理' : '提前看一眼';
    const reason = bucket === 'overdue' ? '有一项到期提醒已经逾期' : bucket === 'due' ? '这项到期提醒今天到期' : '这项到期提醒即将到期';
    const basePriority = bucket === 'overdue' ? PRIORITY.overdue : bucket === 'due' ? PRIORITY.due : PRIORITY.upcoming;
    add({
      id: `expiring:${item.id}`,
      entityKey: recordEntityKey('expiring', item),
      groupKey: `expiring:${bucket}`,
      kind: 'expiring',
      priority: contextualPriority(basePriority, bucket, timeContext),
      title: `${prefix}：${item.name}`,
      reason,
      source: sourceFor('expiring'),
      action: addEntityId({ label: '去查看', page: 'expiring' }, item.id),
      sortKey: sortKey(item.dueAt || item.dueDate),
    });
  }

  const datedTasks = tasks
    .filter((task) => task.status !== 'completed' && task.dueDate && task.dueDate >= today && task.dueDate <= deadlineLimit)
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)) || String(a.id).localeCompare(String(b.id)));
  const undatedTask = tasks
    .filter((task) => task.status !== 'completed' && !task.dueDate)
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || String(a.id).localeCompare(String(b.id)))[0];

  for (const task of datedTasks) {
    add({
      id: `tasks:${task.id}`,
      entityKey: recordEntityKey('task', task),
      groupKey: `tasks:deadline:${task.dueDate}`,
      kind: 'tasks',
      priority: contextualPriority(PRIORITY.taskDeadline, 'taskDeadline', timeContext),
      title: `下一步处理：${task.title}`,
      reason: `待办截止日期为 ${task.dueDate}`,
      source: sourceFor('tasks'),
      action: addEntityId({ label: '去处理', page: 'tasks' }, task.id),
      sortKey: sortKey(task.dueDate),
    });
  }
  if (undatedTask) {
    add({
      id: `tasks:${undatedTask.id}`,
      entityKey: recordEntityKey('task', undatedTask),
      groupKey: 'tasks:undated',
      kind: 'tasks',
      priority: contextualPriority(PRIORITY.taskUndated, 'taskUndated', timeContext),
      title: `下一步处理：${undatedTask.title}`,
      reason: '收集箱中有一项未完成待办',
      source: sourceFor('tasks'),
      action: addEntityId({ label: '去处理', page: 'tasks' }, undatedTask.id),
      sortKey: sortKey(undatedTask.createdAt),
    });
  }

  for (const event of calendarEvents) {
    if (event?.type === 'task' || event?.type === 'expiring' || !calendarEventIsEligible(event, now)) continue;
    const eventId = stableEventId(event);
    const baseAction = event.action && typeof event.action === 'object' ? { ...event.action } : { label: '查看日历', page: 'dashboard-v2' };
    const action = addEntityId(baseAction, event.entityId || baseAction.entityId);
    add({
      id: `calendar:${eventId}`,
      entityKey: calendarEntityKey(event),
      groupKey: `calendar:${eventId}`,
      kind: 'calendar',
      priority: contextualPriority(PRIORITY.calendar, 'calendar', timeContext),
      title: `现在准备：${event.title}`,
      reason: '这项日历安排即将开始',
      source: sourceFor('calendar'),
      action,
      sortKey: sortKey(calendarEventDate(event)),
    });
  }
  const prediction = menstrual?.enabled === false ? null : menstrual?.prediction;
  const predictionDate = String(prediction?.date || '').trim();
  const remainingDays = Number(prediction?.remainingDays);
  const stage = String(prediction?.stage || '').trim();
  const hasPredictionDate = /^\d{4}-\d{2}-\d{2}$/.test(predictionDate) && Number.isFinite(remainingDays) && remainingDays >= 0;
  if (hasPredictionDate || stage) {
    add({
      id: 'menstrual:prediction',
      entityKey: 'menstrual:prediction',
      groupKey: 'menstrual:prediction',
      kind: 'menstrual',
      priority: PRIORITY.menstrual,
      title: stage ? `经期阶段：${stage}` : `经期预计：${predictionDate}`,
      reason: hasPredictionDate ? `预计还有 ${remainingDays} 天进入下一次经期` : '当前经期阶段需要留意',
      source: sourceFor('menstrual'),
      action: { label: '查看经期', page: 'menstrual-cycle' },
      sortKey: sortKey(hasPredictionDate ? `${predictionDate}T00:00:00Z` : null),
    });
  }

  const stockAlerts = stocks?.available === true && Array.isArray(stocks.triggered) ? stocks.triggered : [];
  for (const alert of stockAlerts) {
    const ruleId = String(alert?.id || alert?.ruleId || '').trim();
    const message = String(alert?.message || '').trim();
    if (!ruleId || !message) continue;
    add({
      id: `stocks:${ruleId}`,
      entityKey: `stocks:${ruleId}`,
      groupKey: 'stocks:alert',
      kind: 'stocks',
      priority: PRIORITY.stock,
      title: `市场预警：${alert.level || ruleId}`,
      reason: message,
      source: sourceFor('stocks'),
      action: { label: '查看股票预警', page: 'stock-market' },
      sortKey: sortKey(alert.tradingDate),
    });
  }

  const contentActions = content?.available === true && Array.isArray(content.actions) ? content.actions : [];
  for (const item of contentActions) {
    const id = String(item?.id || '').trim();
    const title = String(item?.title || '').trim();
    const reason = String(item?.reason || '').trim();
    const actionTarget = item?.action && typeof item.action === 'object' ? item.action : null;
    if (!id || !title || !reason || !actionTarget?.page) continue;
    add({
      id: `content:${id}`,
      entityKey: `content:${id}`,
      groupKey: 'content:processing',
      kind: 'content',
      priority: PRIORITY.content,
      title,
      reason,
      source: sourceFor('content'),
      action: addEntityId({ ...actionTarget }, actionTarget.entityId || id),
      sortKey: sortKey(item.updatedAt || item.date),
    });
  }

  const specialEvents = specialDays?.available === true && Array.isArray(specialDays.events) ? specialDays.events : [];
  for (const event of specialEvents) {
    const date = String(event?.date || '').slice(0, 10);
    const title = String(event?.title || '').trim();
    const actionTarget = event?.action && typeof event.action === 'object' ? event.action : null;
    const eventId = stableEventId(event);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today || !title || !actionTarget?.page) continue;
    add({
      id: `specialDays:${eventId}`,
      entityKey: `specialDays:${eventId}`,
      groupKey: 'specialDays:event',
      kind: 'specialDays',
      priority: PRIORITY.specialDay,
      title: `特殊日：${title}`,
      reason: String(event.reason || '').trim() || `配置日期为 ${date}`,
      source: sourceFor('specialDays'),
      action: addEntityId({ ...actionTarget }, actionTarget.entityId || eventId),
      sortKey: sortKey(`${date}T00:00:00+08:00`),
    });
  }

  records.sort((a, b) => b.priority - a.priority || a.sortKey.localeCompare(b.sortKey) || a.id.localeCompare(b.id));
  const grouped = [];
  const groups = new Map();
  for (const record of records) {
    const existing = groups.get(record.groupKey);
    if (!existing) {
      const candidate = { ...record };
      delete candidate.groupKey;
      delete candidate.sortKey;
      delete candidate.entityKey;
      groups.set(record.groupKey, candidate);
      grouped.push(candidate);
      continue;
    }
    existing.count = (existing.count || 1) + 1;
    existing.id = record.groupKey;
    existing.title = `${existing.title.split('：')[0]}：${existing.count} 项`;
  }

  return grouped.slice(0, 3);
}

module.exports = { buildDashboardPromptCandidates, dashboardTimeContext, dashboardDateKey };
