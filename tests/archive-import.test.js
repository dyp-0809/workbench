const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const AdmZip = require('adm-zip');
const { createContentHub } = require('../local-hub/src/content-hub.js');

async function withHub(run, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'x-assistant-archive-'));
  const hub = await createContentHub({ dataDirectory: directory, now: () => new Date('2026-08-13T00:00:00.000Z'), ...options });
  const address = await hub.listen(0);
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try { await run({ baseUrl, hub }); } finally { await hub.close(); fs.rmSync(directory, { recursive: true, force: true }); }
}

function buildArchiveZip() {
  const zip = new AdmZip();
  zip.addFile('data/tweet.js', Buffer.from(`window.YTD.tweet.part0 = [
    { "tweet": { "id_str": "111", "created_at": "Tue Jan 02 09:30:00 +0000 2024", "full_text": "AI 大模型让前端开发更快", "lang": "zh", "retweeted": false, "favorite_count": "5", "retweet_count": "2", "reply_count": "1", "in_reply_to_status_id_str": null, "entities": { "urls": [], "user_mentions": [] } } },
    { "tweet": { "id_str": "222", "created_at": "Tue Jan 02 14:00:00 +0000 2024", "full_text": "今天去旅行拍了很多风景", "lang": "zh", "retweeted": false, "favorite_count": "3", "retweet_count": "0", "reply_count": "0", "in_reply_to_status_id_str": null, "entities": { "urls": [], "user_mentions": [] } } }
  ]`, 'utf8'));
  zip.addFile('data/account.js', Buffer.from(`window.YTD.account.part0 = [ { "account": { "accountId": "1001", "username": "zhangsan", "accountDisplayName": "张三" } } ]`, 'utf8'));
  zip.addFile('data/following.js', Buffer.from(`window.YTD.following.part0 = [ { "following": { "accountId": "2001" } } ]`, 'utf8'));
  return zip.toBuffer();
}

test('上传归档后返回客观画像并保留追溯样本', async () => {
  await withHub(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/v1/archive/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: buildArchiveZip()
    });
    const payload = await response.json();
    assert.equal(response.status, 201);
    assert.equal(payload.import.tweetCount, 2);
    assert.equal(payload.import.followingCount, 1);
    assert.equal(payload.profile.objective.language, 'zh');
    assert.equal(payload.profile.semantic, null);

    const profileResponse = await fetch(`${baseUrl}/v1/archive-profile`);
    const profile = await profileResponse.json();
    assert.equal(profileResponse.status, 200);
    assert.equal(profile.objective.contentMix.original, 2);
    assert.equal(profile.sampleTweets.length, 2);
    assert.ok(profile.objective.topics.some((item) => item.topic === 'AI'));
  });
});

test('空归档上传返回可读错误', async () => {
  await withHub(async ({ baseUrl }) => {
    const zip = new AdmZip();
    const response = await fetch(`${baseUrl}/v1/archive/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: zip.toBuffer()
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.match(payload.error, /归档/);
  });
});

test('导入后自动完成语义提炼并落库', async () => {
  const semanticExtractor = async () => ({ identity: '独立开发者', audience: 'AI 开发者', tone: '直白', perspective: 'AI 提效' });
  await withHub(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/v1/archive/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: buildArchiveZip()
    });
    const payload = await response.json();
    assert.equal(response.status, 201);
    assert.equal(payload.profile.semantic.identity, '独立开发者');

    const profile = await (await fetch(`${baseUrl}/v1/archive-profile`)).json();
    assert.equal(profile.semantic.identity, '独立开发者');
  }, { semanticExtractor });
});

test('语义提炼失败不阻断导入，客观项仍可用', async () => {
  const semanticExtractor = async () => { throw new Error('模型不可用'); };
  await withHub(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/v1/archive/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: buildArchiveZip()
    });
    const payload = await response.json();
    assert.equal(response.status, 201);
    assert.equal(payload.profile.semantic, null);
    assert.equal(payload.profile.objective.language, 'zh');
  }, { semanticExtractor });
});
