const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSemanticPrompt, normalizeSemanticProfile } = require('../local-hub/src/semantic-profile.js');

test('语义提示词包含账号资料与原创推文，排除转推', () => {
  const prompt = buildSemanticPrompt({
    account: { username: 'zhangsan', displayName: '张三' },
    tweets: [
      { text: '原创观点 A', retweeted: false, favoriteCount: 5, retweetCount: 0, replyCount: 0 },
      { text: '转推别人的内容', retweeted: true, favoriteCount: 9, retweetCount: 0, replyCount: 0 }
    ]
  });
  assert.ok(prompt.includes('原创观点 A'));
  assert.ok(!prompt.includes('转推别人的内容'));
  assert.ok(prompt.includes('zhangsan'));
  assert.ok(prompt.includes('identity'));
});

test('归一化提取四项语义画像', () => {
  const semantic = normalizeSemanticProfile({ identity: '独立开发者', audience: 'AI 开发者', tone: '直白务实', perspective: 'AI 提效' });
  assert.equal(semantic.identity, '独立开发者');
  assert.equal(semantic.audience, 'AI 开发者');
  assert.equal(semantic.tone, '直白务实');
  assert.equal(semantic.perspective, 'AI 提效');
});

test('模型未返回任何语义项时抛出可读错误', () => {
  assert.throws(() => normalizeSemanticProfile({}), /语义画像/);
});
