const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createContentHub } = require('../local-hub/src/content-hub.js');
const { buildTweetPrompt, normalizeTweets } = require('../local-hub/src/tweet-generator.js');

async function withHub(tweetGenerator, run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'x-daily-tweets-'));
  const hub = await createContentHub({ dataDirectory: directory, now: () => new Date('2026-09-16T00:00:00.000Z'), tweetGenerator });
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
  const payload = await response.json();
  return { response, payload };
}

test('推文生成提示按语言数量构造明确的 JSON 输出约束', () => {
  const prompt = buildTweetPrompt({ count: 2, languages: ['zh', 'en'] });
  assert.match(prompt, /生成 4 条/);
  assert.match(prompt, /每种语言 2 条/);
  assert.match(prompt, /"language":"zh\|en"/);
});

test('推文结果按选定语言去重并拒绝不完整结果', () => {
  const normalized = normalizeTweets({ tweets: [
    { language: '中文', content: '中文草稿' },
    { language: 'en', content: 'English draft' },
    { language: 'en', content: 'English draft' },
    { language: 'zh', content: '第二条中文草稿' },
    { language: 'en', content: 'Another English draft' }
  ] }, { count: 2, languages: ['zh', 'en'] });
  assert.deepEqual(normalized.tweets.map((tweet) => tweet.language), ['zh', 'en', 'zh', 'en']);
  assert.throws(() => normalizeTweets({ tweets: [{ language: 'zh', content: '只有一条' }] }, { count: 2, languages: ['zh'] }), /完整推文/);
});

test('每日推文接口只使用已维护的完整提示词', async () => {
  await withHub(async (context) => {
    assert.equal(context.prompt.title, '每日写作');
    assert.deepEqual(context.languages, ['zh', 'en']);
    return { count: 1, languages: context.languages, tweets: [{ language: 'zh', content: '中文草稿' }, { language: 'en', content: 'English draft' }] };
  }, async ({ baseUrl }) => {
    const created = await request(baseUrl, '/v1/prompts', {
      method: 'POST',
      body: JSON.stringify({ title: '每日写作', category: 'X', content: '围绕用户定位生成推文。', enabled: true })
    });
    const generated = await request(baseUrl, '/v1/daily-tweets/generate', {
      method: 'POST',
      body: JSON.stringify({ promptId: created.payload.prompt.id, count: 1, languages: ['zh', 'en'] })
    });
    assert.equal(generated.response.status, 201);
    assert.equal(generated.payload.result.promptTitle, '每日写作');
    assert.deepEqual(generated.payload.result.tweets.map((tweet) => tweet.language), ['zh', 'en']);
  });
});

test('每日推文接口拒绝停用提示词', async () => {
  await withHub(async () => ({ count: 1, languages: ['zh'], tweets: [{ language: 'zh', content: '草稿' }] }), async ({ baseUrl }) => {
    const created = await request(baseUrl, '/v1/prompts', {
      method: 'POST',
      body: JSON.stringify({ title: '停用提示', category: 'X', content: '不可用。', enabled: false })
    });
    const generated = await request(baseUrl, '/v1/daily-tweets/generate', {
      method: 'POST',
      body: JSON.stringify({ promptId: created.payload.prompt.id, count: 1, languages: ['zh'] })
    });
    assert.equal(generated.response.status, 400);
    assert.match(generated.payload.error, /停用/);
  });
});
