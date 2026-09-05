const { readModelSettings } = require('./model-settings.js');

const LIFE_INSIGHTS_TOPIC = '人生感悟';

function buildPrompt({ profile, materials, preferences, archiveProfile }) {
  const usableMaterials = materials.slice(0, 12).map((material) => ({ id: material.id, topic: material.topic, content: material.content, mayQuoteVerbatim: material.mayQuoteVerbatim }));
  const materialsByTopic = usableMaterials.reduce((grouped, material) => {
    (grouped[material.topic] ||= []).push(material);
    return grouped;
  }, Object.create(null));
  const archiveTopics = Array.isArray(archiveProfile?.topics) ? archiveProfile.topics.map((item) => item.topic).filter(Boolean) : [];
  const archiveGuidance = archiveTopics.length ? `\n归档画像主题偏好（作为候选主题参考；每条候选仍只能属于一个领域）：${JSON.stringify(archiveTopics)}` : '';
  return `你是 X 原创内容助手。根据用户明确提供的定位、真实素材与偏好，生成恰好 10 条中文 X 内容候选。
硬性要求：
1. 8 条标记 recommendation 为 recommended，2 条标记为 explore。
2. 6 条 format 为 post，2 条 format 为 story，2 条 format 为 thread。
3. 每条候选只能属于一个内容领域。topic 必须与 sourceMaterialIds 指向素材的 topic 完全一致；不得混用不同领域的素材、概念、案例、术语或结论。
4. 必须生成 2 条 topic 为“${LIFE_INSIGHTS_TOPIC}”的候选。它是独立领域，只写可编辑的普适观察和判断，不得借用其他领域知识、虚构个人经历、数据、新闻、实时热度、业绩或现场。
5. 除${LIFE_INSIGHTS_TOPIC}外，只使用用户提供的真实素材与明确定位；缺少个人细节时写成可编辑观点骨架，不得虚构第一人称经历、数据、新闻、实时热度、业绩或现场。
6. 每条自然口语、具体、有判断，避免 AI 套话、鸡汤、标题腔、互动诱导和营销腔。
7. 不要投资、医疗、法律或政治事件的确定性建议；时效性事实必须提示人工核验。
8. 归档反馈中表现好的主题、形态和语气应优先借鉴；表现一般的组合应避免重复。反馈只用于优化表达选择，仍不得突破领域隔离、真实素材和人生感悟的限制。
9. 与近期偏好一致，但探索候选可尝试相邻主题或表达方式，且仍不得跨领域混用知识。
10. 每条必须有 suggestedPublishTime，且只能为 "09:00"、"11:30"、"14:30"、"17:30"、"20:30" 之一；每个时段恰好两条。它只是供用户审核后安排明日发布的建议，不得声称是 X 官方推荐时段或增长保证。
只输出 JSON：{"candidates":[{"content":string,"topic":string,"format":"post|story|thread","language":"zh","tone":string,"recommendation":"recommended|explore","suggestedPublishTime":"09:00|11:30|14:30|17:30|20:30","sourceMaterialIds":string[]}]}${archiveGuidance}
用户定位：${JSON.stringify(profile)}
领域知识（各领域相互隔离）：${JSON.stringify(materialsByTopic)}
已观察偏好：${JSON.stringify(preferences)}`;
}


function isExploreRecommendation(value) {
  return ['explore', '探索'].includes(String(value || '').trim().toLowerCase());
}
const SUGGESTED_PUBLISH_TIMES = Object.freeze(['09:00', '11:30', '14:30', '17:30', '20:30']);
const MODEL_REQUEST_TIMEOUT_MS = 120000;


function normalizeCandidates(payload, materials) {
  const materialsById = new Map(materials.map((material) => [material.id, material]));
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
  const normalized = [];
  const contentSet = new Set();
  for (const candidate of candidates) {
    const content = String(candidate?.content || '').trim();
    const topic = String(candidate.topic || '未分类').trim() || '未分类';
    const suggestedPublishTime = String(candidate.suggestedPublishTime || '').trim();
    const sourceMaterialIds = Array.isArray(candidate.sourceMaterialIds) ? candidate.sourceMaterialIds.filter((id) => materialsById.has(id)) : [];
    const sourceTopics = new Set(sourceMaterialIds.map((id) => materialsById.get(id).topic));
    if (!content || contentSet.has(content) || !SUGGESTED_PUBLISH_TIMES.includes(suggestedPublishTime) || sourceTopics.size > 1 || (sourceTopics.size === 1 && !sourceTopics.has(topic))) continue;
    contentSet.add(content);
    normalized.push({
      content,
      topic,
      format: ['post', 'story', 'thread'].includes(candidate.format) ? candidate.format : 'post',
      language: 'zh',
      tone: String(candidate.tone || 'direct').trim() || 'direct',
      recommendation: isExploreRecommendation(candidate.recommendation) ? 'explore' : 'recommended',
      suggestedPublishTime,
      sourceMaterialIds
    });
  }
  if (normalized.length !== 10) throw new Error('模型未返回十条有效且不重复的内容候选。');
  const exploreCount = normalized.filter((candidate) => candidate.recommendation === 'explore').length;
  if (exploreCount !== 2) throw new Error('模型未按要求返回两条探索候选。');
  const lifeInsightsCount = normalized.filter((candidate) => candidate.topic === LIFE_INSIGHTS_TOPIC).length;
  if (lifeInsightsCount !== 2) throw new Error('模型未按要求返回两条人生感悟候选。');
  const suggestedTimeCounts = new Map(normalized.map((candidate) => [candidate.suggestedPublishTime, 0]));
  for (const candidate of normalized) suggestedTimeCounts.set(candidate.suggestedPublishTime, suggestedTimeCounts.get(candidate.suggestedPublishTime) + 1);
  if (SUGGESTED_PUBLISH_TIMES.some((time) => suggestedTimeCounts.get(time) !== 2)) throw new Error('模型未为每个建议发布时间返回两条候选。');
  return normalized;
}
function requestEndpoint(settings) {
  const endpoint = settings.endpoint.replace(/\/+$/, '');
  return settings.provider === 'deepseek' && !endpoint.endsWith('/chat/completions')
    ? `${endpoint}/chat/completions`
    : endpoint;
}
function toGenerationError(error) {
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError' || /timeout/i.test(String(error?.message || ''))) {
    return new Error('内容生成超过 2 分钟，请检查模型服务连接或稍后重试。');
  }
  return error instanceof Error ? error : new Error('模型请求失败。');
}



async function generateDailyCandidates(context) {
  const settings = await readModelSettings();
  if (!settings?.apiKey) throw new Error('请先在本地工作台配置模型 API Key。');
  let response;
  try {
    response = await fetch(requestEndpoint(settings), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` },
      signal: AbortSignal.timeout(MODEL_REQUEST_TIMEOUT_MS),
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
  } catch (error) {
    throw toGenerationError(error);
  }
  if (!response.ok) throw new Error(`模型请求失败（${response.status}）。`);
  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error('模型没有返回可用内容。');
  return normalizeCandidates(JSON.parse(content), context.materials);
}

module.exports = { buildPrompt, generateDailyCandidates, isExploreRecommendation, normalizeCandidates, requestEndpoint, SUGGESTED_PUBLISH_TIMES, toGenerationError, MODEL_REQUEST_TIMEOUT_MS };
