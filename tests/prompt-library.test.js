const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createContentHub } = require('../local-hub/src/content-hub.js');

async function withHub(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'x-prompts-'));
  const hub = await createContentHub({ dataDirectory: directory, now: () => new Date('2026-09-15T00:00:00.000Z') });
  const address = await hub.listen(0);
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run({ baseUrl });
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
  const payload = response.status === 204 ? null : await response.json();
  return { response, payload };
}

test('提示词支持持久化、分类、关键词筛选和启用状态筛选', async () => {
  await withHub(async ({ baseUrl }) => {
    const empty = await request(baseUrl, '/v1/prompts');
    assert.equal(empty.response.status, 200);
    assert.deepEqual(empty.payload.prompts, []);
    assert.deepEqual(empty.payload.categories, []);

    const created = await request(baseUrl, '/v1/prompts', {
      method: 'POST',
      body: JSON.stringify({
        title: '拆解复杂问题',
        category: 'AI',
        content: '请把这个问题拆成事实、判断和下一步行动。',
        notes: '用于研究前的快速整理。',
        tags: ['研究', 'AI', '研究'],
        enabled: true
      })
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.payload.prompt.title, '拆解复杂问题');
    assert.equal(created.payload.prompt.category, 'AI');
    assert.deepEqual(created.payload.prompt.tags, ['研究', 'AI']);
    assert.equal(created.payload.prompt.enabled, true);

    const disabled = await request(baseUrl, '/v1/prompts', {
      method: 'POST',
      body: JSON.stringify({
        title: '旧的写作提示',
        category: '写作',
        content: '暂时停用的提示词。',
        enabled: false
      })
    });
    assert.equal(disabled.response.status, 201);

    const filtered = await request(baseUrl, '/v1/prompts?query=事实&category=AI&status=active');
    assert.equal(filtered.response.status, 200);
    assert.equal(filtered.payload.prompts.length, 1);
    assert.equal(filtered.payload.prompts[0].id, created.payload.prompt.id);
    assert.deepEqual(filtered.payload.categories, ['AI', '写作']);

    const disabledOnly = await request(baseUrl, '/v1/prompts?status=disabled');
    assert.equal(disabledOnly.payload.prompts.length, 1);
    assert.equal(disabledOnly.payload.prompts[0].enabled, false);
  });
});

test('提示词支持编辑和确认后的永久删除，并拒绝缺少必要字段', async () => {
  await withHub(async ({ baseUrl }) => {
    const invalid = await request(baseUrl, '/v1/prompts', {
      method: 'POST',
      body: JSON.stringify({ title: '只有标题' })
    });
    assert.equal(invalid.response.status, 400);

    const created = await request(baseUrl, '/v1/prompts', {
      method: 'POST',
      body: JSON.stringify({ title: '初始标题', category: 'AI', content: '初始正文' })
    });
    const id = created.payload.prompt.id;

    const edited = await request(baseUrl, `/v1/prompts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: '更新标题', category: '工作', content: '更新正文', tags: ['计划'], enabled: false })
    });
    assert.equal(edited.response.status, 200);
    assert.equal(edited.payload.prompt.title, '更新标题');
    assert.equal(edited.payload.prompt.category, '工作');
    assert.equal(edited.payload.prompt.enabled, false);
    assert.deepEqual(edited.payload.prompt.tags, ['计划']);

    const deleted = await request(baseUrl, `/v1/prompts/${id}`, { method: 'DELETE' });
    assert.equal(deleted.response.status, 204);

    const missing = await request(baseUrl, `/v1/prompts/${id}`);
    assert.equal(missing.response.status, 404);
  });
});
test('提示词在本地服务重启后仍可读取', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'x-prompts-restart-'));
  let hub;
  try {
    hub = await createContentHub({ dataDirectory: directory, now: () => new Date('2026-09-15T00:00:00.000Z') });
    let address = await hub.listen(0);
    const created = await request(`http://127.0.0.1:${address.port}`, '/v1/prompts', {
      method: 'POST',
      body: JSON.stringify({ title: '重启保留', category: '系统', content: '这条提示词需要跨服务进程保留。' })
    });
    assert.equal(created.response.status, 201);
    await hub.close();
    hub = await createContentHub({ dataDirectory: directory, now: () => new Date('2026-09-15T00:00:00.000Z') });
    address = await hub.listen(0);
    const listed = await request(`http://127.0.0.1:${address.port}`, '/v1/prompts');
    assert.equal(listed.payload.prompts[0].title, '重启保留');
  } finally {
    await hub?.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('提示词支持短提示词类型及独立筛选', async () => {
  await withHub(async ({ baseUrl }) => {
    const full = await request(baseUrl, '/v1/prompts', {
      method: 'POST',
      body: JSON.stringify({ title: '完整提示词', category: '研究', content: '请拆解问题。' })
    });
    const short = await request(baseUrl, '/v1/prompts', {
      method: 'POST',
      body: JSON.stringify({
        kind: 'short',
        title: '第一性原理',
        category: '思维方式',
        content: '把问题还原为基本事实，再从事实重新推导。'
      })
    });
    assert.equal(full.payload.prompt.kind, 'full');
    assert.equal(short.response.status, 201);
    assert.equal(short.payload.prompt.kind, 'short');

    const shortOnly = await request(baseUrl, '/v1/prompts?kind=short');
    assert.deepEqual(shortOnly.payload.prompts.map((prompt) => prompt.title), ['第一性原理']);
    const edited = await request(baseUrl, `/v1/prompts/${short.payload.prompt.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: '第一性原理（简版）', enabled: false, tags: ['思考'] })
    });
    assert.equal(edited.response.status, 200);
    assert.equal(edited.payload.prompt.kind, 'short');
    assert.equal(edited.payload.prompt.enabled, false);
    assert.deepEqual(edited.payload.prompt.tags, ['思考']);

    const disabledShort = await request(baseUrl, '/v1/prompts?kind=short&status=disabled');
    assert.deepEqual(disabledShort.payload.prompts.map((prompt) => prompt.title), ['第一性原理(简版)']);

    const shortAfterEdit = await request(baseUrl, '/v1/prompts?kind=short');
    assert.deepEqual(shortAfterEdit.payload.prompts.map((prompt) => prompt.title), ['第一性原理(简版)']);

    const fullOnly = await request(baseUrl, '/v1/prompts?kind=full');
    assert.deepEqual(fullOnly.payload.prompts.map((prompt) => prompt.title), ['完整提示词']);
    assert.deepEqual(fullOnly.payload.categories, ['研究']);
  });
});
