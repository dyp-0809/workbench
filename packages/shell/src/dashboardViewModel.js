export function localDateKey(date) {
  if (date == null || date === '') {
    const value = new Date();
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  return String(date).slice(0, 10);
}

const SOURCE_LABELS = {
  tasks: '待办',
  expiring: '到期提醒',
  menstrual: '经期',
  stocks: '股票',
  specialDays: '特殊日子',
};

const CALENDAR_TIMEZONE = 'Asia/Shanghai';

export function calendarDateKey(value) {
  if (typeof value === 'string' && value) return value.slice(0, 10);
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return localDateKey();
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: CALENDAR_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  return `${parts.find((part) => part.type === 'year').value}-${parts.find((part) => part.type === 'month').value}-${parts.find((part) => part.type === 'day').value}`;
}

export function sortCalendarEvents(events) {
  return [...events].sort((a, b) => {
    const dateOrder = String(a.date).localeCompare(String(b.date));
    if (dateOrder) return dateOrder;
    if (!a.time && !b.time) return 0;
    if (!a.time) return 1;
    if (!b.time) return -1;
    return a.time.localeCompare(b.time);
  });
}

export function sortUpcomingItems(items) {
  return [...items].sort((a, b) => {
    const dateA = calendarDateKey(a.dueDate || a.dueAt || a.date || '');
    const dateB = calendarDateKey(b.dueDate || b.dueAt || b.date || '');
    const dateOrder = dateA.localeCompare(dateB);
    if (dateOrder) return -dateOrder;
    const timeA = a.time || (a.dueAt ? String(a.dueAt).slice(11, 16) : null);
    const timeB = b.time || (b.dueAt ? String(b.dueAt).slice(11, 16) : null);
    if (!timeA && !timeB) return 0;
    if (!timeA) return 1;
    if (!timeB) return -1;
    return -timeA.localeCompare(timeB);
  });
}

export function dashboardViewModel(dashboard) {
  const today = localDateKey();
  const openTasks = dashboard.tasks.filter((task) => task.status !== 'completed');
  const overdueItems = dashboard.expiringItems.filter((item) => item.reminderStatus === 'overdue');
  const todayItems = dashboard.expiringItems.filter((item) => item.dueDate && localDateKey(item.dueDate) === today);
  const actionItems = [
    ...overdueItems.map((item) => ({ id: `expiring-${item.id}`, type: 'expiring', title: item.name, label: '已逾期', variant: 'error', on: 'expiring', dueDate: item.dueDate })),
    ...todayItems.filter((item) => item.reminderStatus !== 'overdue').map((item) => ({ id: `due-${item.id}`, type: 'expiring', title: item.name, label: '今日到期', variant: 'warning', on: 'expiring', dueDate: item.dueDate })),
    ...openTasks.map((task) => ({ id: `task-${task.id}`, type: 'task', taskId: task.id, title: task.title, label: task.dueDate ? '待办' : '收集箱', variant: task.dueDate ? 'warning' : 'info', on: 'tasks', task, dueDate: task.dueDate })),
  ].sort((a, b) => String(b.dueDate || '').localeCompare(String(a.dueDate || '')) || String(b.id).localeCompare(String(a.id)));
  const upcomingItems = sortUpcomingItems(dashboard.expiringItems);
  const sources = dashboard.personalizedSources || {};
  const sourceEntries = Object.keys(SOURCE_LABELS).map((key) => ({ key, label: SOURCE_LABELS[key], ...(sources[key] || { configured: false, available: false }) }));
  const prompt = dashboard.personalizedPrompt || null;
  const calendar = dashboard.calendar || { days: [], events: [] };
  return {
    openTasks, overdueItems, todayItems, actionItems, upcomingItems,
    pendingCandidates: dashboard.candidateStats?.active ?? dashboard.pendingCandidateCount ?? 0,
    prompt, promptList: dashboard.personalizedPrompts || (prompt ? [prompt] : []), promptFailed: dashboard.personalizedPromptStatus === 'error' || Boolean(dashboard.personalizedPromptError),
    sourceEntries, hasAvailableSource: sourceEntries.some((source) => source.available),
    promptSourceLabel: prompt ? SOURCE_LABELS[prompt.kind] || prompt.kind : '',
    calendarDays: calendar.days || [], calendarEvents: sortCalendarEvents(calendar.events || []),
    stockHistory: dashboard.stockHistory || { available: false, points: [] },
  };
}
