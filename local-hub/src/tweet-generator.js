const { readModelSettings } = require('./model-settings.js');
const { requestEndpoint } = require('./daily-generator.js');

const LANGUAGE_NAMES = Object.freeze({ zh: '中文', en: 'English' });
const LANGUAGE_ALIASES = Object.freeze({
  zh: 'zh',
  chinese: 'zh',
  中文: 'zh',
  en: 'en',
  english: 'en',
  英文: 'en',
  英语: 'en'
});
const MIN_TWEET_COUNT = 1;
const MAX_TWEET_COUNT = 10;
const MODEL_REQUEST_TIMEOUT_MS = 120000;

function normalizeTweetRequest(input = {}) {
  const count = Number(input.count);
  if (!Number.isInteger(count) || count < MIN_TWEET_COUNT || count > MAX_TWEET_COUNT) {
    throw new Error(`每种语言的生成数量必须是 ${MIN_TWEET_COUNT}–${MAX_TWEET_COUNT} 条。`);
  }
  const rawLanguages = Array.isArray(input.languages) ? input.languages : [input.language];
  const languages = [...new Set(rawLanguages
    .map((value) => LANGUAGE_ALIASES[String(value || '').trim().toLocaleLowerCase()])
    .filter(Boolean))];
  if (!languages.length) throw new Error('至少选择一种生成语言。');
  return { count, languages };
}

function buildTweetPrompt({ count, languages }) {
  const languageNames = languages.map((language) => LANGUAGE_NAMES[language]).join('、');
  const total = count * languages.length;
  return `请严格遵循上方维护好的提示词，生成 ${total} 条可编辑的 X 推文草稿。
生成设置：每种语言 ${count} 条；语言为 ${languageNames}。
要求：
1. 每条推文只使用一种语言，language 必须是 zh 或 en；中文和 English 都要自然，不要逐句翻译腔。
2. 每条推文独立成稿，避免重复开头、相同论证结构和同义改写。
3. 不要虚构用户经历、数据、来源、新闻或实时热度；不确定内容应保留为可编辑判断。
4. 不要添加解释、编号、标签、引号或发布建议，除非维护好的提示词明确要求。
5. 只输出 JSON，不要 Markdown 代码围栏：{"tweets":[{"language":"zh|en","content":"string"}]}。`;
}

function normalizeLanguage(value) {
  return LANGUAGE_ALIASES[String(value || '').trim().toLocaleLowerCase()] || null;
}

function parseModelJson(content) {
  const text = String(content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('模型没有返回有效 JSON。');
    return JSON.parse(text.slice(start, end + 1));
  }
}

function normalizeTweets(payload, options) {
  const { count, languages } = normalizeTweetRequest(options);
  const expected = new Set(languages);
  const languageCounts = new Map(languages.map((language) => [language, 0]));
  const contentSet = new Set();
  const tweets = [];
  const candidates = Array.isArray(payload?.tweets) ? payload.tweets : [];
  for (const candidate of candidates) {
    const content = String(candidate?.content || candidate?.text || '').trim();
    const language = normalizeLanguage(candidate?.language) || (languages.length === 1 ? languages[0] : null);
    if (!content || !language || !expected.has(language) || contentSet.has(content) || languageCounts.get(language) >= count) continue;
    contentSet.add(content);
    languageCounts.set(language, languageCounts.get(language) + 1);
    tweets.push({ language, content });
  }
  if (languages.some((language) => languageCounts.get(language) !== count)) {
    throw new Error('模型未按选择的语言和数量返回完整推文。');
  }
  return { count, languages, tweets };
}

function toGenerationError(error) {
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError' || /timeout/i.test(String(error?.message || ''))) {
    return new Error('推文生成超过 2 分钟，请检查模型服务连接或稍后重试。');
  }
  return error instanceof Error ? error : new Error('推文生成失败。');
}

async function generateDailyTweets(context) {
  const settings = await readModelSettings(context.credentialStore);
  if (!settings?.apiKey) throw new Error('请先在本地工作台配置模型 API Key。');
  const options = normalizeTweetRequest(context);
  let response;
  try {
    response = await fetch(requestEndpoint(settings), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` },
      signal: AbortSignal.timeout(MODEL_REQUEST_TIMEOUT_MS),
      body: JSON.stringify({
        model: settings.model,
        temperature: 0.85,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: context.prompt.content },
          { role: 'user', content: buildTweetPrompt(options) }
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
  return normalizeTweets(parseModelJson(content), options);
}

module.exports = { buildTweetPrompt, generateDailyTweets, normalizeTweetRequest, normalizeTweets, parseModelJson, toGenerationError, LANGUAGE_NAMES, MIN_TWEET_COUNT, MAX_TWEET_COUNT };
