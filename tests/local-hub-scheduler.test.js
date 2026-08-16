const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { createContentHub } = require('../local-hub/src/content-hub.js');

test('到期排期只生成当天唯一的定时内容包，服务重启检查可补生成', async () => {
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
    hub.setSchedule({ weekday: 4, time: '08:00', enabled: true, timeZone: 'Asia/Shanghai' });
    const first = await hub.runDueSchedules(generator, new Date('2026-08-13T00:30:00.000Z'));
    assert.equal(first.created.length, 1);
    assert.deepEqual(generated, [{ trigger: 'scheduled', operatingDate: '2026-08-13' }]);

    const second = await hub.runDueSchedules(generator, new Date('2026-08-13T01:00:00.000Z'));
    assert.equal(second.created.length, 0);
    assert.equal(generated.length, 1);

    hub.setSchedule({ weekday: 5, time: '08:00', enabled: true, timeZone: 'Asia/Shanghai' });
    const catchUp = await hub.runDueSchedules(generator, new Date('2026-08-14T00:30:00.000Z'));
    assert.equal(catchUp.created.length, 1);
    assert.equal(catchUp.created[0].trigger, 'scheduled');
  } finally {
    await hub.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
