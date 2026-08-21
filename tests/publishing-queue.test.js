const test = require('node:test');
const assert = require('node:assert/strict');

require('../packages/chrome-extension/publishing-queue.js');

const queue = globalThis.XPublishingQueue;

const queuedPost = {
  id: 'post-1',
  content: '这是一条待发布内容',
  title: '知识库实践',
  kind: 'original',
  createdAt: '2026-08-11T09:00:00.000Z'
};

test('待发布内容在保存计划前保持本地待发布状态', () => {
  assert.deepEqual(queue.createQueuedPost(queuedPost), {
    ...queuedPost,
    plannedAt: null,
    timeZone: null,
    status: queue.QUEUE_STATUS.queued
  });
});

test('计划发布时间必须在当前时间之后且不等于已在X定时', () => {
  const planned = queue.planQueuedPost(
    queuedPost,
    '2026-08-11T20:00:00.000Z',
    'Asia/Shanghai',
    '2026-08-11T12:00:00.000Z'
  );

  assert.equal(planned.plannedAt, '2026-08-11T20:00:00.000Z');
  assert.equal(planned.timeZone, 'Asia/Shanghai');
  assert.equal(planned.status, queue.QUEUE_STATUS.queued);
  assert.throws(
    () => queue.planQueuedPost(queuedPost, '2026-08-11T11:00:00.000Z', 'Asia/Shanghai', '2026-08-11T12:00:00.000Z'),
    /晚于当前时间/
  );
});

test('仅在用户确认后标记为已在X定时', () => {
  const planned = queue.planQueuedPost(
    queuedPost,
    '2026-08-11T20:00:00.000Z',
    'Asia/Shanghai',
    '2026-08-11T12:00:00.000Z'
  );
  const scheduled = queue.markQueuedPostScheduled(planned);

  assert.equal(scheduled.status, queue.QUEUE_STATUS.scheduledExternally);
  assert.deepEqual(queue.restoreQueuedPost(scheduled), {
    ...queuedPost,
    plannedAt: null,
    timeZone: null,
    status: queue.QUEUE_STATUS.queued
  });
});

test('队列读取剔除损坏项和重复项并限制数量', () => {
  const normalized = queue.normalizeQueuedPosts([
    queuedPost,
    { ...queuedPost, title: '重复内容' },
    { id: 'broken', content: '', createdAt: '2026-08-11T09:00:00.000Z' }
  ]);

  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].id, 'post-1');
});
