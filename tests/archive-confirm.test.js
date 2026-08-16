const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const AdmZip = require('adm-zip');
const { createContentHub } = require('../local-hub/src/content-hub.js');

async function withHub(run, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'x-assistant-confirm-'));
  const hub = await createContentHub({ dataDirectory: directory, now: () => new Date('2026-08-13T00:00:00.000Z'), ...options });
  const address = await hub.listen(0);
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try { await run({ baseUrl, hub }); } finally { await hub.close(); fs.rmSync(directory, { recursive: true, force: true }); }
}

function buildArchiveZip() {
  const zip = new AdmZip();
  zip.addFile('data/tweet.js', Buffer.from(`window.YTD.tweet.part0 = [
    { "tweet": { "id_str": "111", "created_at": "Tue Jan 02 09:30:00 +0000 2024", "full_text": "AI 大模型让前端开发更快", "lang": "zh", "retweeted": false, "favorite_count": "5", "retweet_count": "0", "reply_count": "0", "in_reply_to_status_id_str": null, "entities": { "urls": [], "user_mentions": [] } } }
  ]`, 'utf8'));
  return zip.toBuffer();
}

async function putProfile(baseUrl, profile) {
  const response = await fetch(`${baseUrl}/v1/profile`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile) });
  return (await response.json()).profile;
}

test('逐项确认语义画像写回定位，忽略项保留原值', async () => {
  await withHub(async ({ baseUrl }) => {
    await putProfile(baseUrl, { identity: '旧身份', audience: '旧受众', tone: 'direct', perspective: '旧观点', language: 'zh' });
    const response = await fetch(`${baseUrl}/v1/archive-profile/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity: '新身份', audience: null, tone: '直白务实', perspective: '新观点' })
    });
    assert.equal(response.status, 200);
    const profile = (await response.json()).profile;
    assert.equal(profile.identity, '新身份');
    assert.equal(profile.audience, '旧受众');
    assert.equal(profile.tone, '直白务实');
    assert.equal(profile.perspective, '新观点');
  });
});

test('再次导入不覆盖已确认的定位项', async () => {
  const semanticExtractor = async () => ({ identity: '归档建议身份', audience: '归档建议受众', tone: '归档建议口吻', perspective: '归档建议观点' });
  await withHub(async ({ baseUrl }) => {
    await putProfile(baseUrl, { identity: '已确认身份', audience: '已确认受众', tone: 'direct', perspective: '已确认观点', language: 'zh' });
    const importResponse = await fetch(`${baseUrl}/v1/archive/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: buildArchiveZip()
    });
    assert.equal(importResponse.status, 201);
    const profile = (await (await fetch(`${baseUrl}/v1/profile`)).json()).profile;
    assert.equal(profile.identity, '已确认身份');
    assert.equal(profile.audience, '已确认受众');
    assert.equal(profile.tone, 'direct');
  }, { semanticExtractor });
});

test('确认请求不包含任何语义项时返回可读错误', async () => {
  await withHub(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/v1/archive-profile/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity: null, audience: null, tone: null, perspective: null })
    });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /语义/);
  });
});
