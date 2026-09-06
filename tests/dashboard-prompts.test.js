const test = require('node:test');
const assert = require('node:assert/strict');

const { buildDashboardPromptCandidates, dashboardTimeContext } = require('../local-hub/src/dashboard-prompts.js');

test('上海时间上下文在三个区间边界稳定切换', () => {
  assert.equal(dashboardTimeContext(new Date('2026-08-12T21:59:00.000Z')), 'evening');
  assert.equal(dashboardTimeContext(new Date('2026-08-12T22:00:00.000Z')), 'early');
  assert.equal(dashboardTimeContext(new Date('2026-08-13T03:59:00.000Z')), 'early');
  assert.equal(dashboardTimeContext(new Date('2026-08-13T04:00:00.000Z')), 'daytime');
  assert.equal(dashboardTimeContext(new Date('2026-08-13T09:59:00.000Z')), 'daytime');
  assert.equal(dashboardTimeContext(new Date('2026-08-13T10:00:00.000Z')), 'evening');
});

test('提示队列优先逾期并限制为三条稳定候选', () => {
  const candidates = buildDashboardPromptCandidates({
    now: new Date('2026-08-13T04:00:00.000Z'),
    tasks: [
      { id: 'task-today', title: '今天任务', dueDate: '2026-08-13' },
      { id: 'task-undated', title: '无日期任务', dueDate: null },
    ],
    expiringItems: [
      { id: 'expiry-overdue', name: '逾期提醒', reminderStatus: 'overdue', dueAt: '2026-08-12T00:00:00.000Z' },
      { id: 'expiry-today', name: '今日提醒', reminderStatus: 'due', dueAt: '2026-08-13T01:00:00.000Z' },
      { id: 'expiry-upcoming', name: '未来提醒', reminderStatus: 'upcoming', dueAt: '2026-08-15T01:00:00.000Z' },
    ],
  });

  assert.equal(candidates.length, 3);
  assert.deepEqual(candidates.map((candidate) => candidate.id), ['expiring:expiry-overdue', 'expiring:expiry-today', 'tasks:task-today']);
  assert.equal(candidates[0].timeContext, 'daytime');
  assert.deepEqual(candidates[0].source, { key: 'expiring', label: '到期提醒' });
});

test('有截止任务时仍保留最早未设日期任务候选', () => {
  const candidates = buildDashboardPromptCandidates({
    now: new Date('2026-08-13T04:00:00.000Z'),
    tasks: [
      { id: 'task-dated', title: '有截止任务', dueDate: '2026-08-14' },
      { id: 'task-undated', title: '最早收集箱任务', dueDate: null, createdAt: '2026-08-12T00:00:00.000Z' },
    ],
  });

  assert.deepEqual(candidates.map((candidate) => candidate.id), ['tasks:task-dated', 'tasks:task-undated']);
});

test('任务截止日在三天内包含，第四天排除', () => {
  const candidates = buildDashboardPromptCandidates({
    now: new Date('2026-08-13T04:00:00.000Z'),
    tasks: [
      { id: 'task-day-three', title: '三天内任务', dueDate: '2026-08-16' },
      { id: 'task-day-four', title: '第四天任务', dueDate: '2026-08-17' },
    ],
  });

  assert.deepEqual(candidates.map((candidate) => candidate.id), ['tasks:task-day-three']);
});


test('到期日在今天但提醒尚未到点时仍进入今日优先级', () => {
  const candidates = buildDashboardPromptCandidates({
    now: new Date('2026-08-13T04:00:00.000Z'),
    expiringItems: [{ id: 'expiry-later-today', name: '今晚续费', dueDate: '2026-08-13', reminderStatus: 'upcoming', dueAt: '2026-08-13T10:00:00.000Z' }],
  });

  assert.equal(candidates[0].priority, 90);
  assert.equal(candidates[0].title, '今天先处理：今晚续费');
});
test('相同来源相近事项合并并保留真实数量', () => {
  const candidates = buildDashboardPromptCandidates({
    now: new Date('2026-08-13T00:00:00.000Z'),
    tasks: [],
    expiringItems: [
      { id: 'expiry-a', name: '逾期 A', reminderStatus: 'overdue', dueAt: '2026-08-12T00:00:00.000Z' },
      { id: 'expiry-b', name: '逾期 B', reminderStatus: 'overdue', dueAt: '2026-08-11T00:00:00.000Z' },
    ],
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].id, 'expiring:overdue');
  assert.equal(candidates[0].count, 2);
  assert.equal(candidates[0].action.page, 'expiring');
});

test('时间上下文会提升当段行动但不压过逾期事项', () => {
  const input = {
    tasks: [{ id: 'task-tomorrow', title: '明日任务', dueDate: '2026-08-14' }],
    expiringItems: [{ id: 'expiry-tomorrow', name: '明日提醒', reminderStatus: 'upcoming', dueAt: '2026-08-14T01:00:00.000Z' }],
  };
  const early = buildDashboardPromptCandidates({ ...input, now: new Date('2026-08-13T02:00:00.000Z') });
  const evening = buildDashboardPromptCandidates({ ...input, now: new Date('2026-08-13T12:00:00.000Z') });

  assert.equal(early[0].kind, 'tasks');
  assert.equal(evening[0].kind, 'expiring');
});

