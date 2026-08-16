const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPrompt, normalizeCandidates } = require('../local-hub/src/daily-generator.js');

function candidate(index, recommendation) {
  return {
    content: `候选内容 ${index}`,
    topic: 'AI',
    format: 'post',
    tone: 'direct',
    recommendation
  };
}

test('模型以中文探索标记返回时仍识别两条探索候选', () => {
  const payload = {
    candidates: Array.from({ length: 10 }, (_, index) => candidate(index, index < 8 ? '推荐' : '探索'))
  };
  const normalized = normalizeCandidates(payload, []);
  assert.equal(normalized.filter((item) => item.recommendation === 'explore').length, 2);
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
});

test('未提供归档画像时不生成主题引导段', () => {
  const prompt = buildPrompt({ profile: { identity: '', audience: '', themes: [], perspective: '', boundaries: '', language: 'zh', tone: 'direct', length: 'short' }, materials: [], preferences: {} });
  assert.ok(!prompt.includes('归档画像主题偏好'));
});
