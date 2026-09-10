const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createContentHub } = require('../local-hub/src/content-hub.js');
const { createPublicWebCapture } = require('../local-hub/src/public-web-capture.js');

async function withHub(run, options = {}) {
  const { now = () => new Date('2026-09-06T00:00:00.000Z'), ...hubOptions } = options;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'x-programming-records-'));
  const hub = await createContentHub({ dataDirectory: directory, now, ...hubOptions });
  const address = await hub.listen(0);
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run({ baseUrl, dataDirectory: directory });
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

test('编程记录默认未消化，并可通过列表记录接口切换消化标记', async () => {
  await withHub(async ({ baseUrl }) => {
    const created = await request(baseUrl, '/v1/programming-records', {
      method: 'POST',
      body: JSON.stringify({
        url: 'https://example.com/digestible',
        title: '需要深入学习的资料'
      })
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.payload.record.isDigested, false);

    const marked = await request(baseUrl, `/v1/programming-records/${created.payload.record.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isDigested: true })
    });
    assert.equal(marked.response.status, 200);
    assert.equal(marked.payload.record.isDigested, true);

    const listed = await request(baseUrl, '/v1/programming-records');
    assert.equal(listed.payload.records[0].isDigested, true);
    const detail = await request(baseUrl, `/v1/programming-records/${created.payload.record.id}`);
    assert.equal(detail.payload.record.isDigested, true);

    const unmarked = await request(baseUrl, `/v1/programming-records/${created.payload.record.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isDigested: false })
    });
    assert.equal(unmarked.response.status, 200);
    assert.equal(unmarked.payload.record.isDigested, false);

    const invalid = await request(baseUrl, `/v1/programming-records/${created.payload.record.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isDigested: 'yes' })
    });
    assert.equal(invalid.response.status, 400);
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

test('确认式公开采集只在请求时读取 metadata，确认前不写入 SQLite', async () => {
  const requestedUrls = [];
  await withHub(async ({ baseUrl }) => {
    const capture = await request(baseUrl, '/v1/programming-records/capture', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://capture.example/original' })
    });
    assert.equal(capture.response.status, 200);
    assert.deepEqual(requestedUrls, ['https://capture.example/original']);
    assert.equal(capture.payload.capture.url, 'https://capture.example/canonical');
    assert.equal(capture.payload.capture.title, 'Open Graph 标题');
    assert.equal(capture.payload.capture.summary, 'Open Graph 摘要');
    assert.equal(capture.payload.capture.author, '来源作者');
    assert.equal(capture.payload.capture.imageUrl, 'https://capture.example/cover.png');
    assert.equal((await request(baseUrl, '/v1/programming-records')).payload.total, 0);

    const saved = await request(baseUrl, '/v1/programming-records', {
      method: 'POST',
      body: JSON.stringify({
        url: capture.payload.capture.url,
        title: '人工确认标题',
        summary: capture.payload.capture.summary,
        notes: '确认后才保存。',
        sourceSnapshot: capture.payload.capture.sourceSnapshot
      })
    });
    assert.equal(saved.response.status, 201);
    assert.equal(saved.payload.record.title, '人工确认标题');
    assert.equal(saved.payload.record.sourceSnapshot.canonicalUrl, 'https://capture.example/canonical');
    assert.equal(saved.payload.record.sourceSnapshot.title, 'Open Graph 标题');
  }, {
    hostnameResolver: async () => [{ address: '93.184.216.34', family: 4 }],
    webFetcher: async (url) => {
      requestedUrls.push(url.toString());
      return {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        body: `<html><head>
          <link rel="canonical" href="https://capture.example/canonical">
          <meta property="og:title" content="Open Graph 标题">
          <meta property="og:description" content="Open Graph 摘要">
          <meta property="og:image" content="/cover.png">
          <meta name="author" content="来源作者">
          <script type="application/ld+json">{"@type":"Article","headline":"JSON-LD 标题","description":"JSON-LD 摘要"}</script>
          <title>HTML 标题</title>
        </head><body>ignored</body></html>`
      };
    }
  });
});

test('公开采集拒绝内部地址与不安全重定向，失败后仍允许手动保存', async () => {
  const requestedUrls = [];
  await withHub(async ({ baseUrl }) => {
    for (const unsafeUrl of ['http://localhost/', 'http://127.0.0.1/', 'http://10.0.0.1/', 'http://[::1]/', 'http://[fe80::1]/', 'http://[fec0::1]/', 'http://[::ffff:10.0.0.1]/', 'file:///tmp/private']) {
      const rejected = await request(baseUrl, '/v1/programming-records/capture', {
        method: 'POST',
        body: JSON.stringify({ url: unsafeUrl })
      });
      assert.equal(rejected.response.status, 400);
    }
    assert.deepEqual(requestedUrls, []);

    const redirect = await request(baseUrl, '/v1/programming-records/capture', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://redirect.example/start' })
    });
    assert.equal(redirect.response.status, 400);
    assert.deepEqual(requestedUrls, ['https://redirect.example/start']);

    const privateResolution = await request(baseUrl, '/v1/programming-records/capture', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://private-resolution.example/' })
    });
    assert.equal(privateResolution.response.status, 400);
    assert.deepEqual(requestedUrls, ['https://redirect.example/start']);

    const nonHtml = await request(baseUrl, '/v1/programming-records/capture', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://binary.example/manual' })
    });
    assert.equal(nonHtml.response.status, 400);
    assert.match(nonHtml.payload.error, /HTML/);

    const missingMetadata = await request(baseUrl, '/v1/programming-records/capture', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://missing.example/manual' })
    });
    assert.equal(missingMetadata.response.status, 200);
    assert.deepEqual(missingMetadata.payload.capture.missingFields, ['标题', '摘要', '作者', '来源图片']);

    const manual = await request(baseUrl, '/v1/programming-records', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://binary.example/manual', title: '手动补全的资料' })
    });
    assert.equal(manual.response.status, 201);
  }, {
    hostnameResolver: async (hostname) => hostname === 'private-resolution.example'
      ? [{ address: '10.0.0.8', family: 4 }]
      : [{ address: '93.184.216.34', family: 4 }],
    webFetcher: async (url) => {
      requestedUrls.push(url.toString());
      if (url.hostname === 'redirect.example') return { status: 302, headers: { location: 'http://127.0.0.1/private' }, body: '' };
      if (url.hostname === 'missing.example') return { status: 200, headers: { 'content-type': 'text/html' }, body: '<html><head></head><body>no metadata</body></html>' };
      return { status: 200, headers: { 'content-type': 'application/pdf' }, body: 'not html' };
    }
  });
});

test('重复 URL 不重新抓取，重新抓取只在确认后更新来源快照', async () => {
  let captureCalls = 0;
  await withHub(async ({ baseUrl }) => {
    const created = await request(baseUrl, '/v1/programming-records', {
      method: 'POST',
      body: JSON.stringify({
        url: 'https://refresh.example/tool',
        title: '人工维护标题',
        notes: '人工备注',
        sourceSnapshot: { canonicalUrl: 'https://refresh.example/tool', title: '旧来源标题', summary: '旧来源摘要', fetchedAt: '2026-09-06T00:00:00.000Z' }
      })
    });
    assert.equal(created.response.status, 201);

    const duplicate = await request(baseUrl, '/v1/programming-records/capture', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://REFRESH.example/tool/' })
    });
    assert.equal(duplicate.response.status, 409);
    assert.equal(duplicate.payload.existingRecord.id, created.payload.record.id);
    assert.equal(captureCalls, 0);

    const recaptured = await request(baseUrl, '/v1/programming-records/capture', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://refresh.example/tool', recordId: created.payload.record.id })
    });
    assert.equal(recaptured.response.status, 200);
    assert.equal(captureCalls, 1);

    const beforeConfirmation = await request(baseUrl, `/v1/programming-records/${created.payload.record.id}`);
    assert.equal(beforeConfirmation.payload.record.title, '人工维护标题');
    assert.equal(beforeConfirmation.payload.record.sourceSnapshot.title, '旧来源标题');

    const confirmed = await request(baseUrl, `/v1/programming-records/${created.payload.record.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ sourceSnapshot: recaptured.payload.capture.sourceSnapshot })
    });
    assert.equal(confirmed.response.status, 200);
    assert.equal(confirmed.payload.record.title, '人工维护标题');
    assert.equal(confirmed.payload.record.notes, '人工备注');
    assert.equal(confirmed.payload.record.sourceSnapshot.title, '新来源标题');
  }, {
    hostnameResolver: async () => [{ address: '93.184.216.34', family: 4 }],
    webFetcher: async () => {
      captureCalls += 1;
      return {
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: '<html><head><title>新来源标题</title><meta name="description" content="新来源摘要"></head></html>'
      };
    }
  });
});

