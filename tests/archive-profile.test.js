const test = require('node:test');
const assert = require('node:assert/strict');
const { buildObjectiveProfile } = require('../local-hub/src/archive-profile.js');

function tweet(overrides = {}) {
  return {
    id: '1', createdAt: new Date(2024, 0, 2, 9, 30).toISOString(), text: '', lang: 'zh',
    retweeted: false, favoriteCount: 0, retweetCount: 0, replyCount: 0, inReplyToStatusId: null,
    ...overrides
  };
}

test('客观画像统计主要语言、形态比例、活跃时段与高频主题', () => {
  const tweets = [
    tweet({ id: '1', text: 'AI 大模型让前端开发更快', lang: 'zh', createdAt: new Date(2024, 0, 2, 9, 30).toISOString() }),
    tweet({ id: '2', text: 'AI 模型又进步了', lang: 'zh', createdAt: new Date(2024, 0, 2, 14, 0).toISOString() }),
    tweet({ id: '3', text: '今天去旅行拍了很多风景', lang: 'zh', createdAt: new Date(2024, 0, 2, 14, 30).toISOString() }),
    tweet({ id: '4', text: 'Replying to someone', lang: 'en', createdAt: new Date(2024, 0, 2, 15, 0).toISOString(), inReplyToStatusId: '999' }),
    tweet({ id: '5', text: 'Someone else said this', lang: 'en', createdAt: new Date(2024, 0, 2, 16, 0).toISOString(), retweeted: true })
  ];

  const profile = buildObjectiveProfile(tweets);

  assert.equal(profile.language, 'zh');
  assert.deepEqual(profile.contentMix, { original: 3, reply: 1, repost: 1 });

  const topicNames = profile.topics.map((item) => item.topic);
  assert.ok(topicNames.includes('AI'));
  assert.ok(topicNames.includes('旅行'));

  const hours = new Map(profile.activeHours.map((item) => [item.hour, item.count]));
  assert.equal(hours.get(9), 1);
  assert.equal(hours.get(14), 2);
});

test('推文为空时返回空的客观画像而不报错', () => {
  const profile = buildObjectiveProfile([]);
  assert.equal(profile.language, '');
  assert.deepEqual(profile.contentMix, { original: 0, reply: 0, repost: 0 });
  assert.deepEqual(profile.topics, []);
  assert.deepEqual(profile.activeHours, []);
});
