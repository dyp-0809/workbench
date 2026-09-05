const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPrompt, normalizeCandidates, SUGGESTED_PUBLISH_TIMES, toGenerationError } = require('../local-hub/src/daily-generator.js');

function candidate(index, recommendation) {
  return {
    content: `候选内容 ${index}`,
    topic: index < 2 ? '人生感悟' : 'AI',
    format: 'post',
    tone: 'direct',
    recommendation,
    suggestedPublishTime: SUGGESTED_PUBLISH_TIMES[index % SUGGESTED_PUBLISH_TIMES.length]
  };
}

test('模型以中文探索标记返回时仍识别两条探索候选', () => {
  const payload = {
    candidates: Array.from({ length: 10 }, (_, index) => candidate(index, index < 8 ? '推荐' : '探索'))
  };
  const normalized = normalizeCandidates(payload, []);
  assert.equal(normalized.filter((item) => item.recommendation === 'explore').length, 2);
  assert.equal(normalized.filter((item) => item.topic === '人生感悟').length, 2);
});

test('候选按五个建议时段均匀分配，供次日人工排期', () => {
  const payload = {
    candidates: Array.from({ length: 10 }, (_, index) => candidate(index, index < 8 ? 'recommended' : 'explore'))
  };
  const normalized = normalizeCandidates(payload, []);
  assert.deepEqual(normalized.map((item) => item.suggestedPublishTime), [...SUGGESTED_PUBLISH_TIMES, ...SUGGESTED_PUBLISH_TIMES]);
});

test('模型请求超时时给出可操作的中文错误', () => {
  const error = toGenerationError(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));
  assert.equal(error.message, '内容生成超过 2 分钟，请检查模型服务连接或稍后重试。');
});

test('生成提示将领域知识隔离，并包含人生感悟候选', () => {
  const prompt = buildPrompt({
    profile: { identity: '', audience: '', themes: [], perspective: '', boundaries: '', language: 'zh', tone: 'direct', length: 'short' },
    materials: [
      { id: 'ai-1', topic: 'AI', content: 'Agent 的失败模式', mayQuoteVerbatim: false },
      { id: 'life-1', topic: '人生感悟', content: '长期主义需要耐心', mayQuoteVerbatim: false }
    ],
    preferences: {}
  });
  assert.ok(prompt.includes('领域知识（各领域相互隔离）'));
  assert.ok(prompt.includes('不得混用不同领域的素材、概念、案例、术语或结论'));
  assert.ok(prompt.includes('必须生成 2 条 topic 为“人生感悟”的候选'));
  assert.ok(prompt.includes('归档反馈中表现好的主题、形态和语气应优先借鉴'));
});

test('混用多个领域素材的候选会被拒绝', () => {
  const payload = {
    candidates: Array.from({ length: 10 }, (_, index) => ({
      ...candidate(index, index < 8 ? 'recommended' : 'explore'),
      sourceMaterialIds: index === 0 ? ['ai-1', 'life-1'] : []
    }))
  };
  assert.throws(
    () => normalizeCandidates(payload, [
      { id: 'ai-1', topic: 'AI' },
      { id: 'life-1', topic: '人生感悟' }
    ]),
    /十条有效且不重复/
  );
});

test('归档画像主题偏好进入生成提示词', () => {
  const prompt = buildPrompt({
    profile: { identity: '', audience: '', themes: [], perspective: '', boundaries: '', language: 'zh', tone: 'direct', length: 'short' },
    materials: [],
    preferences: {},
    archiveProfile: { language: 'zh', topics: [{ topic: 'AI', count: 5 }, { topic: '旅行', count: 2 }], contentMix: { original: 3, reply: 1, repost: 1 }, activeHours: [], activeWeekdays: [] }
  });
  assert.ok(prompt.includes('归档画像主题偏好'));
  assert.ok(prompt.includes('AI'));
  assert.ok(prompt.includes('旅行'));
  assert.ok(prompt.includes('suggestedPublishTime'));
});

test('未提供归档画像时不生成主题引导段', () => {
  const prompt = buildPrompt({ profile: { identity: '', audience: '', themes: [], perspective: '', boundaries: '', language: 'zh', tone: 'direct', length: 'short' }, materials: [], preferences: {} });
  assert.ok(!prompt.includes('归档画像主题偏好'));
});
