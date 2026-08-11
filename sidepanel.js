const state = {
  post: null,
  profile: '',
  currentIdeaType: 'all',
  currentTweetTopic: 'life',
  settings: null,
  recommendationInput: null
};

const $ = (selector) => document.querySelector(selector);
initializeChoiceTags();

function initializeChoiceTags() {
  for (const button of document.querySelectorAll('[data-choice-target]')) {
    button.addEventListener('click', () => {
      setChoiceValue(button.dataset.choiceTarget, button.dataset.choiceValue);
    });
  }
}

function setChoiceValue(selectId, value) {
  const select = document.querySelector(`#${selectId}`);
  const selectedValue = [...select.options].some((option) => option.value === value) ? value : 'en';
  select.value = selectedValue;
  for (const item of document.querySelectorAll(`[data-choice-target="${selectId}"]`)) {
    const active = item.dataset.choiceValue === selectedValue;
    item.classList.toggle('active', active);
    item.setAttribute('aria-pressed', String(active));
  }
}
function initializeHumanToneControl() {
  const range = $('#humanToneRange');
  const output = $('#humanToneValue');
  const infoButton = $('#humanToneInfoButton');
  const description = $('#humanToneDescription');
  const descriptionList = $('#humanToneDescriptionList');

  for (const level of Object.keys(humanToneNames)) {
    const item = document.createElement('li');
    item.textContent = `${humanToneNames[level]} · ${level}/5：${humanToneDescriptions[level]}`;
    descriptionList.append(item);
  }

  infoButton.addEventListener('click', () => {
    const isExpanded = infoButton.getAttribute('aria-expanded') === 'true';
    infoButton.setAttribute('aria-expanded', String(!isExpanded));
    infoButton.textContent = isExpanded ? '说明' : '收起';
    description.classList.toggle('hidden', isExpanded);
  });

  const update = () => {
    const label = `${humanToneNames[range.value]} · ${range.value}/5`;
    output.textContent = label;
    range.setAttribute('aria-valuetext', label);
  };
  range.addEventListener('input', update);
  update();
}



const { languageNames, humanToneNames, humanToneDescriptions, detectReplyLanguage, ideaTypeNames, contentFormatNames, replyActionNames, originalityLevelNames, normalizeContentLengthLimit, normalizeTweetLengthLimit, buildReplyPrompt, normalizeReplyResult, buildTweetOptimizationPrompt, normalizeTweetOptimization, buildContributionSuggestionsPrompt, normalizeContributionSuggestions, demoContributionSuggestions, buildOriginalContentPrompt, normalizeOriginalContent, demoOriginalContent, buildTweetRecommendationsPrompt, normalizeTweetRecommendations, demoTweetRecommendations } = XReplyCopilotIdeaEngine;
initializeHumanToneControl();

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
const MODEL_REQUEST_TIMEOUT_MS = 60000;
const DEFAULT_CONTENT_PROFILE = '程序员、摄影爱好者、美股长期投资者；关注 AI、软件工程、创作和长期投资，只写真实观察与可验证判断';

function formatModelRequestError(error) {
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError' || /aborted|timeout|timed out/i.test(error?.message || '')) {
    return '模型响应超时或请求被浏览器中止，请稍后重试；如果持续出现，请检查网络、API Key 和模型服务状态。';
  }
  return error?.message || '模型请求失败，请稍后重试。';
}



document.querySelectorAll('[data-tab]').forEach((button) => {
  button.addEventListener('click', () => {
    const tab = button.dataset.tab;
    document.querySelectorAll('[data-tab]').forEach((item) => item.classList.toggle('active', item === button));
    document.querySelectorAll('[data-tab-panel]').forEach((panel) => {
      panel.classList.toggle('hidden', panel.dataset.tabPanel !== tab);
    });
    $('#floatingTweetRewriteButton').classList.toggle('hidden', tab !== 'optimize');
  });
});
$('#floatingTweetRewriteButton').classList.add('hidden');

