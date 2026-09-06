const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createContentHub } = require('../local-hub/src/content-hub.js');

async function withHub(run, { now = () => new Date('2026-09-06T00:00:00.000Z') } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'x-programming-records-'));
  const hub = await createContentHub({ dataDirectory: directory, now });
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

test('编程记录预置分类并保存用户确认的多分类与标签', async () => {
  await withHub(async ({ baseUrl }) => {
    const categories = await request(baseUrl, '/v1/programming-records/categories');
    assert.equal(categories.response.status, 200);
    assert.deepEqual(categories.payload.categories.map((category) => category.name), ['工具', 'AI', '汇总', 'UI 框架', '来源库', '前端', '后端']);

    const tool = categories.payload.categories.find((category) => category.name === '工具');
    const frontend = categories.payload.categories.find((category) => category.name === '前端');
    const created = await request(baseUrl, '/v1/programming-records', {
      method: 'POST',
      body: JSON.stringify({
        url: 'HTTPS://Example.com/tools/formatter/?utm_source=feed#install',
        title: 'Formatter',
        summary: '一个可维护的格式化工具。',
        categoryIds: [frontend.id, tool.id],
        tags: ['CLI', '格式化'],
        notes: '先用于前端项目。'
      })
    });

    assert.equal(created.response.status, 201);
    assert.equal(created.payload.record.url, 'HTTPS://Example.com/tools/formatter/?utm_source=feed#install');
    assert.equal(created.payload.record.normalizedUrl, 'https://example.com/tools/formatter');
    assert.deepEqual(created.payload.record.categories.map((category) => category.name), ['工具', '前端']);
    assert.deepEqual(created.payload.record.tags, ['CLI', '格式化']);
    assert.equal(created.payload.record.status, 'active');

    const detail = await request(baseUrl, `/v1/programming-records/${created.payload.record.id}`);
    assert.equal(detail.response.status, 200);
    assert.equal(detail.payload.record.notes, '先用于前端项目。');
    assert.deepEqual(detail.payload.record.categories.map((category) => category.name), ['工具', '前端']);

    const listed = await request(baseUrl, `/v1/programming-records?categoryIds=${frontend.id}&query=格式化`);
    assert.equal(listed.response.status, 200);
    assert.equal(listed.payload.total, 1);
    assert.equal(listed.payload.page, 1);
    assert.equal(listed.payload.records[0].id, created.payload.record.id);
  });
});

test('分类可新增、重命名和停用，历史关联仍可读取且归入未分类筛选', async () => {
  await withHub(async ({ baseUrl }) => {
    const createdCategory = await request(baseUrl, '/v1/programming-records/categories', {
      method: 'POST',
      body: JSON.stringify({ name: '可视化' })
    });
    assert.equal(createdCategory.response.status, 201);
    const categoryId = createdCategory.payload.category.id;

    const createdRecord = await request(baseUrl, '/v1/programming-records', {
      method: 'POST',
      body: JSON.stringify({
        url: 'https://example.com/visualization',
        title: '图表工具',
        categoryIds: [categoryId]
      })
    });
    assert.equal(createdRecord.response.status, 201);

    const renamed = await request(baseUrl, `/v1/programming-records/categories/${categoryId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: '数据可视化' })
    });
    assert.equal(renamed.response.status, 200);
    assert.equal(renamed.payload.category.name, '数据可视化');

    const deactivated = await request(baseUrl, `/v1/programming-records/categories/${categoryId}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive: false })
    });
    assert.equal(deactivated.response.status, 200);
    assert.equal(deactivated.payload.category.isActive, false);

    const record = await request(baseUrl, '/v1/programming-records');
    assert.equal(record.payload.records[0].categories[0].name, '数据可视化');
    assert.equal(record.payload.records[0].categories[0].isActive, false);

    const unclassified = await request(baseUrl, '/v1/programming-records?unclassified=true');
    assert.equal(unclassified.response.status, 200);
    assert.equal(unclassified.payload.total, 1);
    assert.equal(unclassified.payload.records[0].id, createdRecord.payload.record.id);
  });
});

