const test = require('node:test');
const assert = require('node:assert/strict');

require('../h5/idea-engine.js');

const engine = globalThis.XReplyCopilotIdeaEngine;

test('原创提示词要求实质新增价值并禁止互动诱导', () => {
  const prompt = engine.buildOriginalContentPrompt({
    type: 'AI',
    format: 'thread',
    language: '中文',
    profile: '分享企业 AI 落地经验',
    contentLengthLimit: 100
  });

  assert.match(prompt, /主要价值必须来自用户新增的观点/);
  assert.match(prompt, /不得只做摘要、同义改写/);
  assert.match(prompt, /不要要求点赞、回复、收藏、关注或转发/);
  assert.match(prompt, /Thread/);
  assert.match(prompt, /不超过 100 个字符/);
});

test('新增价值候选提示词生成三种可编辑切入点且禁止虚构经历', () => {
  const prompt = engine.buildContributionSuggestionsPrompt({
    type: 'AI',
    source: '企业 AI 落地不只取决于模型能力。',
    profile: '分享企业 AI 落地经验'
  });

  assert.match(prompt, /恰好 3 个/);
  assert.match(prompt, /不得虚构用户经历/);
  assert.match(prompt, /用户选择或继续修改/);
});

test('新增价值候选只保留三份有效内容', () => {
  const suggestions = engine.normalizeContributionSuggestions({
    suggestions: [
      { angle: '判断', contribution: '真正的瓶颈是知识维护。', needsUserInput: '补充案例' },
      { angle: '边界', contribution: '这个结论只适用于特定组织。', needsUserInput: '' },
      { angle: '反例', contribution: '模型能力仍可能是小团队的首要限制。', needsUserInput: '说明场景' },
      { angle: '多余', contribution: '不应保留。', needsUserInput: '' },
      { angle: '空白', contribution: '', needsUserInput: '' }
    ]
  });

  assert.equal(suggestions.length, 3);
  assert.equal(suggestions[0].angle, '判断');
  assert.equal(suggestions[2].needsUserInput, '说明场景');
});

test('原创结果只保留支持的等级和内容形态', () => {
  assert.deepEqual(
    engine.normalizeOriginalContent({
      type: 'AI',
      format: 'unknown',
      originalityLevel: 'strong',
      originalityReason: '有独立判断',
      missingValue: '',
      content: '正文',
      translation: ''
    }, { type: '全部', format: 'post', contentLengthLimit: 100 }),
    {
      type: 'AI',
      format: 'post',
      originalityLevel: 'strong',
      originalityReason: '有独立判断',
      missingValue: '',
      content: '正文',
      translation: '',
      contentLengthLimit: 100,
      contentLength: 2,
      wasTruncated: false,
    }
  );
});

test('原创结果超过用户字数上限时按 Unicode 字符安全收紧', () => {
  const content = '这是一个用于验证字数限制的中文句子。'.repeat(12);
  const result = engine.normalizeOriginalContent({
    type: 'AI',
    format: 'post',
    originalityLevel: 'adequate',
    content
  }, { contentLengthLimit: 100 });

  assert.equal(result.contentLengthLimit, 100);
  assert.ok([...result.content].length <= 100);
  assert.equal(result.contentLength, [...result.content].length);
  assert.equal(result.wasTruncated, true);
  assert.match(result.content, /…$/);
});

test('本地原创演示使用用户新增价值', () => {
  const result = engine.demoOriginalContent({
    type: 'AI',
    format: 'post',
    contribution: '我观察到真正的瓶颈在知识维护，不在模型能力。'
  });

  assert.match(result.content, /真正的瓶颈在知识维护/);
  assert.equal(result.originalityLevel, 'adequate');
});

test('回复结果提供受控的内容动作建议', () => {
  const result = engine.normalizeReplyResult({
    shouldReply: false,
    recommendedAction: 'thread',
    actionReason: '观点可以独立展开',
    drafts: ['草稿']
  });

  assert.equal(result.recommendedAction, 'thread');
  assert.equal(result.actionReason, '观点可以独立展开');
  assert.equal(engine.replyActionNames.thread, '扩展长帖');
});
