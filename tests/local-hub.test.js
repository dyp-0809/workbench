const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const { createContentHub } = require('../local-hub/src/content-hub.js');

async function withHub(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'x-assistant-hub-'));
  const hub = await createContentHub({ dataDirectory: directory, now: () => new Date('2026-08-13T00:00:00.000Z') });
  const address = await hub.listen(0);
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run({ baseUrl, hub });
  } finally {
    await hub.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

async function request(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options
  });
  const payload = await response.json();
  return { response, payload };
}

test('工作台通过服务创建定位和素材，并在概览中读取同一份数据', async () => {
  await withHub(async ({ baseUrl }) => {
    const profile = await request(baseUrl, '/v1/profile', {
      method: 'PUT',
      body: JSON.stringify({ identity: '独立开发者', audience: '正在使用 AI 的开发者', themes: ['AI', '软件工程'], language: 'zh', tone: 'direct', length: 'short' })
    });
    assert.equal(profile.response.status, 200);
    assert.equal(profile.payload.profile.identity, '独立开发者');

    const material = await request(baseUrl, '/v1/materials', {
      method: 'POST',
      body: JSON.stringify({ content: '我观察到团队引入 AI 后，知识维护比模型选择更重要', topic: 'AI', mayQuoteVerbatim: false })
    });
    assert.equal(material.response.status, 201);

    const dashboard = await request(baseUrl, '/v1/dashboard');
    assert.equal(dashboard.response.status, 200);
    assert.equal(dashboard.payload.profile.themes[0], 'AI');
    assert.equal(dashboard.payload.materialCount, 1);
    assert.equal(dashboard.payload.calendar.days.length, 42);
    assert.equal(dashboard.payload.calendar.days.filter((day) => day.lunarLabel).length, 42);
    assert.equal(dashboard.payload.calendar.timezone, 'Asia/Shanghai');
  });
});

test('无合法候选时首页提示返回诚实空态', async () => {
  await withHub(async ({ baseUrl }) => {
    const dashboard = await request(baseUrl, '/v1/dashboard');
    assert.deepEqual(dashboard.payload.personalizedPrompts, []);
    assert.equal(dashboard.payload.personalizedPrompt, null);
  });
});

test('首页提示候选包含来源原因动作并保持兼容首条提示', async () => {
  await withHub(async ({ baseUrl }) => {
    const expiring = await request(baseUrl, '/v1/expiring-items', {
      method: 'POST',
      body: JSON.stringify({ name: '续费域名', dueAt: '2026-08-12T00:00:00.000Z' })
    });
    assert.equal(expiring.response.status, 201);

    const task = await request(baseUrl, '/v1/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: '整理发布清单' })
    });
    assert.equal(task.response.status, 201);

    const dashboard = await request(baseUrl, '/v1/dashboard');
    const prompt = dashboard.payload.personalizedPrompts[0];
    assert.equal(prompt.kind, 'expiring');
    assert.deepEqual(prompt.source, { key: 'expiring', label: '到期提醒' });
    assert.equal(dashboard.payload.personalizedSources.calendar.available, true);
    assert.equal(prompt.reason, '有一项到期提醒已经逾期');
    assert.deepEqual(prompt.action, { label: '去查看', page: 'expiring', entityId: expiring.payload.item.id });
    assert.deepEqual(dashboard.payload.personalizedPrompt, prompt);
  });
});

test('首页返回默认开启的真实经期详情且不推断预测', async () => {
  await withHub(async ({ baseUrl }) => {
    await request(baseUrl, '/v1/menstrual-cycles', {
      method: 'POST',
      body: JSON.stringify({ startDate: '2026-07-01', endDate: '2026-07-05', flow: 'heavy', symptoms: '腹痛', notes: '记录睡眠' })
    });
    await request(baseUrl, '/v1/menstrual-cycles', {
      method: 'POST',
      body: JSON.stringify({ startDate: '2026-07-31', endDate: '2026-08-04', flow: 'light', symptoms: '', notes: '恢复正常' })
    });
    const dashboard = await request(baseUrl, '/v1/dashboard');
    assert.equal(dashboard.payload.privacy.menstrualEnabled, true);
    assert.equal(dashboard.payload.menstrualCycles.length, 2);
    const recorded = dashboard.payload.menstrualCycles.find((cycle) => cycle.startDate === '2026-07-01');
    assert.equal(recorded.endDate, '2026-07-05');
    assert.equal(recorded.flow, 'heavy');
    assert.equal(recorded.symptoms, '腹痛');
    assert.equal(recorded.notes, '记录睡眠');
    assert.ok(recorded.id);
    assert.ok(recorded.createdAt);
    assert.ok(recorded.updatedAt);
    assert.equal(dashboard.payload.menstrualPrediction, null);
    assert.equal(dashboard.payload.personalizedPrompts.some((prompt) => prompt.kind === 'menstrual'), false);
    assert.equal(dashboard.payload.personalizedPromptGeneratedAt, '2026-08-13T00:00:00.000Z');
    assert.equal(dashboard.payload.personalizedPromptTimeContext, 'early');
  });
});

test('显式关闭经期来源时首页不返回周期详情或预测', async () => {
  await withHub(async ({ baseUrl }) => {
    await request(baseUrl, '/v1/menstrual-cycles', {
      method: 'POST',
      body: JSON.stringify({ startDate: '2026-07-01', endDate: '2026-07-05' })
    });
    const setting = await request(baseUrl, '/v1/menstrual-settings', {
      method: 'PUT',
      body: JSON.stringify({ menstrualEnabled: false })
    });
    assert.equal(setting.payload.settings.menstrualEnabled, false);
    const dashboard = await request(baseUrl, '/v1/dashboard');
    assert.deepEqual(dashboard.payload.menstrualCycles, []);
    assert.equal(dashboard.payload.menstrualPrediction, null);
    assert.equal(dashboard.payload.personalizedSources.menstrual.configured, false);
  });
});

