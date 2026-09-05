const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { createContentHub } = require('../local-hub/src/content-hub.js');

async function withHub(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'x-assistant-menstrual-cycles-'));
  const hub = createContentHub({ dataDirectory: directory });
  const address = await hub.listen(0);
  const baseUrl = `http://127.0.0.1:${address.port}/v1`;
  try { await run(baseUrl); } finally { await hub.close(); fs.rmSync(directory, { recursive: true, force: true }); }
}

async function createCycle(baseUrl, input = {}) {
  const response = await fetch(`${baseUrl}/menstrual-cycles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ startDate: '2026-08-04', endDate: '2026-08-08', flow: 'medium', symptoms: '轻微腹痛', notes: '注意休息', ...input })
  });
  return { response, payload: await response.json() };
}

async function createMoodLog(baseUrl, input = {}) {
  const response = await fetch(`${baseUrl}/menstrual-mood-logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loggedOn: '2026-08-20', mood: 2, notes: '容易烦躁', ...input })
  });
  return { response, payload: await response.json() };
}

test('经期记录可新增、编辑、查询和删除', async () => {
  await withHub(async (baseUrl) => {
    const { response, payload: created } = await createCycle(baseUrl);
    assert.equal(response.status, 201);
    assert.deepEqual(created.cycle, {
      id: created.cycle.id,
      startDate: '2026-08-04',
      endDate: '2026-08-08',
      flow: 'medium',
      symptoms: '轻微腹痛',
      notes: '注意休息',
      createdAt: created.cycle.createdAt,
      updatedAt: created.cycle.updatedAt
    });

    const updated = await (await fetch(`${baseUrl}/menstrual-cycles/${created.cycle.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endDate: null, flow: 'light', symptoms: '无明显不适' })
    })).json();
    assert.equal(updated.cycle.endDate, null);
    assert.equal(updated.cycle.flow, 'light');
    assert.equal(updated.cycle.symptoms, '无明显不适');

    const listed = await (await fetch(`${baseUrl}/menstrual-cycles`)).json();
    assert.equal(listed.cycles.length, 1);
    assert.equal((await fetch(`${baseUrl}/menstrual-cycles/${created.cycle.id}`, { method: 'DELETE' })).status, 204);
    assert.equal((await (await fetch(`${baseUrl}/menstrual-cycles`)).json()).cycles.length, 0);
  });
});

test('经期记录拒绝无效日期和倒置日期范围', async () => {
  await withHub(async (baseUrl) => {
    const invalidDate = await createCycle(baseUrl, { startDate: '2026-02-30' });
    assert.equal(invalidDate.response.status, 400);
    assert.equal(invalidDate.payload.error, '开始日期必须是有效日期。');

    const reversedRange = await createCycle(baseUrl, { startDate: '2026-08-08', endDate: '2026-08-04' });
    assert.equal(reversedRange.response.status, 400);
    assert.equal(reversedRange.payload.error, '结束日期不能早于开始日期。');
  });
});

test('经前情绪记录可维护，且每天只允许一条记录', async () => {
  await withHub(async (baseUrl) => {
    const { response, payload: created } = await createMoodLog(baseUrl);
    assert.equal(response.status, 201);
    assert.equal(created.log.mood, 2);

    const duplicate = await createMoodLog(baseUrl);
    assert.equal(duplicate.response.status, 400);
    assert.equal(duplicate.payload.error, '当天已有情绪记录，请编辑该记录。');

    const updated = await (await fetch(`${baseUrl}/menstrual-mood-logs/${created.log.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mood: 4, notes: '状态平稳' })
    })).json();
    assert.equal(updated.log.mood, 4);
    assert.equal(updated.log.notes, '状态平稳');

    const listed = await (await fetch(`${baseUrl}/menstrual-mood-logs`)).json();
    assert.equal(listed.logs.length, 1);
    assert.equal((await fetch(`${baseUrl}/menstrual-mood-logs/${created.log.id}`, { method: 'DELETE' })).status, 204);
  });
});

test('经前情绪记录校验日期和评分', async () => {
  await withHub(async (baseUrl) => {
    const invalidDate = await createMoodLog(baseUrl, { loggedOn: '2026-02-30' });
    assert.equal(invalidDate.response.status, 400);
    assert.equal(invalidDate.payload.error, '记录日期必须是有效日期。');

    const invalidMood = await createMoodLog(baseUrl, { mood: 6 });
    assert.equal(invalidMood.response.status, 400);
    assert.equal(invalidMood.payload.error, '情绪评分必须在 1 到 5 之间。');
  });
});