$('#ideasRefreshButton').addEventListener('click', generateIdeas);
$('#generateContributionSuggestionsButton').addEventListener('click', generateContributionSuggestions);
$('#sourceMaterialInput').addEventListener('input', handleSourceMaterialInput);
$('#contentProfileInput').addEventListener('input', async () => {
  state.profile = $('#contentProfileInput').value.trim();
  await chrome.storage.local.set({ contentProfile: state.profile });
  clearContributionSuggestions();
});
$('#extractSourceButton').addEventListener('click', extractSourceMaterial);
$('#clearSourceButton').addEventListener('click', clearSourceMaterial);
$('#contentLengthLimit').addEventListener('change', normalizeContentLengthInput);
$('#fillDefaultProfileButton').addEventListener('click', fillDefaultProfile);
$('#generateProfileRecommendationsButton').addEventListener('click', () => generateRecommendations('profile'));
$('#refreshRecommendationsButton').addEventListener('click', () => generateRecommendations());
$('#optimizeTweetButton').addEventListener('click', generateTweetOptimization);
$('#refreshTweetButton').addEventListener('click', generateTweetOptimization);
$('#generateTopicTweetsButton').addEventListener('click', generateTopicTweets);
document.querySelectorAll('[data-tweet-topic]').forEach((button) => {
  button.addEventListener('click', () => {
    state.currentTweetTopic = button.dataset.tweetTopic;
    document.querySelectorAll('[data-tweet-topic]').forEach((item) => item.classList.toggle('active', item === button));
  });
});
$('#floatingTweetRewriteButton').addEventListener('click', rewriteClipboardTweet);
document.querySelectorAll('[data-idea-type]').forEach((button) => {
  button.addEventListener('click', () => {
    state.currentIdeaType = button.dataset.ideaType;
    document.querySelectorAll('[data-idea-type]').forEach((item) => item.classList.toggle('active', item === button));
    clearContributionSuggestions();
  });
});
$('#scanTrendingButton').addEventListener('click', scanTrendingPosts);

$('#settingsButton').addEventListener('click', () => chrome.runtime.openOptionsPage());
initializeModelControls();
chrome.storage.local.get({ contentProfile: '' }).then(({ contentProfile }) => {
  state.profile = contentProfile;
  $('#contentProfileInput').value = contentProfile;
});

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
$('#clearPostButton').addEventListener('click', clearPost);
$('#draftButton').addEventListener('click', generateDrafts);
$('#postCard').addEventListener('input', () => {
  const text = $('#postCard').textContent.trim();
  if (!text) {
    state.post = null;
    return;
  }
  setChoiceValue('languageSelect', detectReplyLanguage(text));
  state.post = state.post
    ? { ...state.post, contextText: text }
    : { text, contextText: text };
  $('#postState').classList.add('hidden');
});

function clearPost() {
  state.post = null;
  $('#postCard').textContent = '';
  $('#postCard').classList.remove('hidden');
  $('#postState').textContent = '已清空，可以重新读取或直接粘贴其他信息。';
  $('#postState').classList.remove('hidden');
  $('#resultSection').classList.add('hidden');
  setError('');
}
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
    setChoiceValue('languageSelect', detectReplyLanguage($('#postCard').textContent));
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
    renderTrending(posts, result.pageUrl, capturedAt);
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

function renderTrending(posts, pageUrl, capturedAt) {
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
      makeLine('趋势', growth),
      makeLine('原创切入', '把它当作参考素材，补充你自己的判断、案例或反例，不要复述原帖。')
    );
    const create = document.createElement('button');
    create.className = 'secondary-button';
    create.type = 'button';
    create.textContent = '带入原创创作';
    create.addEventListener('click', () => {
      setSourceMaterial(
        formatTrendingSource(post, capturedAt),
        `已带入热门帖子${post.author ? `：${post.author}` : ''}，请补充你的新增价值`
      );
      document.querySelector('[data-tab="ideas"]').click();
      $('#originalContributionInput').focus();
      showToast('已带入热门参考素材，请补充你的新增价值', 'success');
    });
    const recommend = document.createElement('button');
    recommend.className = 'secondary-button';
    recommend.type = 'button';
    recommend.textContent = '基于此推荐';
    recommend.addEventListener('click', () => {
      const source = formatTrendingSource(post, capturedAt);
      setSourceMaterial(source, `已带入热门帖子${post.author ? `：${post.author}` : ''}，将据此生成推荐草稿`);
      document.querySelector('[data-tab="ideas"]').click();
      generateRecommendations('trending', source);
    });
    const open = document.createElement('a');
    open.href = post.url;
    open.target = '_blank';
    open.rel = 'noreferrer';
    open.textContent = '打开帖子';
    card.append(create, recommend, open);
    list.append(card);
  });
}