test('经期只有一条真实记录时保留记录但不推断预测', async () => {
  await withHub(async ({ baseUrl }) => {
    await request(baseUrl, '/v1/menstrual-cycles', {
      method: 'POST',
      body: JSON.stringify({ startDate: '2026-08-01', endDate: '2026-08-05', flow: 'medium', symptoms: '疲劳', notes: '' })
    });
    const dashboard = await request(baseUrl, '/v1/dashboard');
    assert.equal(dashboard.payload.menstrualCycles.length, 1);
    assert.equal(dashboard.payload.menstrualPrediction, null);
    assert.equal(dashboard.payload.personalizedPrompts.some((prompt) => prompt.kind === 'menstrual'), false);
  });
});

test('内容发布计划进入提示而单纯内容数量不进入，特殊日无源保持不可用', async () => {
  await withHub(async ({ baseUrl }) => {
    const created = await request(baseUrl, '/v1/content-packs', {
      method: 'POST',
      body: JSON.stringify({
        trigger: 'manual',
        operatingDate: '2026-08-13',
        candidates: [{ content: '整理本周发布内容', topic: '工作流', format: 'post', language: 'zh', tone: 'direct', recommendation: 'recommended' }]
      })
    });
    const candidateId = created.payload.pack.candidates[0].id;
    const before = await request(baseUrl, '/v1/dashboard');
    assert.equal(before.payload.personalizedPrompts.some((prompt) => prompt.kind === 'content'), false);
    await request(baseUrl, `/v1/content-candidates/${candidateId}/publication-plan`, {
      method: 'PUT',
      body: JSON.stringify({ plannedPublishTime: '10:00' })
    });
    const after = await request(baseUrl, '/v1/dashboard');
    const prompt = after.payload.personalizedPrompts.find((item) => item.kind === 'content');
    assert.equal(prompt.source.key, 'content');
    assert.deepEqual(prompt.action, { label: '去内容库', page: 'library', entityId: candidateId });
    assert.equal(after.payload.personalizedSources.specialDays.configured, false);
  });
});

test('回复会话记录明确输入与草稿采用行为，且不污染原创主题偏好', async () => {
  await withHub(async ({ baseUrl }) => {
    const session = await request(baseUrl, '/v1/reply-sessions', {
      method: 'POST',
      body: JSON.stringify({
        targetPostText: '模型变强之后，团队最重要的能力是什么？',
        sourceKind: 'clipboard',
        language: 'zh',
        style: 'insightful',
        humanTone: 3,
        result: { shouldReply: true, recommendedAction: 'reply', drafts: ['更稀缺的是把经验沉淀成可复用上下文的能力'] }
      })
    });
    assert.equal(session.response.status, 201);
    assert.equal(session.payload.session.sourceKind, 'clipboard');

    const draftId = session.payload.session.drafts[0].id;
    const event = await request(baseUrl, `/v1/reply-drafts/${draftId}/events`, {
      method: 'POST',
      body: JSON.stringify({ type: 'copied' })
    });
    assert.equal(event.response.status, 201);

    const style = await request(baseUrl, '/v1/style');
    assert.equal(style.payload.replyPreferences.style.insightful, 2);
    assert.deepEqual(style.payload.originalPreferences.topics, []);
  });
});

test('过期内容先只读保留三十天，并在清理窗口结束后删除', async () => {
  await withHub(async ({ baseUrl, hub }) => {
    const created = await request(baseUrl, '/v1/content-packs', {
      method: 'POST',
      body: JSON.stringify({ trigger: 'manual', operatingDate: '2026-02-13', createdAt: '2026-02-13T00:00:00.000Z', candidates: [{ content: '用真实案例解释 AI 落地的边界', topic: 'AI', format: 'post', language: 'zh', tone: 'direct', recommendation: 'recommended' }] })
    });
    assert.equal(created.response.status, 201);
    const packId = created.payload.pack.id;

    await hub.runMaintenance(new Date('2026-08-13T00:00:00.000Z'));
    const expired = await request(baseUrl, `/v1/content-packs/${packId}`);
    assert.equal(expired.payload.pack.retentionStatus, 'expired');
    assert.equal(expired.payload.pack.readOnly, true);

    await hub.runMaintenance(new Date('2026-09-13T00:00:00.000Z'));
    const removed = await request(baseUrl, `/v1/content-packs/${packId}`);
    assert.equal(removed.response.status, 404);
  });
});

test('概览返回本机数据路径与各部分占用空间', async () => {
  await withHub(async ({ baseUrl, hub }) => {
    const dashboard = await request(baseUrl, '/v1/dashboard');
    assert.equal(dashboard.response.status, 200);
    assert.ok(dashboard.payload.dataLocations.database.endsWith('x-assistant.sqlite'));
    assert.ok(dashboard.payload.dataLocations.backups.endsWith('backups'));
    assert.ok(dashboard.payload.dataLocations.keychain.includes('Keychain'));
    assert.equal(dashboard.payload.storageBreakdown.length, 3);
    assert.ok(dashboard.payload.storageBreakdown.find((item) => item.key === 'sqlite').bytes > 0);
    assert.ok(dashboard.payload.storageBreakdown.find((item) => item.key === 'backups').bytes >= 0);
    assert.equal(dashboard.payload.taskStats.open, 0);
    assert.equal(dashboard.payload.taskStats.completed, 0);
    assert.equal(dashboard.payload.candidateStats.active, 0);
    assert.equal(dashboard.payload.materialStats.active, 0);
  });
});
