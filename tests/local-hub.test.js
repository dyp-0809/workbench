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
