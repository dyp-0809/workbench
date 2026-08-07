const state = {
  post: null,
  profile: '',
  currentIdeaType: 'all',
  ideasInitialized: false,
  settings: null
};

const $ = (selector) => document.querySelector(selector);
initializeChoiceTags();

function initializeChoiceTags() {
  for (const button of document.querySelectorAll('[data-choice-target]')) {
    button.addEventListener('click', () => {
      const select = document.querySelector(`#${button.dataset.choiceTarget}`);
      select.value = button.dataset.choiceValue;
      for (const item of document.querySelectorAll(`[data-choice-target="${button.dataset.choiceTarget}"]`)) {
        const active = item === button;
        item.classList.toggle('active', active);
        item.setAttribute('aria-pressed', String(active));
      }
    });
  }
}

const { languageNames, ideaTypeNames, buildReplyPrompt, buildTweetOptimizationPrompt, normalizeTweetOptimization, buildIdeaPrompt, normalizeIdea, demoIdea } = XReplyCopilotIdeaEngine;

const styleNames = {
  insightful: '补充观点',
  practical: '实操建议',
  question: '提问式',
  concise: '极简回应',
  professional: '专业分析',
  friendly: '友好支持',
  contrarian: '温和反驳',
  witty: '轻松幽默',
  sarcastic: '讽刺'
};



document.querySelectorAll('[data-tab]').forEach((button) => {
  button.addEventListener('click', () => {
    const tab = button.dataset.tab;
    document.querySelectorAll('[data-tab]').forEach((item) => item.classList.toggle('active', item === button));
    document.querySelectorAll('[data-tab-panel]').forEach((panel) => {
      panel.classList.toggle('hidden', panel.dataset.tabPanel !== tab);
    });
    if (tab === 'ideas' && !state.ideasInitialized) {
      state.ideasInitialized = true;
      generateIdeas();
    }
  });
});

$('#ideasRefreshButton').addEventListener('click', generateIdeas);
$('#optimizeTweetButton').addEventListener('click', generateTweetOptimization);
$('#refreshTweetButton').addEventListener('click', generateTweetOptimization);
document.querySelectorAll('[data-idea-type]').forEach((button) => {
  button.addEventListener('click', () => {
    state.currentIdeaType = button.dataset.ideaType;
    document.querySelectorAll('[data-idea-type]').forEach((item) => item.classList.toggle('active', item === button));
    generateIdeas();
  });
});
$('#scanTrendingButton').addEventListener('click', scanTrendingPosts);

$('#settingsButton').addEventListener('click', () => chrome.runtime.openOptionsPage());
initializeModelControls();

async function initializeModelControls() {
  state.settings = await loadSettings();
  $('#providerSelect').value = state.settings.provider;
  await populateModelSelect(state.settings.model);
  $('#providerSelect').addEventListener('change', switchProvider);
  $('#modelSelect').addEventListener('change', saveSelectedModel);
  $('#detectModelButton').addEventListener('click', detectModel);
  $('#fetchModelsButton').addEventListener('click', fetchModels);
}

async function loadSettings() {
  return chrome.storage.local.get({
    provider: 'openai-compatible',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini',
    apiKey: '',
    apiKeys: {}
  });
}

async function populateModelSelect(selectedModel, models = []) {
  const modelSelect = $('#modelSelect');
  const availableModels = [...new Set([selectedModel, ...models].filter(Boolean))];
  modelSelect.replaceChildren(...availableModels.map((model) => {
    const option = document.createElement('option');
    option.value = model;
    option.textContent = model;
    return option;
  }));
  if (!availableModels.length) {
    modelSelect.add(new Option('请先配置 API Key', ''));
    modelSelect.disabled = true;
    return;
  }
  modelSelect.disabled = false;
  modelSelect.value = selectedModel;
}

