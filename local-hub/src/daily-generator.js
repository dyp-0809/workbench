const { readModelSettings } = require('./model-settings.js');

function buildPrompt({ profile, materials, preferences, archiveProfile }) {
  const usableMaterials = materials.slice(0, 12).map((material) => ({ id: material.id, topic: material.topic, content: material.content, mayQuoteVerbatim: material.mayQuoteVerbatim }));
  const archiveTopics = Array.isArray(archiveProfile?.topics) ? archiveProfile.topics.map((item) => item.topic).filter(Boolean) : [];
  const archiveGuidance = archiveTopics.length ? `\n归档画像主题偏好（作为候选主题参考，不必逐条对应）：${JSON.stringify(archiveTopics)}` : '';
  return `你是 X 原创内容助手。根据用户明确提供的定位、真实素材与偏好，生成恰好 10 条中文 X 内容候选。
硬性要求：
1. 8 条标记 recommendation 为 recommended，2 条标记为 explore。
2. 6 条 format 为 post，2 条 format 为 story，2 条 format 为 thread。
3. 只使用用户提供的真实素材与明确定位；缺少个人细节时写成可编辑观点骨架，不得虚构第一人称经历、数据、新闻、实时热度、业绩或现场。
4. 每条自然口语、具体、有判断，避免 AI 套话、鸡汤、标题腔、互动诱导和营销腔。
5. 不要投资、医疗、法律或政治事件的确定性建议；时效性事实必须提示人工核验。
6. 与近期偏好一致，但探索候选可尝试相邻主题或表达方式。
只输出 JSON：{"candidates":[{"content":string,"topic":string,"format":"post|story|thread","language":"zh","tone":string,"recommendation":"recommended|explore","sourceMaterialIds":string[]}]}${archiveGuidance}
用户定位：${JSON.stringify(profile)}
用户素材：${JSON.stringify(usableMaterials)}
已观察偏好：${JSON.stringify(preferences)}`;
}


function isExploreRecommendation(value) {
  return ['explore', '探索'].includes(String(value || '').trim().toLowerCase());
}

function normalizeCandidates(payload, materials) {
  const knownMaterialIds = new Set(materials.map((material) => material.id));
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
  const normalized = [];
  const contentSet = new Set();
  for (const candidate of candidates) {
    const content = String(candidate?.content || '').trim();
    if (!content || contentSet.has(content)) continue;
    contentSet.add(content);
    normalized.push({
      content,
      topic: String(candidate.topic || '未分类').trim() || '未分类',
      format: ['post', 'story', 'thread'].includes(candidate.format) ? candidate.format : 'post',
      language: 'zh',
      tone: String(candidate.tone || 'direct').trim() || 'direct',
      recommendation: isExploreRecommendation(candidate.recommendation) ? 'explore' : 'recommended',
      sourceMaterialIds: Array.isArray(candidate.sourceMaterialIds) ? candidate.sourceMaterialIds.filter((id) => knownMaterialIds.has(id)) : []
    });
  }
  if (normalized.length !== 10) throw new Error('模型未返回十条有效且不重复的内容候选。');
  const exploreCount = normalized.filter((candidate) => candidate.recommendation === 'explore').length;
  if (exploreCount !== 2) throw new Error('模型未按要求返回两条探索候选。');
  return normalized;
}
function requestEndpoint(settings) {
  const endpoint = settings.endpoint.replace(/\/+$/, '');
  return settings.provider === 'deepseek' && !endpoint.endsWith('/chat/completions')
    ? `${endpoint}/chat/completions`
    : endpoint;
}


async function generateDailyCandidates(context) {
  const settings = await readModelSettings();
  if (!settings?.apiKey) throw new Error('请先在本地工作台配置模型 API Key。');
  const response = await fetch(requestEndpoint(settings), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` },
    signal: AbortSignal.timeout(60000),
    body: JSON.stringify({
      model: settings.model,
      temperature: 0.8,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildPrompt(context) },
        { role: 'user', content: JSON.stringify({ trigger: context.trigger, operatingDate: context.operatingDate }) }
      ]
    })
  });
  if (!response.ok) throw new Error(`模型请求失败（${response.status}）。`);
  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error('模型没有返回可用内容。');
  return normalizeCandidates(JSON.parse(content), context.materials);
}

module.exports = { buildPrompt, generateDailyCandidates, isExploreRecommendation, normalizeCandidates, requestEndpoint };
