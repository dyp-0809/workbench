const test = require('node:test');
const assert = require('node:assert/strict');
const { advanceFrom, nextOccurrence } = require('../local-hub/src/recurrence.js');

test('周期计算支持天/周/月/年', () => {
  const base = '2026-01-15T10:00:00.000Z';
  assert.equal(nextOccurrence(base, 1, 'day'), '2026-01-16T10:00:00.000Z');
  assert.equal(nextOccurrence(base, 1, 'week'), '2026-01-22T10:00:00.000Z');
  assert.equal(nextOccurrence(base, 1, 'month'), '2026-02-15T10:00:00.000Z');
  assert.equal(nextOccurrence(base, 1, 'year'), '2027-01-15T10:00:00.000Z');
});

test('月尾日期加一月收拢到目标月最后一天', () => {
  assert.equal(nextOccurrence('2026-01-31T10:00:00.000Z', 1, 'month'), '2026-02-28T10:00:00.000Z');
  assert.equal(nextOccurrence('2024-01-31T10:00:00.000Z', 1, 'month'), '2024-02-29T10:00:00.000Z');
});

test('提前量计算支持分钟/小时/天', () => {
  const at = '2026-01-15T10:00:00.000Z';
  assert.equal(advanceFrom(at, 30, 'minute'), '2026-01-15T09:30:00.000Z');
  assert.equal(advanceFrom(at, 2, 'hour'), '2026-01-15T08:00:00.000Z');
  assert.equal(advanceFrom(at, 1, 'day'), '2026-01-14T10:00:00.000Z');
});

test('无效参数抛出可读错误', () => {
  assert.throws(() => nextOccurrence('bad', 1, 'day'), /起始时间/);
  assert.throws(() => nextOccurrence('2026-01-15T10:00:00.000Z', 0, 'day'), /周期/);
  assert.throws(() => advanceFrom('2026-01-15T10:00:00.000Z', 1, 'month'), /提前量/);
});
