const test = require('node:test');
const assert = require('node:assert/strict');

let viewModel;
test.before(async () => {
  viewModel = await import('../packages/shell/src/dashboardViewModel.js');
});

test('纯日期字符串在非 UTC 时区保持原日期', () => {
  assert.equal(viewModel.localDateKey('2026-09-05'), '2026-09-05');
  assert.equal(viewModel.localDateKey('2026-09-05T00:00:00.000Z'), '2026-09-05');
});

test('首页今日到期按纯日期前十位统计', () => {
  const today = viewModel.localDateKey();
  const view = viewModel.dashboardViewModel({
    tasks: [{ id: 'task-1', title: '未完成', status: 'open' }, { id: 'task-2', title: '已完成', status: 'completed' }],
    expiringItems: [{ id: 'item-1', name: '今天到期', dueDate: `${today}T00:00:00.000Z`, reminderStatus: 'due' }, { id: 'item-2', name: '未来到期', dueDate: '2099-09-06', reminderStatus: 'upcoming' }],
    candidateStats: { active: 3 },
    taskStats: { open: 1, completed: 1 },
    pendingCandidateCount: 3,
  });
  assert.equal(view.openTasks.length, 1);
  assert.equal(view.todayItems.length, 1);
  assert.equal(view.pendingCandidates, 3);
});

test('个性化提示只消费后端返回的一条提示和来源', () => {
  const view = viewModel.dashboardViewModel({
    tasks: [], expiringItems: [], candidateStats: { active: 0 },
    personalizedPrompt: { kind: 'stocks', priority: 60, title: '检查异常波动', reason: '日涨跌幅达到阈值', action: { label: '查看股票', page: 'stock-positions' } },
    personalizedSources: {
      tasks: { configured: true, available: true },
      expiring: { configured: true, available: true },
      menstrual: { configured: false, available: false },
      stocks: { configured: true, available: true },
      specialDays: { configured: false, available: false },
    },
  });
  assert.equal(view.prompt.title, '检查异常波动');
  assert.equal(view.promptSourceLabel, '股票');
  assert.equal(view.hasAvailableSource, true);
});

test('个性化提示数组保持后端候选顺序，不在视图模型中生成候选', () => {
  const prompts = [
    { kind: 'tasks', priority: 30, title: '处理待办', reason: '有待办事项', action: { label: '去待办', page: 'tasks' } },
    { kind: 'expiring', priority: 20, title: '查看到期提醒', reason: '有即将到期事项', action: { label: '查看到期', page: 'expiring' } },
  ];
  const view = viewModel.dashboardViewModel({
    tasks: [], expiringItems: [], candidateStats: { active: 0 }, personalizedPrompts: prompts,
  });
  assert.deepEqual(view.promptList, prompts);
  assert.equal(view.prompt, null);
});

test('来源全部不可用时不把 null 提示误报成无优先事项', () => {
  const view = viewModel.dashboardViewModel({ tasks: [], expiringItems: [], candidateStats: { active: 0 } });
  assert.equal(view.prompt, null);
  assert.equal(view.hasAvailableSource, false);
  assert.equal(view.sourceEntries.find((source) => source.key === 'menstrual').label, '经期');
});

test('后端提示失败状态独立于空提示', () => {
  const view = viewModel.dashboardViewModel({ tasks: [], expiringItems: [], candidateStats: { active: 0 }, personalizedPromptStatus: 'error' });
  assert.equal(view.promptFailed, true);
});

test('日历事件按日期和时间排序，无时间事件置后', () => {
  const events = viewModel.sortCalendarEvents([
    { id: 'late', date: '2026-09-05', time: null },
    { id: 'next', date: '2026-09-06', time: '08:00' },
    { id: 'early', date: '2026-09-05', time: '09:00' },
  ]);
  assert.deepEqual(events.map((event) => event.id), ['early', 'late', 'next']);
});

test('股票历史缺失时保持结构化空态，不生成曲线数据', () => {
  const view = viewModel.dashboardViewModel({ tasks: [], expiringItems: [], candidateStats: { active: 0 } });
  assert.deepEqual(view.stockHistory, { available: false, points: [] });
});

test('即将到期按上海日期和时间倒序排列', () => {
  const items = viewModel.sortUpcomingItems([
    { id: 'no-time', dueDate: '2026-09-05', time: null },
    { id: 'later', dueDate: '2026-09-05', time: '18:00' },
    { id: 'earlier', dueDate: '2026-09-05', time: '09:00' },
    { id: 'next-day', dueDate: '2026-09-06', time: '08:00' },
  ]);
  assert.deepEqual(items.map((item) => item.id), ['next-day', 'later', 'earlier', 'no-time']);
});
