const { readModelSettings } = require('./model-settings.js');
const { requestEndpoint } = require('./daily-generator.js');

function buildSemanticPrompt({ tweets, account }) {
  const samples = [...tweets]
    .filter((tweet) => !tweet.retweeted)
    .sort((a, b) => (b.favoriteCount + b.retweetCount + b.replyCount) - (a.favoriteCount + a.retweetCount + a.replyCount))
    .slice(0, 40)
    .map((tweet) => tweet.text);
  return `你是 X 个人画像分析师。根据用户的历史推文与账号资料，提炼四项语义画像。
硬性要求：
1. 只基于提供的推文，不得虚构第一人称经历、数据或立场。
2. identity 用一句话概括"我是谁"。
3. audience 推断"用户平时写给谁"。
4. tone 用短语概括口吻（如"直白、务实、偶尔幽默"）。
5. perspective 提炼反复出现、但可编辑的观点倾向；无法确定时写空字符串。
6. 不输出投资、医疗、法律或政治事件的确定性建议。
只输出 JSON：{"identity":string,"audience":string,"tone":string,"perspective":string}
账号资料：${JSON.stringify(account)}
历史推文样本：${JSON.stringify(samples)}`;
}

function normalizeSemanticProfile(payload) {
  const pick = (key) => String(payload?.[key] || '').trim();
  const semantic = { identity: pick('identity'), audience: pick('audience'), tone: pick('tone'), perspective: pick('perspective') };
  if (!semantic.identity && !semantic.audience && !semantic.tone && !semantic.perspective) throw new Error('模型未返回有效的语义画像。');
  return semantic;
}

async function extractSemanticProfile(context) {
  const settings = await readModelSettings();
  if (!settings?.apiKey) throw new Error('请先配置模型 API Key 以提炼语义画像。');
  const response = await fetch(requestEndpoint(settings), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` },
    signal: AbortSignal.timeout(60000),
    body: JSON.stringify({
      model: settings.model,
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildSemanticPrompt(context) },
        { role: 'user', content: JSON.stringify({ source: 'x-archive' }) }
      ]
    })
  });
  if (!response.ok) throw new Error(`模型请求失败（${response.status}）。`);
  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error('模型没有返回可用内容。');
  return normalizeSemanticProfile(JSON.parse(content));
}

module.exports = { buildSemanticPrompt, extractSemanticProfile, normalizeSemanticProfile };