test('编程记录可编辑、归档、恢复和删除，并拒绝规范化地址重复写入', async () => {
  await withHub(async ({ baseUrl }) => {
    const categories = await request(baseUrl, '/v1/programming-records/categories');
    const backend = categories.payload.categories.find((category) => category.name === '后端');
    const created = await request(baseUrl, '/v1/programming-records', {
      method: 'POST',
      body: JSON.stringify({
        url: 'https://example.com/reference/',
        title: '初始标题',
        summary: '初始摘要',
        tags: ['初始标签']
      })
    });
    assert.equal(created.response.status, 201);
    const recordId = created.payload.record.id;

    const duplicate = await request(baseUrl, '/v1/programming-records', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://EXAMPLE.com/reference/?utm_medium=email#top', title: '重复标题' })
    });
    assert.equal(duplicate.response.status, 409);
    assert.equal(duplicate.payload.existingRecord.id, recordId);

    const edited = await request(baseUrl, `/v1/programming-records/${recordId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        title: '已维护标题',
        summary: '已维护摘要',
        notes: '维护备注',
        categoryIds: [backend.id],
        tags: ['API', '服务端']
      })
    });
    assert.equal(edited.response.status, 200);
    assert.equal(edited.payload.record.title, '已维护标题');
    assert.deepEqual(edited.payload.record.categories.map((category) => category.name), ['后端']);
    assert.deepEqual(edited.payload.record.tags, ['API', '服务端']);

    const archived = await request(baseUrl, `/v1/programming-records/${recordId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'archived' })
    });
    assert.equal(archived.response.status, 200);
    assert.equal(archived.payload.record.status, 'archived');
    assert.equal((await request(baseUrl, '/v1/programming-records')).payload.total, 0);
    assert.equal((await request(baseUrl, '/v1/programming-records?status=archived')).payload.total, 1);

    const restored = await request(baseUrl, `/v1/programming-records/${recordId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'active' })
    });
    assert.equal(restored.response.status, 200);
    assert.equal(restored.payload.record.archivedAt, null);

    const removed = await request(baseUrl, `/v1/programming-records/${recordId}`, { method: 'DELETE' });
    assert.equal(removed.response.status, 204);
    assert.equal((await request(baseUrl, '/v1/programming-records?status=all')).payload.total, 0);
  });
});

test('记录列表在 SQLite 中执行标签搜索、分类任一命中、状态、排序和分页', async () => {
  let currentTime = new Date('2026-09-06T00:00:00.000Z');
  await withHub(async ({ baseUrl }) => {
    const categories = (await request(baseUrl, '/v1/programming-records/categories')).payload.categories;
    const ai = categories.find((category) => category.name === 'AI');
    const frontend = categories.find((category) => category.name === '前端');
    const tools = categories.find((category) => category.name === '工具');
    const records = [
      { url: 'https://example.com/a', title: 'Alpha', categoryIds: [ai.id], tags: ['模型'], notes: '保留这个检索词' },
      { url: 'https://example.com/b', title: 'Beta', categoryIds: [frontend.id], tags: ['界面'], notes: '' },
      { url: 'https://example.com/c', title: 'Gamma', categoryIds: [tools.id], tags: ['命令行'], notes: '' }
    ];
    const createdRecords = [];
    for (const [index, record] of records.entries()) {
      currentTime = new Date(`2026-09-06T00:00:0${index}.000Z`);
      const created = await request(baseUrl, '/v1/programming-records', { method: 'POST', body: JSON.stringify(record) });
      assert.equal(created.response.status, 201);
      createdRecords.push(created.payload.record);
    }

    currentTime = new Date('2026-09-06T00:00:03.000Z');
    assert.equal((await request(baseUrl, `/v1/programming-records/${createdRecords[0].id}`, {
      method: 'PATCH',
      body: JSON.stringify({ notes: '保留这个检索词，且人工更新过。' })
    })).response.status, 200);
    currentTime = new Date('2026-09-06T00:00:04.000Z');
    assert.equal((await request(baseUrl, `/v1/programming-records/${createdRecords[2].id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'archived' })
    })).response.status, 200);

    const filtered = await request(baseUrl, `/v1/programming-records?categoryIds=${ai.id},${frontend.id}&sort=title&pageSize=1&page=2`);
    assert.equal(filtered.response.status, 200);
    assert.equal(filtered.payload.total, 2);
    assert.equal(filtered.payload.records.length, 1);
    assert.equal(filtered.payload.records[0].title, 'Beta');

    const searched = await request(baseUrl, '/v1/programming-records?query=检索词');
    assert.equal(searched.response.status, 200);
    assert.deepEqual(searched.payload.records.map((record) => record.title), ['Alpha']);

    const byCreatedAt = await request(baseUrl, '/v1/programming-records?status=all&sort=createdAt');
    assert.deepEqual(byCreatedAt.payload.records.map((record) => record.title), ['Gamma', 'Beta', 'Alpha']);
    const byUpdatedAt = await request(baseUrl, '/v1/programming-records?status=all&sort=updatedAt');
    assert.deepEqual(byUpdatedAt.payload.records.map((record) => record.title), ['Gamma', 'Alpha', 'Beta']);
    assert.deepEqual(byUpdatedAt.payload.records.map((record) => record.status), ['archived', 'active', 'active']);
  }, { now: () => currentTime });
});

test('加密备份恢复完整保留编程记录、分类和标签关联', async () => {
  await withHub(async ({ baseUrl }) => {
    const categories = (await request(baseUrl, '/v1/programming-records/categories')).payload.categories;
    const created = await request(baseUrl, '/v1/programming-records', {
      method: 'POST',
      body: JSON.stringify({
        url: 'https://example.com/backed-up-record',
        title: '需要恢复的记录',
        categoryIds: [categories.find((category) => category.name === '来源库').id],
        tags: ['恢复测试']
      })
    });
    assert.equal(created.response.status, 201);

    const password = 'correct-horse-battery-staple';
    const backup = await request(baseUrl, '/v1/backups/export', {
      method: 'POST',
      body: JSON.stringify({ password })
    });
    assert.equal(backup.response.status, 201);

    await request(baseUrl, `/v1/programming-records/${created.payload.record.id}`, { method: 'DELETE' });
    assert.equal((await request(baseUrl, '/v1/programming-records')).payload.total, 0);

    const restored = await request(baseUrl, '/v1/backups/restore', {
      method: 'POST',
      body: JSON.stringify({ archive: backup.payload.archive, password, confirmation: 'RESTORE' })
    });
    assert.equal(restored.response.status, 200);

    const records = await request(baseUrl, '/v1/programming-records');
    assert.equal(records.payload.total, 1);
    assert.deepEqual(records.payload.records[0].categories.map((category) => category.name), ['来源库']);
    assert.deepEqual(records.payload.records[0].tags, ['恢复测试']);
  });
});
