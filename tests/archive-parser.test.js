const test = require('node:test');
const assert = require('node:assert/strict');
const AdmZip = require('adm-zip');
const { parseXArchive } = require('../local-hub/src/archive-parser.js');

function buildZip(files) {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(files)) zip.addFile(name, Buffer.from(content, 'utf8'));
  return zip.toBuffer();
}

function crc32(buffer) {
  let table = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  let crc = 0xffffffff;
  for (const byte of buffer) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// X 官方归档由流式写入器打包：本地头设置数据描述符标志（bit 3），
// 且描述符中的尺寸字段可能与中央目录不一致。adm-zip 0.5.x 对此误判为损坏
// （上游 #533/#548/#554，0.6.0 起改为信任中央目录 CRC），此构造用于回归防护。
function buildStreamedZip(name, contentBuffer) {
  const nameBuffer = Buffer.from(name, 'utf8');
  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(0x0008, 6);
  localHeader.writeUInt32LE(crc32(contentBuffer), 14);
  localHeader.writeUInt16LE(nameBuffer.length, 26);
  const descriptor = Buffer.alloc(16);
  descriptor.writeUInt32LE(0x08074b50, 0);
  descriptor.writeUInt32LE(crc32(contentBuffer), 4);
  descriptor.writeUInt32LE(contentBuffer.length, 8);
  descriptor.writeUInt32LE(0, 12);
  const centralHeader = Buffer.alloc(46);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(20, 4);
  centralHeader.writeUInt16LE(20, 6);
  centralHeader.writeUInt16LE(0x0008, 8);
  centralHeader.writeUInt32LE(crc32(contentBuffer), 16);
  centralHeader.writeUInt32LE(contentBuffer.length, 20);
  centralHeader.writeUInt32LE(contentBuffer.length, 24);
  centralHeader.writeUInt16LE(nameBuffer.length, 28);
  centralHeader.writeUInt32LE(0, 42);
  const endOfCentral = Buffer.alloc(22);
  endOfCentral.writeUInt32LE(0x06054b50, 0);
  endOfCentral.writeUInt16LE(1, 8);
  endOfCentral.writeUInt16LE(1, 10);
  endOfCentral.writeUInt32LE(centralHeader.length + nameBuffer.length, 12);
  endOfCentral.writeUInt32LE(localHeader.length + nameBuffer.length + contentBuffer.length + descriptor.length, 16);
  return Buffer.concat([localHeader, nameBuffer, contentBuffer, descriptor, centralHeader, nameBuffer, endOfCentral]);
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

test('解析带数据描述符且描述符与中央目录不一致的流式打包归档', () => {
  const buffer = buildStreamedZip('data/tweet.js', Buffer.from(legacyTweetJs, 'utf8'));
  const archive = parseXArchive(buffer);
  assert.equal(archive.tweets.length, 2);
  assert.equal(archive.tweets[0].id, '111');
});