function formatNumber(value) {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
}

async function generateDrafts() {
  const postText = $('#postCard').textContent.trim();
  if (!postText) {
    setError('请先读取帖子，或在当前帖子区域粘贴内容。');
    showToast('请先提供帖子内容', 'error');
    return;
  }
  state.post = state.post
    ? { ...state.post, contextText: postText }
    : { text: postText, contextText: postText };
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
    const humanTone = Number($('#humanToneRange').value);
    const result = settings.apiKey
      ? await requestModel(settings, profile, language, style, humanTone)
      : demoDrafts(language, style);

    renderResult(result, settings.apiKey ? `${providerLabel(settings.provider)}生成` : '本地演示');
    showToast('回复草稿生成成功', 'success');
  } catch (error) {
    setError(formatModelRequestError(error));
    showToast('回复草稿生成失败，请查看下方错误信息', 'error');
  } finally {
    setDraftLoading(false);
    setLoading($('#draftButton'), false, '生成评论草稿');
  }
}

function setDraftLoading(loading) {
  $('#draftLoading').classList.toggle('hidden', !loading);
}

function fillDefaultProfile() {
  $('#contentProfileInput').value = DEFAULT_CONTENT_PROFILE;
  chrome.storage.local.set({ contentProfile: DEFAULT_CONTENT_PROFILE });
  clearContributionSuggestions();
  showToast('已填充默认账号定位，可继续修改', 'success');
}

function normalizeContentLengthInput() {
  $('#contentLengthLimit').value = String(normalizeContentLengthLimit($('#contentLengthLimit').value));
}

function handleSourceMaterialInput() {
  clearContributionSuggestions();
  setSourceMaterialState('');
}

function setSourceMaterial(value, stateMessage) {
  $('#originalAdvancedControls').open = true;
  $('#sourceMaterialInput').value = value;
  clearContributionSuggestions();
  setSourceMaterialState(stateMessage);
}

function setSourceMaterialState(message) {
  const state = $('#sourceMaterialState');
  state.textContent = message;
  state.classList.toggle('hidden', !message);
}

function clearSourceMaterial() {
  $('#sourceMaterialInput').value = '';
  clearContributionSuggestions();
  setSourceMaterialState('');
  setError('');
  $('#sourceMaterialInput').focus();
  showToast('参考素材已清空', 'success');
}

async function extractSourceMaterial() {
  const button = $('#extractSourceButton');
  setError('');
  setLoading(button, true, '读取中…');
  try {
    const result = await chrome.runtime.sendMessage({ type: 'extract-current-post' });
    if (!result?.ok) throw new Error(result?.error || '读取帖子失败。');
    setSourceMaterial(
      result.post.contextText || result.post.text,
      `已带入当前帖子${result.post.author ? `：${result.post.author}` : ''}`
    );
    showToast('当前帖子已填入参考素材', 'success');
  } catch (error) {
    setError(error.message);
    showToast('读取当前帖子失败', 'error');
  } finally {
    setLoading(button, false, '读取');
  }
}