test('公开采集以绝对期限停止，并允许公开 IPv4-mapped IPv6', async () => {
  const timeoutCapture = createPublicWebCapture({
    timeoutMs: 20,
    hostnameResolver: async () => [{ address: '93.184.216.34', family: 4 }],
    webFetcher: async () => new Promise(() => {})
  });
  await assert.rejects(timeoutCapture('https://timeout.example/'), /超时/);

  let publicIpv6Requests = 0;
  const publicIpv6Capture = createPublicWebCapture({
    webFetcher: async () => {
      publicIpv6Requests += 1;
      return { status: 200, headers: { 'content-type': 'text/html' }, body: '<html><head><title>公开映射地址</title></head></html>' };
    }
  });
  const capture = await publicIpv6Capture('http://[::ffff:93.184.216.34]/');
  assert.equal(capture.title, '公开映射地址');
  assert.equal(publicIpv6Requests, 1);
});

test('GitHub 仓库采集预填真实资料、映射标签并在确认后更新来源字段', async () => {
  const repositoryCalls = [];
  await withHub(async ({ baseUrl }) => {
    const categories = (await request(baseUrl, '/v1/programming-records/categories')).payload.categories;
    const tools = categories.find((category) => category.name === '工具');
    const frontend = categories.find((category) => category.name === '前端');
    const capture = await request(baseUrl, '/v1/programming-records/capture', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://www.github.com/Acme/Toolkit.git/tree/main?utm_source=feed' })
    });
    assert.equal(capture.response.status, 200);
    assert.equal(capture.payload.capture.url, 'https://github.com/acme/toolkit');
    assert.equal(capture.payload.capture.title, 'Acme/Toolkit');
    assert.equal(capture.payload.capture.summary, '用于维护工程工具。');
    assert.deepEqual(capture.payload.capture.missingFields, []);
    assert.deepEqual(repositoryCalls.map(({ owner, repository }) => ({ owner, repository })), [{ owner: 'acme', repository: 'toolkit' }]);
    assert.deepEqual(capture.payload.capture.sourceSnapshot.github, {
      owner: 'Acme',
      repository: 'Toolkit',
      language: 'TypeScript',
      license: 'MIT License',
      stars: 42,
      topics: ['cli', 'tooling']
    });

    const mismatched = await request(baseUrl, '/v1/programming-records', {
      method: 'POST',
      body: JSON.stringify({
        url: 'https://example.com/not-a-github-repository',
        title: '错误来源',
        sourceSnapshot: capture.payload.capture.sourceSnapshot
      })
    });
    assert.equal(mismatched.response.status, 400);
    assert.match(mismatched.payload.error, /GitHub 来源快照与记录地址不一致/);
    assert.equal((await request(baseUrl, '/v1/programming-records')).payload.total, 0);

    const saved = await request(baseUrl, '/v1/programming-records', {
      method: 'POST',
      body: JSON.stringify({
        url: capture.payload.capture.url,
        title: '人工确认的 Toolkit',
        summary: '人工维护摘要',
        notes: '人工维护备注',
        categoryIds: [frontend.id, tools.id],
        tags: ['手工标签', 'TypeScript'],
        sourceSnapshot: capture.payload.capture.sourceSnapshot
      })
    });
    assert.equal(saved.response.status, 201);
    assert.equal(saved.payload.record.sourceType, 'github');
    assert.equal(saved.payload.record.githubOwner, 'Acme');
    assert.equal(saved.payload.record.githubRepository, 'Toolkit');
    assert.equal(saved.payload.record.stars, 42);
    assert.deepEqual([...saved.payload.record.tags].sort(), ['Acme', 'TypeScript', 'cli', 'tooling', '手工标签'].sort());
    assert.deepEqual([...saved.payload.record.userTags].sort(), ['TypeScript', '手工标签'].sort());
    assert.deepEqual(saved.payload.record.categories.map((category) => category.name), ['工具', '前端']);
    assert.equal((await request(baseUrl, '/v1/programming-records?query=Acme')).payload.total, 1);

    const duplicate = await request(baseUrl, '/v1/programming-records/capture', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://GITHUB.com/acme/toolkit/' })
    });
    assert.equal(duplicate.response.status, 409);
    assert.equal(repositoryCalls.length, 1);

    const recaptured = await request(baseUrl, '/v1/programming-records/capture', {
      method: 'POST',
      body: JSON.stringify({ url: saved.payload.record.url, recordId: saved.payload.record.id })
    });
    assert.equal(recaptured.response.status, 200);
    assert.equal(recaptured.payload.capture.url, 'https://github.com/acme/renamed-toolkit');
    assert.equal(recaptured.payload.capture.sourceSnapshot.github.repository, 'Renamed-Toolkit');
    assert.equal(recaptured.payload.capture.sourceSnapshot.github.language, 'Rust');
    assert.equal((await request(baseUrl, `/v1/programming-records/${saved.payload.record.id}`)).payload.record.title, '人工确认的 Toolkit');

    const confirmed = await request(baseUrl, `/v1/programming-records/${saved.payload.record.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ url: recaptured.payload.capture.url, sourceSnapshot: recaptured.payload.capture.sourceSnapshot })
    });
    assert.equal(confirmed.response.status, 200);
    assert.equal(confirmed.payload.record.normalizedUrl, 'https://github.com/acme/renamed-toolkit');
    assert.equal(confirmed.payload.record.githubRepository, 'Renamed-Toolkit');
    assert.equal(confirmed.payload.record.title, '人工确认的 Toolkit');
    assert.equal(confirmed.payload.record.summary, '人工维护摘要');
    assert.equal(confirmed.payload.record.notes, '人工维护备注');
    assert.deepEqual(confirmed.payload.record.categories.map((category) => category.name), ['工具', '前端']);
    assert.ok(confirmed.payload.record.tags.includes('手工标签'));
    assert.ok(confirmed.payload.record.tags.includes('TypeScript'));
    assert.ok(confirmed.payload.record.tags.includes('Rust'));
    assert.ok(confirmed.payload.record.tags.includes('fast'));
    assert.ok(!confirmed.payload.record.tags.includes('cli'));
    assert.deepEqual([...confirmed.payload.record.userTags].sort(), ['TypeScript', '手工标签'].sort());
    assert.equal(confirmed.payload.record.sourceSnapshot.github.stars, 99);

    const urlOnlyChanged = await request(baseUrl, `/v1/programming-records/${saved.payload.record.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ url: 'https://github.com/acme/url-only-change' })
    });
    assert.equal(urlOnlyChanged.response.status, 200);
    assert.equal(urlOnlyChanged.payload.record.normalizedUrl, 'https://github.com/acme/url-only-change');
    assert.equal(urlOnlyChanged.payload.record.sourceSnapshot, null);
    assert.equal(urlOnlyChanged.payload.record.githubOwner, null);
    assert.equal(urlOnlyChanged.payload.record.githubRepository, null);
    assert.equal(urlOnlyChanged.payload.record.stars, null);
    assert.deepEqual([...urlOnlyChanged.payload.record.tags].sort(), ['TypeScript', '手工标签'].sort());

    const fallbackRecapture = await request(baseUrl, '/v1/programming-records/capture', {
      method: 'POST',
      body: JSON.stringify({ url: urlOnlyChanged.payload.record.url, recordId: urlOnlyChanged.payload.record.id })
    });
    assert.equal(fallbackRecapture.response.status, 200);
    assert.equal(fallbackRecapture.payload.capture.githubFallback, true);
    assert.equal(fallbackRecapture.payload.capture.sourceSnapshot.github, null);

    const fallbackConfirmed = await request(baseUrl, `/v1/programming-records/${saved.payload.record.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ url: fallbackRecapture.payload.capture.url, sourceSnapshot: fallbackRecapture.payload.capture.sourceSnapshot })
    });
    assert.equal(fallbackConfirmed.response.status, 200);
    assert.equal(fallbackConfirmed.payload.record.sourceType, 'github');
    assert.equal(fallbackConfirmed.payload.record.githubOwner, null);
    assert.equal(fallbackConfirmed.payload.record.githubRepository, null);
    assert.equal(fallbackConfirmed.payload.record.stars, null);
    assert.deepEqual([...fallbackConfirmed.payload.record.tags].sort(), ['TypeScript', '手工标签'].sort());
  }, {
    githubRepositoryFetcher: async (repository) => {
      repositoryCalls.push(repository);
      if (repositoryCalls.length === 1) {
        return {
          owner: { login: 'Acme', avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4' },
          name: 'Toolkit',
          html_url: 'https://github.com/Acme/Toolkit',
          description: '用于维护工程工具。',
          language: 'TypeScript',
          license: { name: 'MIT License' },
          stargazers_count: 42,
          topics: ['cli', 'tooling']
        };
      }
      if (repositoryCalls.length === 2) {
        return {
          owner: { login: 'Acme', avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4' },
          name: 'Renamed-Toolkit',
          html_url: 'https://github.com/Acme/Renamed-Toolkit',
          description: '用于维护工程工具的新资料。',
          language: 'Rust',
          license: { name: 'MIT License' },
          stargazers_count: 99,
          topics: ['tooling', 'fast']
        };
      }
      throw new Error('GitHub API 限流。');
    },
    hostnameResolver: async () => [{ address: '140.82.112.3', family: 4 }],
    webFetcher: async () => ({
      status: 200,
      headers: { 'content-type': 'text/html' },
      body: '<html><head><title>GitHub 网页兜底标题</title><meta name="description" content="GitHub 网页兜底摘要"></head></html>'
    })
  });
});

test('GitHub 公开 API 不可用或资料不完整时安全降级网页 metadata', async () => {
  const genericRequests = [];
  await withHub(async ({ baseUrl }) => {
    const unavailable = await request(baseUrl, '/v1/programming-records/capture', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://github.com/acme/unavailable' })
    });
    assert.equal(unavailable.response.status, 200);
    assert.equal(unavailable.payload.capture.githubFallback, true);
    assert.equal(unavailable.payload.capture.title, '网页兜底标题');
    assert.equal(unavailable.payload.capture.sourceSnapshot.github, null);

    const saved = await request(baseUrl, '/v1/programming-records', {
      method: 'POST',
      body: JSON.stringify({
        url: unavailable.payload.capture.url,
        title: '人工补全 GitHub 页面',
        tags: ['手工标签'],
        sourceSnapshot: unavailable.payload.capture.sourceSnapshot
      })
    });
    assert.equal(saved.response.status, 201);
    assert.equal(saved.payload.record.sourceType, 'github');
    assert.equal(saved.payload.record.githubOwner, null);
    assert.deepEqual(saved.payload.record.tags, ['手工标签']);

    const incomplete = await request(baseUrl, '/v1/programming-records/capture', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://github.com/acme/incomplete' })
    });
    assert.equal(incomplete.response.status, 200);
    assert.equal(incomplete.payload.capture.githubFallback, true);
    assert.equal(incomplete.payload.capture.sourceSnapshot.github, null);
    assert.deepEqual(genericRequests, [
      'https://github.com/acme/unavailable',
      'https://github.com/acme/incomplete'
    ]);
  }, {
    hostnameResolver: async () => [{ address: '140.82.112.3', family: 4 }],
    githubRepositoryFetcher: async (repository) => {
      if (repository.repository === 'unavailable') throw new Error('GitHub API 限流。');
      return {
        owner: { login: 'Acme' },
        name: 'Incomplete',
        html_url: 'https://github.com/Acme/Incomplete',
        description: '缺少 GitHub 必填资料。',
        language: 'TypeScript',
        license: { name: 'MIT License' }
      };
    },
    webFetcher: async (url) => {
      genericRequests.push(url.toString());
      return {
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: '<html><head><title>网页兜底标题</title><meta name="description" content="网页兜底摘要"></head></html>'
      };
    }
  });
});

test('GitHub Stars 导入安全处理凭证、分页、重叠预览与确认时去重', async () => {
  const token = 'ghp-test-secret-never-return';
  let storedToken = null;
  let previewRun = 0;
  const pageCalls = [];
  const repository = ({ owner = 'Acme', name, description, language = 'TypeScript', topics = [], stars = 10, privateRepository = false }) => ({
    private: privateRepository,
    visibility: privateRepository ? 'private' : 'public',
    owner: { login: owner, avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4' },
    name,
    html_url: `https://github.com/${owner}/${name}`,
    description,
    language,
    license: { name: 'MIT License' },
    stargazers_count: stars,
    topics
  });

  await withHub(async ({ baseUrl, dataDirectory }) => {
    const beforeConfiguration = await request(baseUrl, '/v1/github-stars-settings');
    assert.equal(beforeConfiguration.response.status, 200);
    assert.deepEqual(beforeConfiguration.payload, { settings: { configured: false } });

    const beforeImport = await request(baseUrl, '/v1/programming-records/github-stars/preview', { method: 'POST' });
    assert.equal(beforeImport.response.status, 400);
    assert.match(beforeImport.payload.error, /先配置 GitHub Personal Access Token/);
    assert.equal(pageCalls.length, 0);

    const categories = (await request(baseUrl, '/v1/programming-records/categories')).payload.categories;
    const frontend = categories.find((category) => category.name === '前端');
    const existing = await request(baseUrl, '/v1/programming-records', {
      method: 'POST',
      body: JSON.stringify({
        url: 'https://github.com/acme/existing',
        title: '人工保留项目',
        notes: '不要覆盖',
        tags: ['人工标签']
      })
    });
    assert.equal(existing.response.status, 201);

    const configured = await request(baseUrl, '/v1/github-stars-settings', {
      method: 'PUT',
      body: JSON.stringify({ token })
    });
    assert.equal(configured.response.status, 200);
    assert.deepEqual(configured.payload, { settings: { configured: true } });
    assert.equal(JSON.stringify(configured.payload).includes(token), false);
    assert.equal(storedToken, token);
    assert.equal(fs.readFileSync(path.join(dataDirectory, 'x-assistant.sqlite')).includes(token), false);
    const backup = await request(baseUrl, '/v1/backups/export', {
      method: 'POST',
      body: JSON.stringify({ password: 'backup-password' })
    });
    assert.equal(backup.response.status, 201);
    assert.equal(JSON.stringify(backup.payload).includes(token), false);

    const previewResponse = await request(baseUrl, '/v1/programming-records/github-stars/preview', { method: 'POST' });
    assert.equal(previewResponse.response.status, 200);
    const preview = previewResponse.payload.preview;
    assert.equal(preview.status, 'partial');
    assert.equal(preview.totalCount, 3);
    assert.equal(preview.candidateCount, 3);
    assert.equal(preview.newCount, 2);
    assert.equal(preview.overlapCount, 1);
    assert.equal(preview.failedCount, 1);
    assert.deepEqual(preview.progress, { pagesFetched: 2, processedCount: 4, complete: false });
    assert.deepEqual(preview.items.map((item) => ({ normalizedUrl: item.normalizedUrl, notes: item.notes })), [
      { normalizedUrl: 'https://github.com/acme/new-a', notes: '' },
      { normalizedUrl: 'https://github.com/acme/new-b', notes: '' }
    ]);
    assert.equal(JSON.stringify(previewResponse.payload).includes(token), false);
    assert.deepEqual(pageCalls, [
      { token, page: 1, perPage: 100 },
      { token, page: 2, perPage: 100 },
      { token, page: 3, perPage: 100 }
    ]);

    const createdBetweenPreviewAndConfirm = await request(baseUrl, '/v1/programming-records', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://github.com/acme/new-a', title: '并发新增项目' })
    });
    assert.equal(createdBetweenPreviewAndConfirm.response.status, 201);

    const confirmed = await request(baseUrl, '/v1/programming-records/github-stars/import', {
      method: 'POST',
      body: JSON.stringify({
        previewId: preview.id,
        categoryIds: [frontend.id],
        items: [
          { normalizedUrl: 'https://github.com/acme/new-a', notes: '并发重复，应该被忽略' },
          { normalizedUrl: 'https://github.com/acme/new-b', notes: '中文备注：准备研究它的 Rust 实现。' }
        ]
      })
    });
    assert.equal(confirmed.response.status, 200);
    assert.deepEqual(confirmed.payload.import, {
      requestedCount: 2,
      newCount: 1,
      overlapCount: 1,
      failedCount: 0,
      failures: []
    });

    const records = (await request(baseUrl, '/v1/programming-records?sort=title')).payload.records;
    assert.equal(records.length, 3);
    const preserved = records.find((record) => record.normalizedUrl === 'https://github.com/acme/existing');
    assert.equal(preserved.title, '人工保留项目');
    assert.equal(preserved.notes, '不要覆盖');
    const imported = records.find((record) => record.normalizedUrl === 'https://github.com/acme/new-b');
    assert.equal(imported.notes, '中文备注:准备研究它的 Rust 实现。');
    assert.equal(imported.sourceType, 'github');
    assert.equal(imported.githubOwner, 'Acme');
    assert.equal(imported.githubRepository, 'New-B');
    assert.equal(imported.stars, 20);
    assert.deepEqual(imported.categories.map((category) => category.name), ['前端']);
    assert.deepEqual([...imported.tags].sort(), ['Acme', 'Rust', 'fast'].sort());

    const repeatedPreviewResponse = await request(baseUrl, '/v1/programming-records/github-stars/preview', { method: 'POST' });
    assert.equal(repeatedPreviewResponse.response.status, 200);
    const repeatedPreview = repeatedPreviewResponse.payload.preview;
    assert.equal(repeatedPreview.status, 'complete');
    assert.equal(repeatedPreview.newCount, 0);
    assert.equal(repeatedPreview.overlapCount, 3);
    assert.deepEqual(repeatedPreview.items, []);
    assert.equal(JSON.stringify(repeatedPreviewResponse.payload).includes(token), false);

    const repeatedImport = await request(baseUrl, '/v1/programming-records/github-stars/import', {
      method: 'POST',
      body: JSON.stringify({ previewId: repeatedPreview.id, categoryIds: [] })
    });
    assert.equal(repeatedImport.response.status, 200);
    assert.deepEqual(repeatedImport.payload.import, {
      requestedCount: 0,
      newCount: 0,
      overlapCount: 0,
      failedCount: 0,
      failures: []
    });
    assert.equal((await request(baseUrl, '/v1/programming-records')).payload.total, 3);

    const cleared = await request(baseUrl, '/v1/github-stars-settings', { method: 'DELETE' });
    assert.equal(cleared.response.status, 200);
    assert.deepEqual(cleared.payload, { settings: { configured: false } });
    assert.equal(JSON.stringify(cleared.payload).includes(token), false);
  }, {
    githubStarsSettings: {
      get: async () => ({ configured: Boolean(storedToken) }),
      set: async ({ token: nextToken }) => {
        storedToken = nextToken;
        return { configured: true };
      },
      clear: async () => {
        storedToken = null;
        return { configured: false };
      },
      readToken: async () => storedToken
    },
    githubStarsPageFetcher: async (nextToken, { page, perPage }) => {
      pageCalls.push({ token: nextToken, page, perPage });
      assert.equal(nextToken, token);
      if (page === 1) {
        previewRun += 1;
        return {
          repositories: [
            repository({ name: 'Existing', description: '已有项目', stars: 1 }),
            repository({ name: 'New-A', description: '新项目 A', topics: ['cli'], stars: 11 }),
            repository({ name: 'Private', description: '私有项目', privateRepository: true })
          ],
          hasNext: true
        };
      }
      if (page === 2) {
        return {
          repositories: [repository({ name: 'New-B', description: '新项目 B', language: 'Rust', topics: ['fast'], stars: 20 })],
          hasNext: previewRun === 1
        };
      }
      throw new Error(token);
    }
  });
});