async function switchProvider() {
  const provider = $('#providerSelect').value;
  const defaults = provider === 'deepseek'
    ? { endpoint: 'https://api.deepseek.com', model: 'deepseek-chat' }
    : { endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' };
  state.settings = {
    ...state.settings,
    provider,
    endpoint: defaults.endpoint,
    model: defaults.model,
    apiKey: state.settings.apiKeys?.[provider] || ''
  };
  await chrome.storage.local.set(state.settings);
  await populateModelSelect(state.settings.model);
  setModelStatus('已切换，请检测', '');
}

async function saveSelectedModel() {
  state.settings.model = $('#modelSelect').value;
  await chrome.storage.local.set({ model: state.settings.model });
}

async function detectModel() {
  await checkModelConnection($('#detectModelButton'), '检测中…');
}

async function fetchModels() {
  await checkModelConnection($('#fetchModelsButton'), '获取中…', true);
}

async function checkModelConnection(button, busyLabel, shouldList = false) {
  state.settings = await loadSettings();
  const apiKey = state.settings.apiKeys?.[state.settings.provider] || state.settings.apiKey;
  if (!apiKey) {
    setModelStatus('请先在设置中配置 API Key', 'error');
    return;
  }
  setLoading(button, true, busyLabel);
  try {
    const response = await fetch(buildModelsEndpoint(state.settings), {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15000)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error?.message || `HTTP ${response.status}`);
    const models = Array.isArray(payload.data)
      ? payload.data.map((item) => item.id).filter(Boolean)
      : [];
    if (shouldList && !models.length) throw new Error('官方没有返回可用模型。');
    if (models.length) {
      await populateModelSelect(state.settings.model, models);
      state.settings.model = $('#modelSelect').value;
      await chrome.storage.local.set({ model: state.settings.model });
    }
    setModelStatus(shouldList ? `已获取 ${models.length} 个模型` : '连接正常', 'success');
  } catch (error) {
    setModelStatus(`检测失败：${error.message}`, 'error');
  } finally {
    setLoading(button, false, button.id === 'fetchModelsButton' ? '获取模型列表' : '检测模型');
  }
}
$('#extractButton').addEventListener('click', extractPost);
$('#draftButton').addEventListener('click', generateDrafts);

async function extractPost() {
  setError('');
  setLoading($('#extractButton'), true, '读取中…');

  try {
    const result = await chrome.runtime.sendMessage({ type: 'extract-current-post' });
    if (!result?.ok) throw new Error(result?.error || '读取帖子失败。');

    state.post = result.post;
    $('#postState').classList.add('hidden');
    $('#postCard').classList.remove('hidden');
    $('#postCard').textContent = result.post.contextText || result.post.text;
    $('#draftButton').disabled = false;
    $('#resultSection').classList.add('hidden');
  } catch (error) {
    setError(error.message);
  } finally {
    setLoading($('#extractButton'), false, '读取');
  }
}

async function scanTrendingPosts() {
  setError('');
  setLoading($('#scanTrendingButton'), true, '读取中…');

  try {
    const result = await chrome.runtime.sendMessage({ type: 'extract-trending-posts' });
    if (!result?.ok) throw new Error(result?.error || '读取热门帖子失败。');
    const snapshots = await chrome.storage.local.get({ trendingSnapshots: {} });
    const previous = snapshots.trendingSnapshots;
    const capturedAt = result.capturedAt;
    const posts = result.posts.map((post) => enrichTrendingPost(post, previous[post.url], capturedAt));
    posts.sort((left, right) => right.score - left.score);
    await chrome.storage.local.set({
      trendingSnapshots: Object.fromEntries(posts.map((post) => [post.url, {
        capturedAt,
        metrics: post.metrics
      }]))
    });
    renderTrending(posts, result.pageUrl);
  } catch (error) {
    setError(error.message);
  } finally {
    setLoading($('#scanTrendingButton'), false, '读取当前页');
  }
}

function enrichTrendingPost(post, previous, capturedAt) {
  const score = post.metrics.likes
    + post.metrics.reposts * 2
    + post.metrics.replies * 2
    + post.metrics.views / 1000;
  const previousScore = previous
    ? previous.metrics.likes
      + previous.metrics.reposts * 2
      + previous.metrics.replies * 2
      + previous.metrics.views / 1000
    : 0;
  const elapsedHours = previous
    ? Math.max((Date.parse(capturedAt) - Date.parse(previous.capturedAt)) / 3600000, 1 / 60)
    : 0;
  return {
    ...post,
    score,
    growth: previous ? (score - previousScore) / elapsedHours : null
  };
}

function renderTrending(posts, pageUrl) {
  $('#trendingResultSection').classList.remove('hidden');
  $('#trendingModeBadge').textContent = `${posts.length} 条 · ${new URL(pageUrl).hostname}`;
  const list = $('#trendingList');
  list.replaceChildren();
  posts.forEach((post, index) => {
    const card = document.createElement('article');
    card.className = 'idea-card';
    const metrics = `回复 ${formatNumber(post.metrics.replies)} · 转发 ${formatNumber(post.metrics.reposts)} · 喜欢 ${formatNumber(post.metrics.likes)} · 浏览 ${formatNumber(post.metrics.views)}`;
    const growth = post.growth === null
      ? '首次记录，下一次读取后计算增长'
      : `互动增长：${post.growth >= 0 ? '+' : ''}${post.growth.toFixed(1)}/小时`;
    card.append(
      makeLine(`热门 ${index + 1}`, post.text.split('\n').filter(Boolean)[0].slice(0, 120)),
      makeLine('互动', metrics),
      makeLine('趋势', growth)
    );
    const open = document.createElement('a');
    open.href = post.url;
    open.target = '_blank';
    open.rel = 'noreferrer';
    open.textContent = '打开帖子';
    card.append(open);
    list.append(card);
  });
}

function formatNumber(value) {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
}

async function generateDrafts() {
  if (!state.post) return;
  setError('');
  setLoading($('#draftButton'), true, '生成中…');
  setDraftLoading(true);
  showToast('正在生成回复草稿…', 'loading');

  try {
    const settings = await chrome.storage.local.get({
      provider: 'openai-compatible',
      endpoint: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-4o-mini',
      apiKey: ''
    });
    settings.apiKey = settings.apiKeys?.[settings.provider] || settings.apiKey;
    const profile = $('#profileInput').value.trim();
    const language = $('#languageSelect').value;
    const style = $('#styleSelect').value;
    const result = settings.apiKey
      ? await requestModel(settings, profile, language, style)
      : demoDrafts(language, style);

    renderResult(result, settings.apiKey ? `${providerLabel(settings.provider)}生成` : '本地演示');
    showToast('回复草稿生成成功', 'success');
  } catch (error) {
    setError(error.message);
    showToast('回复草稿生成失败，请查看下方错误信息', 'error');
  } finally {
    setDraftLoading(false);
    setLoading($('#draftButton'), false, '生成评论草稿');
  }
}

function setDraftLoading(loading) {
  $('#draftLoading').classList.toggle('hidden', !loading);
}

async function generateIdeas() {
  const button = $('#ideasRefreshButton');
  const language = $('#ideaLanguageSelect').value || 'zh';
  const type = ideaTypeNames[state.currentIdeaType];
  setError('');
  setLoading(button, true, '生成中…');
  setIdeaLoading(true);
  showToast('正在想一条…', 'loading');

  try {
    const settings = await chrome.storage.local.get({
      provider: 'openai-compatible',
      endpoint: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-4o-mini',
      apiKey: ''
    });
    const profile = $('#contentProfileInput').value.trim();
    settings.apiKey = settings.apiKeys?.[settings.provider] || settings.apiKey;
    const result = settings.apiKey
      ? await requestContentIdea(settings, type, language, profile)
      : demoIdea(type, language);
    const hasTranslation = renderIdea(result, language, settings.apiKey ? `${providerLabel(settings.provider)}生成` : '本地演示');
    showToast(hasTranslation ? '内容生成成功' : '内容生成成功，中文翻译暂未返回', hasTranslation ? 'success' : 'loading');
  } catch (error) {
    setError(error.message);
    showToast('内容生成失败，请查看下方错误信息', 'error');
  } finally {
    setIdeaLoading(false);
    setLoading(button, false, '换一个');
  }
}
async function generateTweetOptimization() {
  const button = $('#optimizeTweetButton');
  const idea = $('#tweetIdeaInput').value.trim();
  const feedback = $('#tweetFeedbackInput').value.trim();
  const language = $('#tweetLanguageSelect').value || 'zh';
  if (!idea) {
    setError('请先输入一个推文想法。');
    showToast('请先输入一个推文想法', 'error');
    $('#tweetIdeaInput').focus();
    return;
  }
  setError('');
  setLoading(button, true, '生成中…');
  setTweetLoading(true);
  showToast('正在优化推文…', 'loading');
  try {
    const settings = await loadSettings();
    settings.apiKey = settings.apiKeys?.[settings.provider] || settings.apiKey;
    if (!settings.apiKey) throw new Error('请先在设置中配置 API Key。');
    const result = normalizeTweetOptimization(await requestTweetOptimization(settings, idea, feedback, language));
    if (!result.posts.length) throw new Error('模型没有返回可用文案。');
    renderTweetOptimization(result, language, providerLabel(settings.provider));
    showToast('推文优化成功', 'success');
  } catch (error) {
    setError(error.message);
    showToast('推文优化失败，请查看下方错误信息', 'error');
  } finally {
    setTweetLoading(false);
    setLoading(button, false, '生成优化文案');
  }
}

function setTweetLoading(loading) {
  $('#tweetResult').classList.remove('hidden');
  $('#tweetLoading').classList.toggle('hidden', !loading);
  $('#tweetStrategy').classList.toggle('hidden', loading);
  $('#tweetDraftList').classList.toggle('hidden', loading);
}

function renderTweetOptimization(result, language, mode) {
  $('#tweetMode').textContent = `${mode}生成 · ${languageNames[language]}`;
  $('#tweetStrategy').replaceChildren(makeLine('优化策略', result.strategy || '围绕具体观察和清晰表达优化。'));
  const list = $('#tweetDraftList');
  list.replaceChildren();
  result.posts.forEach((post, index) => {
    const card = document.createElement('article');
    card.className = 'draft-card';
    const text = document.createElement('p');
    text.textContent = post;
    const copy = document.createElement('button');
    copy.className = 'copy-button';
    copy.type = 'button';
    copy.textContent = `复制文案 ${index + 1}`;
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(post);
        copy.textContent = '已复制';
        setTimeout(() => { copy.textContent = `复制文案 ${index + 1}`; }, 1400);
      } catch {
        copy.textContent = '复制失败';
        setTimeout(() => { copy.textContent = `复制文案 ${index + 1}`; }, 2200);
      }
    });
    card.append(text, copy);
    list.append(card);
  });
}


