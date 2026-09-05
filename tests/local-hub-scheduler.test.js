const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { createContentHub } = require('../local-hub/src/content-hub.js');

test('晚间排期只生成次日唯一的定时内容包，服务重启检查可补生成', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'x-assistant-scheduler-'));
  const hub = await createContentHub({ dataDirectory: directory });
  const generated = [];
  const generator = async ({ trigger, operatingDate }) => {
    generated.push({ trigger, operatingDate });
    return Array.from({ length: 10 }, (_, index) => ({
      content: `候选 ${index + 1}`,
      topic: 'AI',
      format: 'post',
      language: 'zh',
      tone: 'direct',
      recommendation: index < 8 ? 'recommended' : 'explore'
    }));
  };

  try {
    hub.setSchedule({ weekday: 4, time: '22:00', enabled: true, timeZone: 'Asia/Shanghai' });
    const first = await hub.runDueSchedules(generator, new Date('2026-08-13T14:30:00.000Z'));
    assert.equal(first.created.length, 1);
    assert.deepEqual(generated, [{ trigger: 'scheduled', operatingDate: '2026-08-14' }]);

    const second = await hub.runDueSchedules(generator, new Date('2026-08-13T15:00:00.000Z'));
    assert.equal(second.created.length, 0);
    assert.equal(generated.length, 1);

    hub.setSchedule({ weekday: 5, time: '22:00', enabled: true, timeZone: 'Asia/Shanghai' });
    const catchUp = await hub.runDueSchedules(generator, new Date('2026-08-14T14:30:00.000Z'));
    assert.equal(catchUp.created.length, 1);
    assert.equal(catchUp.created[0].trigger, 'scheduled');
  } finally {
    await hub.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('候选可共享计划时段，复制归档后以流量反馈优化偏好', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'x-assistant-publication-plan-'));
  const hub = await createContentHub({ dataDirectory: directory });

  try {
    const pack = hub.createContentPack({
      trigger: 'manual',
      operatingDate: '2026-08-14',
      candidates: [
        { content: '候选一', topic: 'AI', format: 'post', language: 'zh', tone: 'direct', recommendation: 'recommended', suggestedPublishTime: '09:00' },
        { content: '候选二', topic: 'AI', format: 'post', language: 'zh', tone: 'direct', recommendation: 'recommended', suggestedPublishTime: '09:00' }
      ]
    });
    const [first, second] = pack.candidates;

    assert.equal(hub.setCandidatePublicationPlan(first.id, '09:00').plannedPublishTime, '09:00');
    assert.equal(hub.setCandidatePublicationPlan(second.id, '09:00').plannedPublishTime, '09:00');
    const archived = hub.archiveCandidateCopy(first.id);
    assert.equal(archived.content, '候选一');
    assert.equal(archived.performance, 'pending');
    assert.equal(hub.listContentFeedbackArchive().length, 1);
    assert.equal(hub.setContentFeedbackPerformance(archived.id, 'good').performance, 'good');
    assert.deepEqual(hub.getStyle().archiveFeedback.good.topics.map((entry) => entry.value), ['AI']);
    let generatedPreferences;
    await hub.runManualGeneration(async ({ preferences }) => {
      generatedPreferences = preferences;
      return Array.from({ length: 10 }, (_, index) => ({
        content: `新候选 ${index}`,
        topic: 'AI',
        format: 'post',
        language: 'zh',
        tone: 'direct',
        recommendation: index < 8 ? 'recommended' : 'explore'
      }));
    }, new Date('2026-08-13T14:30:00.000Z'), '2026-08-15');
    assert.deepEqual(generatedPreferences.archiveFeedback.good.topics.map((entry) => entry.value), ['AI']);
    assert.equal(hub.setCandidatePublicationPlan(first.id, null).plannedPublishTime, null);
  } finally {
    await hub.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
