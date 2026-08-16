const test = require('node:test');
const assert = require('node:assert/strict');
const AdmZip = require('adm-zip');
const { parseXArchive } = require('../local-hub/src/archive-parser.js');

function buildZip(files) {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(files)) zip.addFile(name, Buffer.from(content, 'utf8'));
  return zip.toBuffer();
}

const legacyTweetJs = `window.YTD.tweet.part0 = [
  {
    "tweet": {
      "id_str": "111",
      "created_at": "Sat Jun 23 16:52:42 +0000 2012",
      "full_text": "第一条推文",
      "lang": "zh",
      "retweeted": false,
      "favorite_count": "5",
      "retweet_count": "2",
      "reply_count": "1",
      "in_reply_to_status_id_str": null,
      "entities": { "urls": [], "user_mentions": [] }
    }
  },
  {
    "tweet": {
      "id_str": "222",
      "created_at": "Mon Jun 25 08:00:00 +0000 2012",
      "full_text": "转发别人的内容",
      "lang": "zh",
      "retweeted": true,
      "favorite_count": "0",
      "retweet_count": "0",
      "reply_count": "0",
      "in_reply_to_status_id_str": "999",
      "entities": { "urls": [], "user_mentions": [] }
    }
  }
]`;

const accountJs = `window.YTD.account.part0 = [
  { "account": { "accountId": "1001", "username": "zhangsan", "accountDisplayName": "张三" } }
]`;

const profileJs = `window.YTD.profile.part0 = [
  { "profile": { "description": { "bio": "独立开发者，摄影爱好者" } } }
]`;

const followingJs = `window.YTD.following.part0 = [
  { "following": { "accountId": "2001", "userLink": "https://twitter.com/intent/user?user_id=2001" } },
  { "following": { "accountId": "2002", "userLink": "https://twitter.com/intent/user?user_id=2002" } }
]`;

test('解析旧版 tweet.js 并产出标准化推文记录', () => {
  const buffer = buildZip({ 'data/tweet.js': legacyTweetJs });
  const archive = parseXArchive(buffer);
  assert.equal(archive.tweets.length, 2);
  assert.equal(archive.tweets[0].id, '111');
  assert.equal(archive.tweets[0].text, '第一条推文');
  assert.equal(archive.tweets[0].lang, 'zh');
  assert.equal(archive.tweets[0].retweeted, false);
  assert.equal(archive.tweets[0].favoriteCount, 5);
  assert.equal(archive.tweets[0].inReplyToStatusId, null);
  assert.ok(Number.isFinite(new Date(archive.tweets[0].createdAt).getTime()));
});

test('兼容新版 tweets.js 命名并识别转推与回复形态', () => {
  const buffer = buildZip({ 'data/tweets.js': legacyTweetJs });
  const archive = parseXArchive(buffer);
  assert.equal(archive.tweets.length, 2);
  assert.equal(archive.tweets[1].retweeted, true);
  assert.equal(archive.tweets[1].inReplyToStatusId, '999');
});

test('产出账号与关注列表，且只含这三类数据', () => {
  const buffer = buildZip({
    'data/tweet.js': legacyTweetJs,
    'data/account.js': accountJs,
    'data/profile.js': profileJs,
    'data/following.js': followingJs,
    'data/direct-messages.js': 'window.YTD.direct_messages.part0 = [{ "dmConversation": { "messages": [{"message": {"text": "私密内容"}}] } }]',
    'data/like.js': 'window.YTD.like.part0 = [{ "like": { "tweetId": "111" } }]',
    'data/follower.js': 'window.YTD.follower.part0 = [{ "follower": { "accountId": "3001" } }]'
  });
  const archive = parseXArchive(buffer);
  assert.equal(archive.account.username, 'zhangsan');
  assert.equal(archive.account.displayName, '张三');
  assert.equal(archive.profile.bio, '独立开发者，摄影爱好者');
  assert.deepEqual(archive.following, ['2001', '2002']);
  assert.ok(!JSON.stringify(archive).includes('私密内容'));
  assert.ok(!('directMessages' in archive));
});

test('空归档抛出可读错误', () => {
  const buffer = buildZip({});
  assert.throws(() => parseXArchive(buffer), /归档中没有可识别的数据/);
});

test('剥离 window.YTD 前缀并容忍缺失字段', () => {
  const minimal = `window.YTD.tweet.part0 = [
    { "tweet": { "id_str": "333", "created_at": "Tue Jan 01 00:00:00 +0000 2013", "full_text": "只有基本字段" } }
  ]`;
  const buffer = buildZip({ 'data/tweet.js': minimal });
  const archive = parseXArchive(buffer);
  assert.equal(archive.tweets[0].id, '333');
  assert.equal(archive.tweets[0].lang, '');
  assert.equal(archive.tweets[0].favoriteCount, 0);
});