function setIdeaLoading(loading) {
  $('#ideaLoading').classList.toggle('hidden', !loading);
  $('#ideaCard').classList.toggle('hidden', loading && !$('#ideaCard').textContent);
}

function providerLabel(provider) {
  return provider === 'deepseek' ? 'DeepSeek ' : '模型 ';
}
async function requestModel(settings, profile, language, style) {
  const languageName = languageNames[language] ?? languageNames.zh;

  const styleName = styleNames[style] ?? styleNames.insightful;
  const endpoint = requestEndpoint(settings);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`
    },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({
      model: settings.model,
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: buildReplyPrompt(languageName, styleName)
        },
        {
          role: 'user',
          content: JSON.stringify({
            accountProfile: profile || '未提供账号定位，请保持克制、具体、非营销化。',
            targetLanguage: languageName,
            preferredStyle: styleName,
            post: state.post.contextText || state.post.text
          })
        }
      ]
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`模型请求失败（${response.status}）：${detail.slice(0, 160)}`);
  }
  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error('模型没有返回可用内容。');
  return normalizeResult(JSON.parse(content));
}
async function requestTweetOptimization(settings, idea, feedback, language) {
  const response = await fetch(requestEndpoint(settings), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`
    },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({
      model: settings.model,
      temperature: 0.8,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: buildTweetOptimizationPrompt(languageNames[language] ?? languageNames.zh)
        },
        {
          role: 'user',
          content: JSON.stringify({
            idea,
            feedback: feedback || '没有额外修改意见，请先按默认规则优化。',
            language: languageNames[language] ?? languageNames.zh
          })
        }
      ]
    })
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`模型请求失败（${response.status}）：${detail.slice(0, 160)}`);
  }
  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error('模型没有返回可用内容。');
  return JSON.parse(content);
}

