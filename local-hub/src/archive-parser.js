const AdmZip = require('adm-zip');

function readJsArray(zip, names) {
  for (const name of names) {
    const entry = zip.getEntry(name);
    if (!entry) continue;
    const text = entry.getData().toString('utf8');
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start === -1 || end < start) throw new Error(`归档文件 ${name} 缺少可解析的 JSON 数组。`);
    return JSON.parse(text.slice(start, end + 1));
  }
  return null;
}

function asInt(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function parseXArchive(buffer) {
  const zip = new AdmZip(buffer);
  const tweetRows = readJsArray(zip, ['data/tweet.js', 'data/tweets.js', 'tweet.js', 'tweets.js']);
  if (!tweetRows) throw new Error('归档中没有可识别的数据。');
  const accountRows = readJsArray(zip, ['data/account.js']);
  const profileRows = readJsArray(zip, ['data/profile.js']);
  const followingRows = readJsArray(zip, ['data/following.js']);

  const tweets = tweetRows
    .filter((row) => row && row.tweet)
    .map((row) => {
      const tweet = row.tweet;
      const createdAt = new Date(tweet.created_at);
      return {
        id: String(tweet.id_str || tweet.id || ''),
        createdAt: Number.isFinite(createdAt.getTime()) ? createdAt.toISOString() : null,
        text: String(tweet.full_text || tweet.text || ''),
        lang: String(tweet.lang || ''),
        retweeted: Boolean(tweet.retweeted),
        favoriteCount: asInt(tweet.favorite_count),
        retweetCount: asInt(tweet.retweet_count),
        replyCount: asInt(tweet.reply_count),
        inReplyToStatusId: tweet.in_reply_to_status_id_str ? String(tweet.in_reply_to_status_id_str) : null
      };
    });

  const account = accountRows?.find((row) => row && row.account)?.account || null;
  const profile = profileRows?.find((row) => row && row.profile)?.profile || null;
  const following = Array.isArray(followingRows)
    ? followingRows.filter((row) => row && row.following && row.following.accountId).map((row) => String(row.following.accountId))
    : [];

  return {
    tweets,
    account: account ? { accountId: String(account.accountId || ''), username: String(account.username || ''), displayName: String(account.accountDisplayName || '') } : null,
    profile: profile ? { bio: String(profile.description?.bio || '') } : null,
    following
  };
}

module.exports = { parseXArchive };
