const test = require('node:test');
const assert = require('node:assert/strict');

require('../packages/h5/idea-engine.js');

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
test('原创短帖要求自然口吻并移除结尾标点', () => {
  const prompt = engine.buildOriginalContentPrompt({
    type: 'AI',
    format: 'post',
    language: '中文',
    contentLengthLimit: 100
  });
  const result = engine.normalizeOriginalContent({
    format: 'post',
    content: '真正的瓶颈不在模型能力，而在知识维护。'
  }, { format: 'post', contentLengthLimit: 100 });

  assert.match(prompt, /结尾不使用句号、问号或感叹号/);
  assert.equal(result.content, '真正的瓶颈不在模型能力，而在知识维护');
  assert.equal(result.contentLength, [...result.content].length);
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
test('回复提示词与结果遵守自然口吻和无终止标点', () => {
  const prompt = engine.buildReplyPrompt('中文', '补充观点', 4);
  const result = engine.normalizeReplyResult({
    shouldReply: true,
    drafts: ['真正的变量是知识维护，而不只是模型能力。', '这件事值得继续观察！']
  });

  assert.match(prompt, /结尾不使用句号、问号或感叹号/);
  assert.deepEqual(result.drafts, ['真正的变量是知识维护，而不只是模型能力', '这件事值得继续观察']);
});
test('账号定位推荐提示词只生成常青观察且标记为推荐草稿', () => {
  const prompt = engine.buildTweetRecommendationsPrompt({
    sourceMode: 'profile',
    profile: '程序员、摄影爱好者、美股投资',
    language: '中文',
    contentLengthLimit: 100
  });

  assert.match(prompt, /推荐草稿/);
  assert.match(prompt, /只生成常青观点/);
  assert.match(prompt, /不得生成买卖建议/);
  assert.match(prompt, /不超过 100 个字符/);
});
test('推荐草稿按字数上限收紧并移除终止标点', () => {
  const result = engine.normalizeTweetRecommendations({
    recommendations: ['这是第一条推荐。', '这是第二条推荐！', '这是第三条推荐？', '多余推荐']
  }, { contentLengthLimit: 20 });

  assert.deepEqual(result.recommendations, ['这是第一条推荐', '这是第二条推荐', '这是第三条推荐']);
  assert.equal(result.contentLengthLimit, 20);
});
test('推文二创默认一百字，并仅保留一条个人推文', () => {
  const defaultPrompt = engine.buildTweetOptimizationPrompt('中文');
  const prompt = engine.buildTweetOptimizationPrompt('English', 80, '轻松幽默');
  const result = engine.normalizeTweetOptimization({
    posts: ['真正的瓶颈不在模型能力，而在知识维护。', '这是一条不应保留的第二候选。'],
    valueAdded: '把模型能力与知识维护的关系从绝对判断改为瓶颈判断。',
    readerBenefit: '帮助读者识别 AI 落地中被忽略的维护成本。',
    risk: '需要补充具体场景，避免被理解为普遍结论。',
    translation: '真正的瓶颈不只在模型能力，而在知识维护'
  }, { contentLengthLimit: 20 });

  assert.match(prompt, /原始推文和高赞回复都是参考素材/);
  assert.match(prompt, /不得复述、同义改写、拼接或概括/);
  assert.match(prompt, /只生成 1 条推文/);
  assert.match(prompt, /采用“轻松幽默”风格/);
  assert.match(prompt, /previousDrafts 是用户已拒绝的本轮版本/);
  assert.match(prompt, /valueAdded 要说明相较参考素材新增的具体判断/);
  assert.match(prompt, /translation 必须返回这条推文的中文对照/);
  assert.match(defaultPrompt, /不超过 100 个字符/);
  assert.deepEqual(result.posts, ['真正的瓶颈不在模型能力，而在知识维护']);
  assert.equal(result.contentLengthLimit, 20);
  assert.equal(result.translation, '真正的瓶颈不只在模型能力，而在知识维护');
  assert.equal(result.valueAdded, '把模型能力与知识维护的关系从绝对判断改为瓶颈判断。');
  assert.equal(result.readerBenefit, '帮助读者识别 AI 落地中被忽略的维护成本。');
  assert.equal(result.risk, '需要补充具体场景，避免被理解为普遍结论。');
});
test('主题推文围绕讨论激烈议题并保留美股安全边界', () => {
  const prompt = engine.buildTweetRecommendationsPrompt({
    sourceMode: 'profile',
    profile: '程序员、长期投资者',
    topic: 'stock',
    language: '中文',
    contentLengthLimit: 80
  });

  assert.match(prompt, /当前主题为“美股”/);
  assert.match(prompt, /真实观点分歧/);
  assert.match(prompt, /不得生成买卖建议/);
  assert.match(prompt, /每两句话组成一个段落/);
});
test('知乎主题推文选择长期高讨论度话题且不伪造实时热度', () => {
  const prompt = engine.buildTweetRecommendationsPrompt({
    sourceMode: 'profile',
    profile: '技术观察者',
    topic: 'zhihu',
    language: '中文',
    contentLengthLimit: 80
  });

  assert.match(prompt, /当前主题为“知乎热议”/);
  assert.match(prompt, /长期高讨论度/);
  assert.match(prompt, /不声称掌握实时热榜/);
});
test('主题推文按字数限制收紧并每两句空行分段', () => {
  const result = engine.normalizeTweetRecommendations({
    recommendations: ['第一句。第二句。第三句。第四句。']
  }, { contentLengthLimit: 80 });

  assert.deepEqual(result.recommendations, ['第一句。第二句。\n\n第三句。第四句']);
  assert.equal(result.contentLengthLimit, 80);
});

test('灵感集合由模型生成十条待核验讨论线索', () => {
  const prompt = engine.buildInspirationCollectionPrompt('企业知识库 AI Agent');
  const ideas = engine.normalizeInspirationCollection({
    ideas: Array.from({ length: 11 }, (_, index) => ({
      title: `讨论主题 ${index + 1}`,
      summary: `讨论线索 ${index + 1}`,
      reason: `可能的关注原因 ${index + 1}`,
      angle: `原创切入 ${index + 1}`
    }))
  });

  assert.match(prompt, /恰好 10 条/);
  assert.match(prompt, /不要声称你已经读取实时热榜/);
  assert.match(prompt, /待核验/);
  assert.equal(ideas.length, 10);
  assert.deepEqual(ideas[0], {
    title: '讨论主题 1',
    summary: '讨论线索 1',
    reason: '可能的关注原因 1',
    angle: '原创切入 1'
  });
});