function requestEndpoint(settings) {
  if (settings.provider !== 'deepseek') return settings.endpoint;
  const endpoint = settings.endpoint.includes('api.deepseek.com')
    ? settings.endpoint
    : 'https://api.deepseek.com';
  return `${endpoint.replace(/\/chat\/completions\/?$/, '').replace(/\/+$/, '')}/chat/completions`;
}

function buildModelsEndpoint(settings) {
  const endpoint = settings.provider === 'deepseek'
    ? settings.endpoint.replace(/\/chat\/completions\/?$/, '').replace(/\/+$/, '')
    : settings.endpoint.replace(/\/chat\/completions\/?$/, '');
  return `${endpoint}/models`;
}

function setModelStatus(message, status) {
  const element = $('#modelStatus');
  element.textContent = message;
  element.dataset.state = status;
}

async function requestContentIdea(settings, type, language, profile) {
  const endpoint = requestEndpoint(settings);
  const languageName = languageNames[language] ?? languageNames.zh;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`
    },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({
      model: settings.model,
      temperature: 0.8,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildIdeaPrompt(type, languageName, profile) },
        {
          role: 'user',
          content: JSON.stringify({
            type,
            language: languageName,
            profile: profile || '未提供账号定位，请保持自然、具体，不做营销化表达。'
          })
        }
      ]
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`模型请求失败（${response.status}）：${detail.slice(0, 160)}`);
  }
  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error('模型没有返回可用内容。');
  return normalizeIdea(JSON.parse(content), type);
}


function renderIdea(result, language, mode) {
  if (!result.content) throw new Error('模型没有返回可用内容。');
  $('#ideasModeBadge').textContent = mode;
  const card = $('#ideaCard');
  card.replaceChildren();
  const type = document.createElement('div');
  type.className = 'idea-card-type';
  type.textContent = result.type;
  const content = document.createElement('p');
  content.className = 'random-idea-content';
  content.textContent = result.content;
  card.append(type, content);

  let hasTranslation = language === 'zh';
  if (language !== 'zh') {
    hasTranslation = Boolean(result.translation);
    if (result.translation) {
      card.append(makeLine('中文翻译', result.translation), copyIdeaButton('复制中文翻译', result.translation));
    } else {
      const warning = document.createElement('div');
      warning.className = 'translation-warning';
      warning.textContent = '中文翻译暂未返回，可点击“换一个”重试。';
      card.append(warning);
    }
  }
  card.append(copyIdeaButton('复制原文', result.content));
  card.classList.remove('hidden');
  return hasTranslation;
}

function copyIdeaButton(label, value) {
  const button = document.createElement('button');
  button.className = 'copy-button';
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(value);
      button.textContent = '已复制';
      setTimeout(() => { button.textContent = label; }, 1400);
    } catch {
      button.textContent = '复制失败，请手动选择文字';
      setTimeout(() => { button.textContent = label; }, 2600);
    }
  });
  return button;
}

function requestEndpoint(settings) {
  if (settings.provider !== 'deepseek') return settings.endpoint;
  const endpoint = settings.endpoint.includes('api.deepseek.com')
    ? settings.endpoint
    : 'https://api.deepseek.com';
  return `${endpoint.replace(/\/chat\/completions\/?$/, '').replace(/\/+$/, '')}/chat/completions`;
}
function demoDrafts(language, style) {
  const opening = state.post.text.split('\n').filter(Boolean)[0].slice(0, 80);
  const draftsByLanguage = {
    zh: {
      insightful: ['这条讨论里容易被忽略的一点是：先定义问题边界，再选择工具，通常比直接追求更强的模型更重要。', '如果要把这个观点落地，我会先补一层约束：谁维护内容、哪些信息可信、不同人能看到什么。', '这件事的关键可能不只是“能不能做”，而是做成之后谁负责持续维护。'],
      practical: ['可以先把目标拆成三步：明确使用场景、整理可信资料、指定维护负责人，再决定技术方案。', '一个低成本的验证方法是先选一个高频场景做小范围试用，记录节省的时间和错误类型。', '建议先列出输入、判断标准和失败处理方式。流程跑通后，再考虑扩大范围。'],
      question: ['你们现在遇到的主要问题，是工具能力不够，还是目标和维护责任还没有定义清楚？', '如果只能先解决一个环节，你会优先处理数据质量、权限，还是实际使用频率？', '这个判断在不同规模的团队里会不会有不同的前提？'],
      concise: ['关键不是工具本身，而是问题边界和维护责任。', '先做小范围验证，再决定是否扩大，通常更稳妥。', '这个观点成立，但前提条件值得再明确一点。'],
      professional: ['从实施角度看，这个问题至少涉及目标定义、数据治理和责任归属三个层面。', '如果没有明确评估指标，工具上线后很难判断它是否真的解决了问题。', '更稳妥的做法是先验证业务流程，再评估模型能力。'],
      friendly: ['这个方向很有意思，尤其是你提到的这一点值得继续展开。', '我也遇到过类似情况，先从一个小场景开始通常会轻松很多。', '这个思路挺实用的，期待看到后续实践结果。'],
      contrarian: ['我基本同意，但可能还需要补一个前提：这个方法不一定适合所有团队。', '这里也许不能只看结果，还要看长期维护成本。', '换个角度看，问题可能不在工具，而在一开始定义错了目标。'],
      witty: ['工具很忙，但真正需要加班的往往是需求定义。', '先把问题说清楚，模型才不用参加猜谜比赛。', '听起来像技术问题，最后通常会变成维护责任问题。'],
      sarcastic: ['当然，先选最强的模型，问题定义和维护责任以后再“自动解决”。', '如果把“上线了”当成“解决了”，那这个方案确实无可挑剔。', '看起来只差一个按钮；至于谁维护、怎么验证，暂时交给未来的自己。']
    },
    en: {
      insightful: ['One overlooked point here is that defining the problem boundary usually matters more than choosing a stronger model.', 'To make this practical, I would first clarify who maintains the content, what is trusted, and who can access it.', 'The real question may not be whether it can be built, but who keeps it useful over time.'],
      practical: ['I would break this into three steps: define the use case, organize trusted material, then assign ownership before choosing the stack.', 'A low-cost way to validate it is to start with one frequent use case and track time saved and failure modes.', 'Define the inputs, success criteria, and failure handling first. Expand only after the workflow works.'],
      question: ['Is the main bottleneck the tool itself, or the lack of clear goals and ownership?', 'If you could solve only one part first, would you choose data quality, permissions, or actual adoption?', 'Would this conclusion change for teams of different sizes?'],
      concise: ['The key is not the tool, but the problem boundary and ownership.', 'Validate a small use case before scaling it.', 'The idea makes sense, but its assumptions need to be clearer.'],
      professional: ['From an implementation perspective, this involves goal definition, data governance, and ownership.', 'Without clear evaluation criteria, it is hard to know whether the tool solved the original problem.', 'A safer approach is to validate the workflow before optimizing model capability.'],
      friendly: ['This is an interesting direction, especially the point you raised here.', 'I have seen something similar. Starting with a small use case usually makes the process much easier.', 'This is a practical angle. I would be interested to see what you learn from the next step.'],
      contrarian: ['I mostly agree, but one condition matters: this may not work equally well for every team.', 'The outcome is only part of the story; long-term maintenance cost matters too.', 'From another angle, the issue may be the original goal rather than the tool.'],
      witty: ['The tool may be ready, but the requirements are still working overtime.', 'Clarify the problem first, so the model does not have to play a guessing game.', 'It sounds like a technical problem until someone asks who will maintain it.'],
      sarcastic: ['Of course, choose the strongest model first; the problem definition and ownership can “solve themselves” later.', 'If “it shipped” counts as “it worked,” this plan is flawless.', 'It looks like one button is missing; validation and ownership can wait for future us.']
    },
    vi: {
      insightful: ['Một điểm dễ bị bỏ qua là xác định rõ phạm vi vấn đề thường quan trọng hơn việc chọn một mô hình mạnh hơn.', 'Để triển khai thực tế, trước tiên nên làm rõ ai duy trì nội dung, thông tin nào đáng tin cậy và ai được quyền truy cập.', 'Câu hỏi quan trọng không chỉ là có thể xây dựng hay không, mà là ai sẽ duy trì giá trị của nó theo thời gian.'],
      practical: ['Có thể chia thành ba bước: xác định trường hợp sử dụng, sắp xếp tài liệu đáng tin cậy và phân công người phụ trách trước khi chọn công nghệ.', 'Một cách kiểm chứng ít tốn kém là bắt đầu với một trường hợp sử dụng thường gặp và theo dõi thời gian tiết kiệm cùng các lỗi phát sinh.', 'Hãy xác định đầu vào, tiêu chí thành công và cách xử lý lỗi trước. Chỉ mở rộng sau khi quy trình đã ổn định.'],
      question: ['Vấn đề chính hiện nay là năng lực của công cụ, hay mục tiêu và trách nhiệm vẫn chưa rõ ràng?', 'Nếu chỉ được giải quyết một phần trước, bạn sẽ ưu tiên chất lượng dữ liệu, quyền truy cập hay mức độ sử dụng thực tế?', 'Kết luận này có thay đổi với các đội nhóm có quy mô khác nhau không?'],
      concise: ['Điểm cốt lõi không chỉ là công cụ, mà là phạm vi vấn đề và trách nhiệm duy trì.', 'Nên kiểm chứng một trường hợp nhỏ trước khi mở rộng.', 'Ý tưởng hợp lý, nhưng các điều kiện đi kèm cần được làm rõ hơn.'],
      professional: ['Từ góc độ triển khai, vấn đề này liên quan đến mục tiêu, quản trị dữ liệu và trách nhiệm vận hành.', 'Nếu không có tiêu chí đánh giá rõ ràng, rất khó biết công cụ có giải quyết đúng vấn đề ban đầu hay không.', 'Cách an toàn hơn là kiểm chứng quy trình trước khi tối ưu năng lực mô hình.'],
      friendly: ['Đây là một hướng khá thú vị, đặc biệt là điểm bạn vừa đề cập.', 'Tôi cũng từng gặp tình huống tương tự. Bắt đầu từ một trường hợp nhỏ thường sẽ dễ hơn nhiều.', 'Góc nhìn này khá thực tế. Tôi rất muốn biết kết quả của bước tiếp theo.'],
      contrarian: ['Tôi phần lớn đồng ý, nhưng cần thêm một điều kiện: cách này không nhất thiết phù hợp với mọi đội nhóm.', 'Kết quả chỉ là một phần; chi phí duy trì trong dài hạn cũng rất quan trọng.', 'Nhìn từ góc khác, vấn đề có thể nằm ở mục tiêu ban đầu chứ không phải ở công cụ.'],
      witty: ['Công cụ có thể đã sẵn sàng, nhưng phần yêu cầu vẫn đang làm thêm giờ.', 'Hãy làm rõ vấn đề trước để mô hình không phải chơi trò đoán ý.', 'Nghe giống vấn đề kỹ thuật, cho đến khi có người hỏi ai sẽ duy trì nó.'],
      sarcastic: ['Tất nhiên cứ chọn mô hình mạnh nhất trước; định nghĩa vấn đề và trách nhiệm cứ để tự giải quyết sau.', 'Nếu “đã triển khai” đồng nghĩa với “đã hiệu quả”, thì kế hoạch này hoàn hảo.', 'Có vẻ chỉ còn thiếu một nút bấm; việc kiểm chứng và người phụ trách để tương lai lo.']
    }
  };
  const languageDrafts = draftsByLanguage[language] ?? draftsByLanguage.zh;
  const drafts = languageDrafts[style] ?? languageDrafts.insightful;
  const messages = {
    zh: { reason: `本地演示已基于当前帖子生成草稿。帖子开头：${opening}`, risk: '请人工检查上下文、事实和语气。', angle: `建议采用${styleNames[style] ?? styleNames.insightful}角度。` },
    en: { reason: `Local demo drafts are based on the current post. Opening: ${opening}`, risk: 'Review the context, facts, and tone before posting.', angle: `Suggested angle: ${styleNames[style] ?? styleNames.insightful}.` },
    vi: { reason: `Bản demo cục bộ được tạo dựa trên bài viết hiện tại. Phần mở đầu: ${opening}`, risk: 'Hãy kiểm tra ngữ cảnh, thông tin và giọng điệu trước khi đăng.', angle: `Góc đề xuất: ${styleNames[style] ?? styleNames.insightful}.` }
  };
  const message = messages[language] ?? messages.zh;
  const translations = language === 'zh'
    ? []
    : (draftsByLanguage.zh[style] ?? draftsByLanguage.zh.insightful);

  return normalizeResult({
    shouldReply: true,
    reason: message.reason,
    risk: message.risk,
    angle: message.angle,
    drafts,
    translations
  });
}
function normalizeResult(result) {
  const drafts = Array.isArray(result.drafts)
    ? result.drafts.filter((draft) => typeof draft === 'string' && draft.trim()).slice(0, 3)
    : [];
  const translations = Array.isArray(result.translations)
    ? result.translations.filter((translation) => typeof translation === 'string' && translation.trim()).slice(0, drafts.length)
    : [];

  return {
    shouldReply: Boolean(result.shouldReply),
    reason: String(result.reason || '未提供判断理由。'),
    risk: String(result.risk || '请人工复核语境。'),
    angle: String(result.angle || '未提供建议角度。'),
    drafts,
    translations
  };
}

function renderResult(result, mode) {
  $('#resultSection').classList.remove('hidden');
  $('#modeBadge').textContent = mode;
  $('#analysisCard').dataset.recommendation = result.shouldReply ? 'yes' : 'no';
  $('#analysisCard').replaceChildren(
    makeLine('建议', result.shouldReply ? '可以考虑回复' : '不建议回复'),
    makeLine('理由', result.reason),
    makeLine('角度', result.angle),
    makeLine('风险提示', result.risk)
  );

  const list = $('#draftList');
  list.replaceChildren();
  if (!result.drafts.length) {
    list.append(makeLine('结果', '没有生成可用草稿，建议人工处理。'));
    return;
  }

  result.drafts.forEach((draft, index) => {
    const card = document.createElement('article');
    card.className = 'draft-card';
    const text = document.createElement('p');
    text.textContent = draft;
    card.append(text);

    const translation = result.translations[index];
    if (translation) {
      const translationLabel = document.createElement('div');
      translationLabel.className = 'translation-label';
      translationLabel.textContent = '中文译文';
      const translationText = document.createElement('p');
      translationText.className = 'translation-text';
      translationText.textContent = translation;
      card.append(translationLabel, translationText);
    }

    const copy = document.createElement('button');
    copy.className = 'copy-button';
    copy.textContent = `复制草稿 ${index + 1}`;
    copy.addEventListener('click', async () => {
      await navigator.clipboard.writeText(draft);
      copy.textContent = '已复制';
      setTimeout(() => { copy.textContent = `复制草稿 ${index + 1}`; }, 1400);
    });
    card.append(copy);
    list.append(card);
  });
}

function makeLine(label, value) {
  const line = document.createElement('div');
  const strong = document.createElement('strong');
  strong.textContent = `${label}：`;
  line.append(strong, document.createTextNode(value));
  return line;
}

function setLoading(button, loading, text) {
  button.disabled = loading;
  button.textContent = text;
}

function setError(message) {
  const element = $('#errorMessage');
  element.textContent = message;
  element.classList.toggle('hidden', !message);
}

let toastTimer;
function showToast(message, state) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.dataset.state = state;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  if (state !== 'loading') {
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 2600);
  }
}