function formatTrendingSource(post, capturedAt) {
  const metrics = `回复 ${formatNumber(post.metrics.replies)} · 转发 ${formatNumber(post.metrics.reposts)} · 喜欢 ${formatNumber(post.metrics.likes)} · 浏览 ${formatNumber(post.metrics.views)}`;
  return [
    '热门参考帖子',
    `原帖作者：${post.author || '未识别'}`,
    `原帖链接：${post.url}`,
    `读取时间：${capturedAt}`,
    `互动快照：${metrics}`,
    '',
    '原帖正文：',
    post.text
  ].join('\n');
}

function clearContributionSuggestions() {
  const container = $('#contributionSuggestions');
  container.replaceChildren();
  container.classList.add('hidden');
}

async function generateContributionSuggestions() {
  const button = $('#generateContributionSuggestionsButton');
  const source = $('#sourceMaterialInput').value.trim();
  if (!source) {
    setError('请先填写参考素材或话题。');
    showToast('缺少参考素材或话题', 'error');
    $('#sourceMaterialInput').focus();
    return;
  }

  const input = {
    type: ideaTypeNames[state.currentIdeaType],
    source,
    profile: $('#contentProfileInput').value.trim()
  };
  setError('');
  clearContributionSuggestions();
  setLoading(button, true, '生成中…');
  showToast('正在生成三份新增价值…', 'loading');
  try {
    const settings = await chrome.storage.local.get({
      provider: 'openai-compatible',
      endpoint: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-4o-mini',
      apiKey: ''
    });
    settings.apiKey = settings.apiKeys?.[settings.provider] || settings.apiKey;
    const suggestions = settings.apiKey
      ? await requestContributionSuggestions(settings, input)
      : demoContributionSuggestions(input);
    if (suggestions.length !== 3) throw new Error('模型没有返回完整的三份新增价值。');
    renderContributionSuggestions(suggestions);
    showToast('已生成三份新增价值，请选择或修改', 'success');
  } catch (error) {
    setError(formatModelRequestError(error));
    showToast('新增价值生成失败，请查看错误信息', 'error');
  } finally {
    setLoading(button, false, '生成三份新增价值');
  }
}

function renderContributionSuggestions(suggestions) {
  const container = $('#contributionSuggestions');
  container.replaceChildren();
  suggestions.forEach((suggestion, index) => {
    const card = document.createElement('article');
    card.className = 'contribution-suggestion';
    const heading = document.createElement('strong');
    heading.textContent = `${index + 1}. ${suggestion.angle}`;
    const contribution = document.createElement('p');
    contribution.textContent = suggestion.contribution;
    card.append(heading, contribution);
    if (suggestion.needsUserInput) card.append(makeLine('建议补充', suggestion.needsUserInput));
    const select = document.createElement('button');
    select.className = 'secondary-button';
    select.type = 'button';
    select.textContent = '选择这一份';
    select.addEventListener('click', () => {
      $('#originalContributionInput').value = suggestion.contribution;
      $('#originalContributionInput').focus();
      showToast('已填入，可继续按真实情况修改', 'success');
    });
    card.append(select);
    container.append(card);
  });
  container.classList.remove('hidden');
}
async function generateIdeas() {
  const button = $('#ideasRefreshButton');
  const contribution = $('#originalContributionInput').value.trim();
  if (!contribution) {
    setError('请先写下你的新增价值：判断、经验、分析、反例或新的背景。');
    showToast('缺少你的原创输入', 'error');
    $('#originalContributionInput').focus();
    return;
  }

  const input = {
    type: ideaTypeNames[state.currentIdeaType],
    format: $('#contentFormatSelect').value,
    language: $('#ideaLanguageSelect').value || 'zh',
    source: $('#sourceMaterialInput').value.trim(),
    contribution,
    profile: $('#contentProfileInput').value.trim(),
    contentLengthLimit: normalizeContentLengthLimit($('#contentLengthLimit').value)
  };
  setError('');
  $('#ideasResultSection').classList.remove('hidden');
  setLoading(button, true, '生成中…');
  setIdeaLoading(true);
  showToast('正在组织原创内容…', 'loading');

  try {
    const settings = await chrome.storage.local.get({
      provider: 'openai-compatible',
      endpoint: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-4o-mini',
      apiKey: ''
    });
    settings.apiKey = settings.apiKeys?.[settings.provider] || settings.apiKey;
    const result = settings.apiKey
      ? await requestOriginalContent(settings, input)
      : demoOriginalContent(input);
    const hasTranslation = renderOriginalContent(result, input.language, settings.apiKey ? `${providerLabel(settings.provider)}生成` : '本地演示');
    showToast(hasTranslation ? '原创内容生成成功' : '内容已生成，中文翻译暂未返回', hasTranslation ? 'success' : 'loading');
  } catch (error) {
    setError(formatModelRequestError(error));
    showToast('原创内容生成失败，请查看下方错误信息', 'error');
  } finally {
    setIdeaLoading(false);
    setLoading(button, false, '生成原创内容');
  }
}