test('独立日历行动在未来二十四小时内进入候选并保留动作', () => {
  const candidates = buildDashboardPromptCandidates({
    now: new Date('2026-08-13T04:00:00.000Z'),
    tasks: [],
    expiringItems: [],
    calendarEvents: [
      { id: 'calendar-1', type: 'calendar', date: '2026-08-13', time: '13:00', title: '客户会议', action: { label: '查看会议', page: 'calendar', entityId: 'calendar-1' } },
      { id: 'calendar-later', type: 'calendar', date: '2026-08-15', time: '13:00', title: '下周会议', action: { label: '查看会议', page: 'calendar', entityId: 'calendar-later' } },
    ],
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].kind, 'calendar');
  assert.equal(candidates[0].source.key, 'calendar');
  assert.deepEqual(candidates[0].action, { label: '查看会议', page: 'calendar', entityId: 'calendar-1' });
});

test('派生自同一任务的日历事件不重复生成提示', () => {
  const candidates = buildDashboardPromptCandidates({
    now: new Date('2026-08-13T04:00:00.000Z'),
    tasks: [{ id: 'task-1', title: '准备会议', dueDate: '2026-08-13' }],
    expiringItems: [],
    calendarEvents: [{ id: 'task-event', type: 'task', entityId: 'task:task-1', date: '2026-08-13', time: '13:00', title: '准备会议', action: { label: '去待办', page: 'tasks', entityId: 'task-1' } }],
  });

  assert.deepEqual(candidates.map((candidate) => candidate.kind), ['tasks']);
  assert.equal(candidates[0].action.entityId, 'task-1');
});

test('可行动经期预测进入候选，禁用或缺失真实字段时跳过', () => {
  const base = {
    now: new Date('2026-08-13T04:00:00.000Z'),

    tasks: [],
    expiringItems: [],
  };
  const available = buildDashboardPromptCandidates({
    ...base,
    menstrual: { enabled: true, prediction: { date: '2026-08-15', remainingDays: 2 } },
  });
  assert.equal(available.length, 1);
  assert.equal(available[0].kind, 'menstrual');
  assert.deepEqual(available[0].source, { key: 'menstrual', label: '经期' });
  assert.deepEqual(available[0].action, { label: '查看经期', page: 'menstrual-cycle' });
  assert.equal(buildDashboardPromptCandidates({ ...base, menstrual: { enabled: false, prediction: { date: '2026-08-15', remainingDays: 2 } } }).length, 0);
  assert.equal(buildDashboardPromptCandidates({ ...base, menstrual: { enabled: true, prediction: null } }).length, 0);
});
test('任务与到期事实声明同一实体时只保留一个候选', () => {
  const candidates = buildDashboardPromptCandidates({
    now: new Date('2026-08-13T04:00:00.000Z'),
    tasks: [{ id: 'shared-work', title: '同一件工作', dueDate: '2026-08-13' }],
    expiringItems: [{ id: 'shared-reminder', taskId: 'shared-work', name: '同一件工作', dueDate: '2026-08-13', reminderStatus: 'due', dueAt: '2026-08-13T05:00:00.000Z' }],
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].kind, 'expiring');
});

test('股票候选只消费已触发的既有预警结果', () => {
  const base = { now: new Date('2026-08-13T04:00:00.000Z'), tasks: [], expiringItems: [] };
  const candidates = buildDashboardPromptCandidates({
    ...base,
    stocks: {
      available: true,
      triggered: [{ id: 'risk-warning', level: '风险预警', message: '市场风险规避加剧', tradingDate: '2026-08-13' }],
    },
  });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].kind, 'stocks');
  assert.equal(candidates[0].source.key, 'stocks');
  assert.deepEqual(candidates[0].action, { label: '查看股票预警', page: 'stock-market' });
  assert.equal(buildDashboardPromptCandidates({ ...base, stocks: { available: true, triggered: [] } }).length, 0);
  assert.equal(buildDashboardPromptCandidates({ ...base, stocks: { available: false, triggered: [{ id: 'risk-warning' }] } }).length, 0);
});

test('内容只有显式处理状态才生成提示，单纯数量不会触发', () => {
  const base = { now: new Date('2026-08-13T04:00:00.000Z'), tasks: [], expiringItems: [] };
  const processing = buildDashboardPromptCandidates({
    ...base,
    content: {
      available: true,
      actions: [{ id: 'candidate-1', title: '安排发布', reason: '已加入发布计划', action: { label: '去内容库', page: 'library', entityId: 'candidate-1' } }],
    },
  });
  assert.equal(processing.length, 1);
  assert.equal(processing[0].kind, 'content');
  assert.deepEqual(processing[0].action, { label: '去内容库', page: 'library', entityId: 'candidate-1' });
  assert.equal(buildDashboardPromptCandidates({ ...base, content: { available: true, pendingCount: 4, actions: [] } }).length, 0);
});

test('特殊日候选只接受已配置的真实日期与动作', () => {
  const base = { now: new Date('2026-08-13T04:00:00.000Z'), tasks: [], expiringItems: [] };
  const configured = buildDashboardPromptCandidates({
    ...base,
    specialDays: {
      available: true,
      events: [{ id: 'birthday', date: '2026-08-14', title: '家人生日', action: { label: '查看日程', page: 'calendar', entityId: 'birthday' } }],
    },
  });
  assert.equal(configured.length, 1);
  assert.equal(configured[0].kind, 'specialDays');
  assert.deepEqual(configured[0].action, { label: '查看日程', page: 'calendar', entityId: 'birthday' });
  assert.equal(buildDashboardPromptCandidates({ ...base, specialDays: { available: false, events: [{ id: 'guessed', date: '2026-08-14', title: '节日', action: { page: 'calendar' } }] } }).length, 0);
});
