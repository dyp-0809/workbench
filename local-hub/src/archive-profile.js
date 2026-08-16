const TOPIC_KEYWORDS = {
  'AI': ['ai', '人工智能', '机器学习', '深度学习', '大模型', '模型', 'gpt', 'llm', '提示词', 'prompt', 'aigc', 'agent'],
  '代码': ['代码', '编程', '前端', '后端', '开发', '程序员', 'python', 'javascript', 'typescript', 'bug', '开源', '工程师'],
  '职场': ['职场', '工作', '团队', '管理', '会议', '绩效', '跳槽', '面试', '领导', '同事'],
  '生活': ['生活', '日常', '家庭', '孩子', '做饭', '早餐', '周末', '健身', '跑步'],
  '读书': ['读书', '阅读', '书', '作者', '章节', '笔记'],
  '旅行': ['旅行', '旅游', '风景', '机票', '酒店', '徒步'],
  '摄影': ['摄影', '拍照', '相机', '镜头', '构图', '后期', '胶片'],
  '心情': ['心情', '开心', '难过', '焦虑', '情绪', '孤独', '治愈'],
  '人生': ['人生', '成长', '意义', '选择', '自由', '梦想', '目标'],
  '投资': ['投资', '股票', '基金', '美股', '理财', '纳指', '标普', '仓位', '定投']
};

function buildObjectiveProfile(tweets) {
  const languageCounts = new Map();
  const hourCounts = new Map();
  const weekdayCounts = new Map();
  const contentMix = { original: 0, reply: 0, repost: 0 };
  const topicCounts = new Map();

  for (const tweet of tweets) {
    if (tweet.lang) languageCounts.set(tweet.lang, (languageCounts.get(tweet.lang) || 0) + 1);
    if (tweet.createdAt) {
      const date = new Date(tweet.createdAt);
      if (Number.isFinite(date.getTime())) {
        hourCounts.set(date.getHours(), (hourCounts.get(date.getHours()) || 0) + 1);
        weekdayCounts.set(date.getDay(), (weekdayCounts.get(date.getDay()) || 0) + 1);
      }
    }
    if (tweet.retweeted) contentMix.repost += 1;
    else if (tweet.inReplyToStatusId) contentMix.reply += 1;
    else contentMix.original += 1;

    const text = String(tweet.text || '').toLowerCase();
    for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
      if (keywords.some((keyword) => text.includes(keyword))) {
        topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
      }
    }
  }

  const language = [...languageCounts].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  return {
    language,
    languageDistribution: Object.fromEntries(languageCounts),
    activeHours: [...hourCounts].map(([hour, count]) => ({ hour, count })).sort((a, b) => b.count - a.count),
    activeWeekdays: [...weekdayCounts].map(([weekday, count]) => ({ weekday, count })).sort((a, b) => b.count - a.count),
    contentMix,
    topics: [...topicCounts].map(([topic, count]) => ({ topic, count })).sort((a, b) => b.count - a.count).slice(0, 8)
  };
}

module.exports = { buildObjectiveProfile, TOPIC_KEYWORDS };