async function generateRecommendations(sourceMode, source = '') {
  const profile = $('#contentProfileInput').value.trim();
  if (!profile) {
    setError('请先填写账号定位，推荐才会贴近你的长期主题。');
    $('#contentProfileInput').focus();
    return;
  }
  const input = sourceMode ? {
    sourceMode,
    source,
    topic: state.currentIdeaType,
    profile,
    language: $('#ideaLanguageSelect').value || 'zh',
    contentLengthLimit: normalizeContentLengthLimit($('#contentLengthLimit').value)
  } : state.recommendationInput;
  if (!input) return;
  const button = sourceMode ? $('#generateProfileRecommendationsButton') : $('#refreshRecommendationsButton');
  $('#recommendationResultSection').classList.remove('hidden');
  $('#recommendationLoading').classList.remove('hidden');
  setLoading(button, true, sourceMode ? '生成中…' : '换一批中…');
  try {
    const settings = await loadSettings();
    settings.apiKey = settings.apiKeys?.[settings.provider] || settings.apiKey;
    const result = settings.apiKey
      ? await requestTweetRecommendations(settings, input)
      : demoTweetRecommendations(input);
    if (result.recommendations.length !== 3) throw new Error('模型没有返回完整的三条推荐草稿。');
    state.recommendationInput = input;
    renderRecommendations(result, input);
  } catch (error) {
    setError(formatModelRequestError(error));
  } finally {
    $('#recommendationLoading').classList.add('hidden');
    setLoading(button, false, sourceMode ? '生成主题灵感' : '换一批');
  }
}

function renderRecommendations(result, input) {
  $('#recommendationModeBadge').textContent = input.sourceMode === 'trending'
    ? '热点参考'
    : `${ideaTypeNames[input.topic] ?? ideaTypeNames.all}灵感`;
  $('#recommendationRationale').textContent = result.rationale || '推荐草稿仅供参考，可直接复制或继续二次创作。';
  const list = $('#recommendationList');
  list.replaceChildren();
  result.recommendations.forEach((recommendation, index) => {
    const card = document.createElement('article');
    card.className = 'draft-card';
    const text = document.createElement('p');
    text.textContent = recommendation;
    const secondary = document.createElement('button');
    secondary.className = 'secondary-button';
    secondary.type = 'button';
    secondary.textContent = '二次创作';
    secondary.addEventListener('click', () => {
      setSourceMaterial(`推荐草稿（仅作参考）：\n${recommendation}`, '已带入推荐草稿，请补充你的新增价值');
      $('#originalContributionInput').value = '';
      $('#originalContributionInput').focus();
    });
    card.append(text, copyIdeaButton(`复制草稿 ${index + 1}`, recommendation), secondary);
    list.append(card);
  });
  $('#refreshRecommendationsButton').classList.remove('hidden');
}
async function generateTweetOptimization(inputOverride = null) {
  const button = $('#optimizeTweetButton');
  const idea = (inputOverride?.idea ?? $('#tweetIdeaInput').value).trim();
  const feedback = inputOverride?.feedback ?? $('#tweetFeedbackInput').value.trim();
  const language = $('#tweetLanguageSelect').value || 'zh';
  const contentLengthLimit = normalizeTweetLengthLimit($('#tweetLengthLimit').value);
  $('#tweetLengthLimit').value = String(contentLengthLimit);
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
    const result = normalizeTweetOptimization(await requestTweetOptimization(settings, idea, feedback, language, contentLengthLimit), { contentLengthLimit });
    if (!result.posts.length) throw new Error('模型没有返回可用文案。');
    renderTweetOptimization(result, language, providerLabel(settings.provider));
    showToast('已生成 3 个版本', 'success');
  } catch (error) {
    setError(formatModelRequestError(error));
    showToast('推文优化失败，请查看下方错误信息', 'error');
  } finally {
    setTweetLoading(false);
    setLoading(button, false, '生成优化文案');
  }
}

async function rewriteClipboardTweet() {
  const button = $('#floatingTweetRewriteButton');
  setLoading(button, true, '读取中…');
  try {
    const text = await readClipboardText();
    $('#tweetIdeaInput').value = text;
    $('#tweetFeedbackInput').value = '';
    showToast('已回显粘贴板内容，正在生成 3 个版本', 'success');
    await generateTweetOptimization({ idea: text, feedback: '' });
  } catch (error) {
    setError(error.message || '读取粘贴板失败，请手动粘贴内容。');
    showToast('一键二创失败', 'error');
  } finally {
    setLoading(button, false, '一键二创');
  }
}
async function generateTopicTweets() {
  const button = $('#generateTopicTweetsButton');
  const language = $('#tweetLanguageSelect').value || 'zh';
  const contentLengthLimit = normalizeTweetLengthLimit($('#tweetLengthLimit').value);
  const input = {
    sourceMode: 'profile',
    topic: state.currentTweetTopic,
    profile: state.profile || DEFAULT_CONTENT_PROFILE,
    language,
    contentLengthLimit
  };
  $('#tweetLengthLimit').value = String(contentLengthLimit);
  setError('');
  setLoading(button, true, '生成中…');
  setTweetLoading(true);
  showToast(`正在生成${ideaTypeNames[state.currentTweetTopic]}推文…`, 'loading');
  try {
    const settings = await loadSettings();
    settings.apiKey = settings.apiKeys?.[settings.provider] || settings.apiKey;
    const result = settings.apiKey
      ? await requestTweetRecommendations(settings, input)
      : demoTweetRecommendations(input);
    if (result.recommendations.length !== 3) throw new Error('模型没有返回完整的三条推文。');
    renderTweetOptimization(
      { posts: result.recommendations, strategy: result.rationale },
      language,
      settings.apiKey ? providerLabel(settings.provider) : '本地演示'
    );
    $('#tweetMode').textContent = `${ideaTypeNames[state.currentTweetTopic]}灵感`;
    showToast('已生成 3 条推文', 'success');
  } catch (error) {
    setError(formatModelRequestError(error));
    showToast('主题推文生成失败，请查看下方错误信息', 'error');
  } finally {
    setTweetLoading(false);
    setLoading(button, false, '按主题生成 3 条推文');
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
      const copied = await copyText(post);
      copy.textContent = copied ? '已复制' : '复制失败';
      setTimeout(() => { copy.textContent = `复制文案 ${index + 1}`; }, copied ? 1400 : 2200);
    });
    const refine = document.createElement('button');
    refine.className = 'secondary-button';
    refine.type = 'button';
    refine.textContent = '生成三个版本';
    refine.addEventListener('click', async () => {
      $('#tweetIdeaInput').value = post;
      $('#tweetFeedbackInput').value = '';
      await generateTweetOptimization({ idea: post, feedback: '' });
    });
    card.append(text, copy, refine);
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
async function requestModel(settings, profile, language, style, humanTone) {
  const languageName = languageNames[language] ?? languageNames.zh;
  const styleName = styleNames[style] ?? styleNames.insightful;
  const endpoint = requestEndpoint(settings);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`
    },
    signal: AbortSignal.timeout(MODEL_REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      model: settings.model,
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: buildReplyPrompt(languageName, styleName, humanTone)
        },
        {
          role: 'user',
          content: JSON.stringify({
            accountProfile: profile || '未提供账号定位，请保持克制、具体、非营销化。',
            targetLanguage: languageName,
            preferredStyle: styleName,
            humanTone: `${humanTone}/5（${humanToneNames[humanTone]}）`,
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
  return normalizeReplyResult(JSON.parse(content));
}
async function requestTweetOptimization(settings, idea, feedback, language, contentLengthLimit) {
  const response = await fetch(requestEndpoint(settings), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`
    },
    signal: AbortSignal.timeout(MODEL_REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      model: settings.model,
      temperature: 0.8,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: buildTweetOptimizationPrompt(languageNames[language] ?? languageNames.zh, contentLengthLimit)
        },
        {
          role: 'user',
          content: JSON.stringify({
            idea,
            feedback: feedback || '没有额外修改意见，请先按默认规则优化。',
            language: languageNames[language] ?? languageNames.zh,
            contentLengthLimit
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

async function requestTweetRecommendations(settings, input) {
  const response = await fetch(requestEndpoint(settings), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` },
    signal: AbortSignal.timeout(MODEL_REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      model: settings.model,
      temperature: 0.8,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildTweetRecommendationsPrompt({ ...input, language: languageNames[input.language] ?? languageNames.zh }) },
        { role: 'user', content: JSON.stringify(input) }
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
  return normalizeTweetRecommendations(JSON.parse(content), input);
}

async function requestContributionSuggestions(settings, input) {
  const response = await fetch(requestEndpoint(settings), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`
    },
    signal: AbortSignal.timeout(MODEL_REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      model: settings.model,
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildContributionSuggestionsPrompt(input) },
        { role: 'user', content: JSON.stringify(input) }
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
  return normalizeContributionSuggestions(JSON.parse(content));
}

async function requestOriginalContent(settings, input) {
  const languageName = languageNames[input.language] ?? languageNames.zh;
  const endpoint = requestEndpoint(settings);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`
    },
    signal: AbortSignal.timeout(MODEL_REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      model: settings.model,
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildOriginalContentPrompt({ ...input, language: languageName }) },
        { role: 'user', content: JSON.stringify({ ...input, language: languageName }) }
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
  return normalizeOriginalContent(JSON.parse(content), input);
}

function renderOriginalContent(result, language, mode) {
  if (!result.content) throw new Error('模型没有返回可用内容。');
  $('#ideasModeBadge').textContent = mode;
  const card = $('#ideaCard');
  card.replaceChildren();
  const type = document.createElement('div');
  type.className = 'idea-card-type';
  type.textContent = `${result.type} · ${contentFormatNames[result.format]}`;
  const content = document.createElement('p');
  content.className = 'random-idea-content';
  content.textContent = result.content;
  card.append(
    type,
    makeLine('原创程度', originalityLevelNames[result.originalityLevel]),
    makeLine('判断依据', result.originalityReason || '未提供判断依据。'),
    makeLine('字数', `${result.contentLength}/${result.contentLengthLimit} 字${result.wasTruncated ? '（已按上限截断）' : ''}`)
  );
  if (result.missingValue) card.append(makeLine('建议补充', result.missingValue));
  card.append(content);

  let hasTranslation = language === 'zh';
  if (language !== 'zh') {
    hasTranslation = Boolean(result.translation);
    if (result.translation) {
      card.append(makeLine('中文翻译', result.translation), copyIdeaButton('复制中文翻译', result.translation));
    } else {
      const warning = document.createElement('div');
      warning.className = 'translation-warning';
      warning.textContent = '中文翻译暂未返回，可再次生成。';
      card.append(warning);
    }
  }
  card.append(copyIdeaButton('复制原创草稿', result.content));
  card.classList.remove('hidden');
  return hasTranslation;
}

async function readClipboardText() {
  if (!navigator.clipboard?.readText) throw new Error('当前环境不支持读取粘贴板，请手动粘贴内容。');
  const text = await navigator.clipboard.readText();
  if (!text.trim()) throw new Error('粘贴板中没有可用内容。');
  return text;
}
async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    showToast('复制成功', 'success');
    return true;
  } catch {
    showToast('复制失败，请手动选择文字', 'error');
    return false;
  }
}

function copyIdeaButton(label, value) {
  const button = document.createElement('button');
  button.className = 'copy-button';
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', async () => {
    const copied = await copyText(value);
    button.textContent = copied ? '已复制' : '复制失败，请手动选择文字';
    setTimeout(() => { button.textContent = label; }, copied ? 1400 : 2600);
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
    },
    ja: {
      insightful: ['見落とされがちなのは、より強いモデルを選ぶ前に問題の範囲を明確にすることです。', '実際に進めるなら、誰が内容を管理し、何を信頼できる情報とするかを先に決めたいです。', '重要なのは作れるかどうかだけでなく、作った後に誰が価値を維持するかだと思います。']
    },
    ko: {
      insightful: ['놓치기 쉬운 점은 더 강한 모델을 고르기 전에 문제의 범위를 먼저 명확히 해야 한다는 것입니다.', '실제로 진행하려면 누가 콘텐츠를 관리하고 어떤 정보를 신뢰할지부터 정하는 편이 좋습니다.', '핵심은 만들 수 있느냐뿐 아니라 만든 뒤 누가 가치를 유지하느냐에 있습니다.']
    }
  };
  const languageDrafts = draftsByLanguage[language] ?? draftsByLanguage.zh;
  const drafts = languageDrafts[style] ?? languageDrafts.insightful;
  const messages = {
    zh: { reason: `本地演示已基于当前帖子生成草稿。帖子开头：${opening}`, risk: '请人工检查上下文、事实和语气。', angle: `建议采用${styleNames[style] ?? styleNames.insightful}角度。` },
    en: { reason: `Local demo drafts are based on the current post. Opening: ${opening}`, risk: 'Review the context, facts, and tone before posting.', angle: `Suggested angle: ${styleNames[style] ?? styleNames.insightful}.` },
    vi: { reason: `Bản demo cục bộ được tạo dựa trên bài viết hiện tại. Phần mở đầu: ${opening}`, risk: 'Hãy kiểm tra ngữ cảnh, thông tin và giọng điệu trước khi đăng.', angle: `Góc đề xuất: ${styleNames[style] ?? styleNames.insightful}.` },
    ja: { reason: `ローカルデモは現在の投稿をもとに作成しました。冒頭：${opening}`, risk: '投稿前に文脈、事実、表現を確認してください。', angle: `推奨する切り口：${styleNames[style] ?? styleNames.insightful}。` },
    ko: { reason: `로컬 데모는 현재 게시물을 바탕으로 생성했습니다. 시작 부분: ${opening}`, risk: '게시 전 문맥, 사실, 어조를 확인하세요.', angle: `권장 관점: ${styleNames[style] ?? styleNames.insightful}.` }
  };
  const message = messages[language] ?? messages.zh;
  const translations = language === 'zh'
    ? []
    : (draftsByLanguage.zh[style] ?? draftsByLanguage.zh.insightful);

  return normalizeReplyResult({
    shouldReply: true,
    reason: message.reason,
    risk: message.risk,
    angle: message.angle,
    drafts,
    translations
  });
}
function renderResult(result, mode) {
  $('#resultSection').classList.remove('hidden');
  $('#modeBadge').textContent = mode;
  $('#analysisCard').dataset.recommendation = result.shouldReply ? 'yes' : 'no';
  $('#analysisCard').replaceChildren(
    makeLine('最合适的动作', replyActionNames[result.recommendedAction]),
    makeLine('动作依据', result.actionReason),
    makeLine('是否直接回复', result.shouldReply ? '可以考虑回复' : '不建议直接回复'),
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
      const copied = await copyText(draft);
      copy.textContent = copied ? '已复制' : '复制失败';
      setTimeout(() => { copy.textContent = `复制草稿 ${index + 1}`; }, copied ? 1400 : 2200);
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
