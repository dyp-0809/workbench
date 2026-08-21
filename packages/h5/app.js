const { languageNames, humanToneNames, humanToneDescriptions, detectReplyLanguage, ideaTypeNames, contentFormatNames, replyActionNames, originalityLevelNames, normalizeContentLengthLimit, normalizeTweetLengthLimit, buildReplyPrompt, normalizeReplyResult, buildTweetOptimizationPrompt, normalizeTweetOptimization, buildContributionSuggestionsPrompt, normalizeContributionSuggestions, buildOriginalContentPrompt, normalizeOriginalContent, buildTweetRecommendationsPrompt, normalizeTweetRecommendations } = XReplyCopilotIdeaEngine;
const styleNames = { insightful: '补充观点', practical: '实操建议', question: '提问式', concise: '极简回应', professional: '专业分析', friendly: '友好支持', contrarian: '温和反驳', witty: '轻松幽默', sarcastic: '讽刺' };
const TWEET_STYLE_KEYS = Object.freeze(['insightful', 'witty', 'practical', 'friendly', 'concise', 'professional', 'question', 'contrarian', 'sarcastic']);
const DEEPSEEK_API = 'https://api.deepseek.com';
const $ = (selector) => document.querySelector(selector);

let currentIdeaType = 'all';
let currentTweetTopic = 'life';
let lastRecommendationInput = null;
const DEFAULT_CONTENT_PROFILE = '程序员、摄影爱好者、美股长期投资者；关注 AI、软件工程、创作和长期投资，只写真实观察与可验证判断';
let tweetGenerationContext = '';
let previousTweetDrafts = [];
const CONTENT_PROFILE_STORAGE_KEY = 'contentProfile';

$('#ideaLanguageSelect').value = 'zh';
$('#contentProfileInput').value = localStorage.getItem(CONTENT_PROFILE_STORAGE_KEY) || '';
initializeChoiceTags();
initializeHumanToneControl();
initializeTweetStyleControl();
initializeTweetLengthTabs();

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
function getTweetStyle() {
  return TWEET_STYLE_KEYS[Number($('#tweetStyleRange').value) - 1] ?? TWEET_STYLE_KEYS[0];
}
function initializeTweetStyleControl() {
  const range = $('#tweetStyleRange');
  const output = $('#tweetStyleValue');
  const update = () => {
    const style = getTweetStyle();
    const label = `${styleNames[style]} · ${range.value}/9`;
    output.textContent = label;
    range.setAttribute('aria-valuetext', label);
  };
  range.addEventListener('input', update);
  update();
}
function initializeTweetLengthTabs() {
  const input = $('#tweetLengthLimit');
  const setValue = (value) => {
    const normalizedValue = normalizeTweetLengthLimit(value);
    input.value = String(normalizedValue);
    document.querySelectorAll('[data-tweet-length]').forEach((button) => {
      const active = Number(button.dataset.tweetLength) === normalizedValue;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  };
  document.querySelectorAll('[data-tweet-length]').forEach((button) => {
    button.addEventListener('click', () => setValue(button.dataset.tweetLength));
  });
  setValue(input.value);
}


for (const button of document.querySelectorAll('[data-tab]')) {
  button.addEventListener('click', () => {
    const tab = button.dataset.tab;
    for (const item of document.querySelectorAll('[data-tab]')) item.classList.toggle('active', item === button);
    for (const panel of document.querySelectorAll('[data-tab-panel]')) panel.classList.toggle('hidden', panel.dataset.tabPanel !== tab);
    setFloatingQuickReplyVisibility(tab);
  });
}
setFloatingQuickReplyVisibility('ideas');

function setFloatingQuickReplyVisibility(tab) {
  $('#floatingQuickReplyButton').classList.toggle('hidden', tab !== 'reply');
  $('#floatingSourcePasteButton').classList.toggle('hidden', tab !== 'ideas');
  $('#floatingTweetRewriteButton').classList.toggle('hidden', tab !== 'optimize');
}

$('#settingsButton').addEventListener('click', () => {
  $('#apiKeyInput').value = localStorage.getItem('deepseekApiKey') || '';
  $('#modelSelect').value = localStorage.getItem('deepseekModel') || 'deepseek-chat';
  $('#settingsDialog').showModal();
});
$('#settingsForm').addEventListener('submit', (event) => {
  if (event.submitter?.value === 'save') {
    localStorage.setItem('deepseekApiKey', $('#apiKeyInput').value.trim());
    localStorage.setItem('deepseekModel', $('#modelSelect').value || 'deepseek-chat');
  }
});
$('#modelSelect').addEventListener('change', () => {
  localStorage.setItem('deepseekModel', $('#modelSelect').value);
});
$('#draftButton').addEventListener('click', generateDrafts);
$('#ideasRefreshButton').addEventListener('click', generateIdeas);
$('#generateContributionSuggestionsButton').addEventListener('click', generateContributionSuggestions);
$('#sourceMaterialInput').addEventListener('input', handleSourceMaterialInput);
$('#pasteSourceButton').addEventListener('click', () => pasteSourceMaterial($('#pasteSourceButton')));
$('#clearSourceButton').addEventListener('click', clearSourceMaterial);
$('#contentProfileInput').addEventListener('input', () => {
  localStorage.setItem(CONTENT_PROFILE_STORAGE_KEY, $('#contentProfileInput').value.trim());
  clearContributionSuggestions();
});
$('#contentLengthLimit').addEventListener('change', normalizeContentLengthInput);
$('#fillDefaultProfileButton').addEventListener('click', fillDefaultProfile);
$('#generateProfileRecommendationsButton').addEventListener('click', () => generateRecommendations('profile'));
$('#refreshRecommendationsButton').addEventListener('click', () => generateRecommendations());
$('#optimizeTweetButton').addEventListener('click', generateTweetOptimization);
$('#clearTweetIdeaButton').addEventListener('click', clearTweetIdea);
$('#generateTopicTweetsButton').addEventListener('click', generateTopicTweets);
for (const button of document.querySelectorAll('[data-tweet-topic]')) {
  button.addEventListener('click', () => {
    currentTweetTopic = button.dataset.tweetTopic;
    for (const item of document.querySelectorAll('[data-tweet-topic]')) item.classList.toggle('active', item === button);
  });
}
$('#refreshTweetButton').addEventListener('click', generateTweetOptimization);
for (const button of document.querySelectorAll('[data-idea-type]')) {
  button.addEventListener('click', () => {
    currentIdeaType = button.dataset.ideaType;
    for (const item of document.querySelectorAll('[data-idea-type]')) item.classList.toggle('active', item === button);
    clearContributionSuggestions();
  });
}
$('#clearPostButton').addEventListener('click', () => {
  $('#postInput').value = '';
  $('#postInput').focus();
});
$('#floatingSourcePasteButton').addEventListener('click', () => pasteSourceMaterial($('#floatingSourcePasteButton')));
$('#floatingQuickReplyButton').addEventListener('click', quickReply);
$('#floatingTweetRewriteButton').addEventListener('click', rewriteClipboardTweet);
$('#testConnectionButton').addEventListener('click', testConnection);
if (localStorage.getItem('deepseekApiKey')) testConnection();

async function readClipboardText() {
  if (!window.isSecureContext || !navigator.clipboard?.readText) {
    throw new Error('当前 HTTP 页面不允许读取粘贴板，请在输入框中使用系统“粘贴”。');
  }
  const text = await navigator.clipboard.readText();
  if (!text.trim()) throw new Error('粘贴板中没有可用内容。');
  return text;
}

async function replacePostFromClipboard() {
  const input = $('#postInput');
  input.value = '';
  showError('');
  const text = await readClipboardText();
  input.value = text;
  setChoiceValue('languageSelect', detectReplyLanguage(text));
  return text;
}

async function pastePost() {
  try {
    await replacePostFromClipboard();
  } catch (error) {
    showError(error.message || '读取粘贴板失败，请在输入框中使用 iPhone 系统“粘贴”。');
  }
}

function handleSourceMaterialInput() {
  clearContributionSuggestions();
  setSourceMaterialState('');
}
function openOriginalAdvancedControls() {
  $('#originalAdvancedControls').open = true;
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
  showError('');
  $('#sourceMaterialInput').focus();
  showToast('参考素材已清空', 'success');
}

async function pasteSourceMaterial(button) {
  setLoading(button, true, '读取中…');
  showError('');
  try {
    const text = await readClipboardText();
    openOriginalAdvancedControls();
    $('#sourceMaterialInput').value = text;
    clearContributionSuggestions();
    setSourceMaterialState('已带入剪贴板素材，可生成新增价值后继续创作');
    $('#sourceMaterialInput').focus();
    showToast('粘贴板内容已填入参考素材', 'success');
  } catch (error) {
    showError(error.message || '读取粘贴板失败，请在输入框中使用系统“粘贴”。');
    showToast('粘贴参考素材失败', 'error');
  } finally {
    setLoading(button, false, '粘贴素材');
  }
}

async function quickReply() {
  const button = $('#floatingQuickReplyButton');
  setLoading(button, true, '处理中…');
  try {
    await replacePostFromClipboard();
    await generateDrafts();
  } catch (error) {
    showError(error.message || '快速回复失败，请稍后重试。');
    showToast('快速回复失败，请查看错误信息', 'error');
  } finally {
    setLoading(button, false, '快速回复');
  }
}

async function testConnection() {
  const button = $('#testConnectionButton');
  const apiKey = localStorage.getItem('deepseekApiKey') || '';
  if (!apiKey) {
    setConnectionState('未配置 Key', 'error');
    return;
  }
  setLoading(button, true, '检测中…');
  setConnectionState('检测中', 'checking');
  try {
    const response = await fetch(`${DEEPSEEK_API}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(formatApiError(payload, response.status));
    const models = Array.isArray(payload.data) ? payload.data : [];
    populateModels(models);
    setConnectionState(`正常 · ${models.length} 个模型`, 'success');
  } catch (error) {
    setConnectionState('异常', 'error');
    showError(`大模型连接失败：${error.message}`);
  } finally {
    setLoading(button, false, '检测连接');
  }
}

function populateModels(models) {
  const select = $('#modelSelect');
  const current = localStorage.getItem('deepseekModel') || select.value || 'deepseek-chat';
  const modelIds = [...new Set(models.map((model) => typeof model === 'string' ? model : model.id).filter(Boolean))];
  if (!modelIds.includes(current)) modelIds.unshift(current);
  select.replaceChildren(...modelIds.map((modelId) => new Option(modelId, modelId)));
  select.value = current;
}

function setConnectionState(text, state) {
  const element = $('#connectionState');
  element.textContent = text;
  element.dataset.state = state;
}

async function generateDrafts() {
  const post = $('#postInput').value.trim();
  if (!post) {
    showError('请先粘贴 X 帖子正文。');
    showToast('请先粘贴帖子正文', 'error');
    return;
  }
  const button = $('#draftButton');
  setLoading(button, true, '生成中…');
  $('#replyResult').classList.remove('hidden');
  $('#analysisCard').replaceChildren();
  $('#draftList').replaceChildren();
  setReplyLoading(true);
  showError('');
  showToast('正在生成评论…', 'loading');
  try {
    const language = $('#languageSelect').value;
    const style = $('#styleSelect').value;
    const humanTone = Number($('#humanToneRange').value);
    const settings = getSettings();
    const result = await requestModel(settings, {
      accountProfile: $('#profileInput').value.trim() || '未提供账号定位，请保持克制、具体、非营销化。',
      targetLanguage: languageNames[language],
      preferredStyle: styleNames[style],
      humanTone: `${humanTone}/5（${humanToneNames[humanTone]}）`,
      post
    }, buildReplyPrompt(languageNames[language], styleNames[style], humanTone));
    renderReply(result);
    showToast('评论生成成功', 'success');
  } catch (error) {
    showError(error.message);
    showToast('评论生成失败，请查看下方错误信息', 'error');
  } finally {
    setReplyLoading(false);
    setLoading(button, false, '生成评论草稿');
  }
}

function setReplyLoading(loading) {
  $('#replyLoading').classList.toggle('hidden', !loading);
  $('#analysisCard').classList.toggle('hidden', loading);
  $('#draftList').classList.toggle('hidden', loading);
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

function fillDefaultProfile() {
  $('#contentProfileInput').value = DEFAULT_CONTENT_PROFILE;
  localStorage.setItem(CONTENT_PROFILE_STORAGE_KEY, DEFAULT_CONTENT_PROFILE);
  clearContributionSuggestions();
  showToast('已填充默认账号定位，可继续修改', 'success');
}

function normalizeContentLengthInput() {
  $('#contentLengthLimit').value = String(normalizeContentLengthLimit($('#contentLengthLimit').value));
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
    showError('请先填写参考素材或话题。');
    showToast('缺少参考素材或话题', 'error');
    $('#sourceMaterialInput').focus();
    return;
  }

  const input = {
    type: ideaTypeNames[currentIdeaType],
    source,
    profile: $('#contentProfileInput').value.trim()
  };
  setLoading(button, true, '生成中…');
  clearContributionSuggestions();
  showError('');
  showToast('正在生成三份新增价值…', 'loading');
  try {
    const suggestions = normalizeContributionSuggestions(await requestModel(
      getSettings(),
      input,
      buildContributionSuggestionsPrompt(input)
    ));
    if (suggestions.length !== 3) throw new Error('模型没有返回完整的三份新增价值。');
    renderContributionSuggestions(suggestions);
    showToast('已生成三份新增价值，请选择或修改', 'success');
  } catch (error) {
    showError(error.message);
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
    if (suggestion.needsUserInput) card.append(line('建议补充', suggestion.needsUserInput));
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

async function generateRecommendations(sourceMode, source = '') {
  const profile = $('#contentProfileInput').value.trim();
  if (!profile) {
    showError('请先填写账号定位，推荐才会贴近你的长期主题。');
    $('#contentProfileInput').focus();
    return;
  }
  const input = sourceMode
    ? {
      sourceMode,
      source,
      topic: currentIdeaType,
      profile,
      language: $('#ideaLanguageSelect').value || 'zh',
      contentLengthLimit: normalizeContentLengthLimit($('#contentLengthLimit').value)
    }
    : lastRecommendationInput;
  if (!input) return;
  const button = sourceMode ? $('#generateProfileRecommendationsButton') : $('#refreshRecommendationsButton');
  $('#recommendationResult').classList.remove('hidden');
  $('#recommendationLoading').classList.remove('hidden');
  $('#recommendationList').replaceChildren();
  $('#refreshRecommendationsButton').classList.add('hidden');
  setLoading(button, true, sourceMode ? '生成中…' : '换一批中…');
  try {
    const language = languageNames[input.language] ?? languageNames.zh;
    const result = normalizeTweetRecommendations(await requestModel(
      getSettings(),
      { ...input, language },
      buildTweetRecommendationsPrompt({ ...input, language })
    ), input);
    if (result.recommendations.length !== 3) throw new Error('模型没有返回完整的三条推荐草稿。');
    lastRecommendationInput = input;
    renderRecommendations(result, input);
  } catch (error) {
    showError(error.message);
  } finally {
    $('#recommendationLoading').classList.add('hidden');
    setLoading(button, false, sourceMode ? '生成主题灵感' : '换一批');
  }
}

function renderRecommendations(result, input) {
  $('#recommendationMode').textContent = input.sourceMode === 'trending'
    ? '热点参考'
    : `${ideaTypeNames[input.topic] ?? ideaTypeNames.all}灵感`;
  $('#recommendationRationale').textContent = result.rationale || '推荐草稿仅供参考，可直接复制或继续二次创作。';
  const list = $('#recommendationList');
  list.replaceChildren();
  result.recommendations.forEach((recommendation, index) => {
    const card = document.createElement('article');
    card.className = 'draft-item';
    card.append(document.createTextNode(recommendation), copyButton(`复制草稿 ${index + 1}`, recommendation));
    const secondary = document.createElement('button');
    secondary.className = 'secondary-button';
    secondary.type = 'button';
    secondary.textContent = '二次创作';
    secondary.addEventListener('click', () => {
      openOriginalAdvancedControls();
      $('#sourceMaterialInput').value = `推荐草稿（仅作参考）：\n${recommendation}`;
      $('#originalContributionInput').value = '';
      clearContributionSuggestions();
      setSourceMaterialState('已带入推荐草稿，请补充你的新增价值');
      $('#originalContributionInput').focus();
    });
    card.append(secondary);
    list.append(card);
  });
  $('#refreshRecommendationsButton').classList.remove('hidden');
}

async function generateIdeas() {
  const button = $('#ideasRefreshButton');
  const contribution = $('#originalContributionInput').value.trim();
  if (!contribution) {
    showError('请先写下你的新增价值：判断、经验、分析、反例或新的背景。');
    showToast('缺少你的原创输入', 'error');
    $('#originalContributionInput').focus();
    return;
  }
  const input = {
    type: ideaTypeNames[currentIdeaType],
    format: $('#contentFormatSelect').value,
    language: $('#ideaLanguageSelect').value || 'zh',
    source: $('#sourceMaterialInput').value.trim(),
    contribution,
    profile: $('#contentProfileInput').value.trim(),
    contentLengthLimit: normalizeContentLengthLimit($('#contentLengthLimit').value)
  };
  $('#ideasResult').classList.remove('hidden');
  setLoading(button, true, '生成中…');
  setIdeaLoading(true);
  showError('');
  showToast('正在组织原创内容…', 'loading');
  try {
    const settings = getSettings();
    const languageName = languageNames[input.language] ?? languageNames.zh;
    const result = normalizeOriginalContent(await requestModel(
      settings,
      { ...input, language: languageName },
      buildOriginalContentPrompt({ ...input, language: languageName })
    ), input);
    const hasTranslation = renderIdeas(result, input.language);
    showToast(hasTranslation ? '原创内容生成成功' : '内容已生成，中文翻译暂未返回', hasTranslation ? 'success' : 'loading');
  } catch (error) {
    showError(error.message);
    showToast('原创内容生成失败，请查看下方错误信息', 'error');
  } finally {
    setIdeaLoading(false);
    setLoading(button, false, '生成原创内容');
  }
}
async function generateTweetOptimization(inputOverride = null) {
  const button = $('#optimizeTweetButton');
  const sourceTweet = (inputOverride?.sourceTweet ?? $('#tweetIdeaInput').value).trim();
  const topReplies = (inputOverride?.topReplies ?? $('#tweetTopRepliesInput').value).trim();
  const feedback = inputOverride?.feedback ?? $('#tweetFeedbackInput').value.trim();
  const language = $('#tweetLanguageSelect').value || 'zh';
  const tweetStyle = getTweetStyle();
  const generationContext = JSON.stringify({ sourceTweet, topReplies, feedback, language, tweetStyle, contentLengthLimit: $('#tweetLengthLimit').value });
  if (generationContext !== tweetGenerationContext) {
    tweetGenerationContext = generationContext;
    previousTweetDrafts = [];
  }
  if (!sourceTweet) {
    showError('请先粘贴原始推文。');
    showToast('请先粘贴原始推文', 'error');
    $('#tweetIdeaInput').focus();
    return;
  }
  const contentLengthLimit = normalizeTweetLengthLimit($('#tweetLengthLimit').value);
  $('#tweetLengthLimit').value = String(contentLengthLimit);
  setLoading(button, true, '生成中…');
  setTweetLoading(true);
  showError('');
  showToast('正在生成个人推文…', 'loading');
  try {
    const settings = getSettings();
    const result = normalizeTweetOptimization(await requestModel(settings, {
      sourceTweet,
      topReplies,
      feedback,
      style: styleNames[tweetStyle],
      previousDrafts: previousTweetDrafts,
      language: languageNames[language],
      contentLengthLimit
    }, buildTweetOptimizationPrompt(languageNames[language], contentLengthLimit, styleNames[tweetStyle])), { contentLengthLimit });
    if (!result.posts.length) throw new Error('模型没有返回可用文案。');
    renderTweetOptimization(result, language, true);
    previousTweetDrafts = [...previousTweetDrafts, ...result.posts];
    showToast('已生成个人推文', 'success');
  } catch (error) {
    showError(error.message);
    showToast('个人推文生成失败，请查看下方错误信息', 'error');
  } finally {
    setTweetLoading(false);
    setLoading(button, false, '生成个人推文');
  }
}

async function rewriteClipboardTweet() {
  const button = $('#floatingTweetRewriteButton');
  setLoading(button, true, '读取中…');
  try {
    const text = await readClipboardText();
    $('#tweetIdeaInput').value = text;
    $('#tweetTopRepliesInput').value = '';
    $('#tweetFeedbackInput').value = '';
    showToast('已回显原始推文，可选补充高赞回复', 'success');
    tweetGenerationContext = '';
    previousTweetDrafts = [];
  } catch (error) {
    showError(error.message || '读取粘贴板失败，请在输入框中使用系统“粘贴”。');
    showToast('一键二创失败', 'error');
  } finally {
    setLoading(button, false, '一键二创');
  }
}
function clearTweetIdea() {
  $('#tweetIdeaInput').value = '';
  $('#tweetTopRepliesInput').value = '';
  $('#tweetFeedbackInput').value = '';
  showError('');
  $('#tweetIdeaInput').focus();
  showToast('二创素材已清空', 'success');
  tweetGenerationContext = '';
  previousTweetDrafts = [];
}
async function generateTopicTweets() {
  const button = $('#generateTopicTweetsButton');
  const language = $('#tweetLanguageSelect').value || 'zh';
  const contentLengthLimit = normalizeTweetLengthLimit($('#tweetLengthLimit').value);
  const input = {
    sourceMode: 'profile',
    topic: currentTweetTopic,
    profile: localStorage.getItem(CONTENT_PROFILE_STORAGE_KEY) || DEFAULT_CONTENT_PROFILE,
    language,
    contentLengthLimit
  };
  $('#tweetLengthLimit').value = String(contentLengthLimit);
  setLoading(button, true, '生成中…');
  setTweetLoading(true);
  showError('');
  showToast(`正在生成${ideaTypeNames[currentTweetTopic]}推文…`, 'loading');
  try {
    const result = normalizeTweetRecommendations(await requestModel(
      getSettings(),
      { ...input, language: languageNames[language] },
      buildTweetRecommendationsPrompt({ ...input, language: languageNames[language] })
    ), input);
    if (result.recommendations.length !== 3) throw new Error('模型没有返回完整的三条推文。');
    renderTweetOptimization({ posts: result.recommendations, strategy: result.rationale }, language);
    $('#tweetMode').textContent = `${ideaTypeNames[currentTweetTopic]}灵感`;
    showToast('已生成 3 条推文', 'success');
  } catch (error) {
    showError(error.message);
    showToast('主题推文生成失败，请查看下方错误信息', 'error');
  } finally {
    setTweetLoading(false);
    setLoading(button, false, '按主题生成 3 条推文');
  }
}

function setTweetLoading(loading) {
  $('#tweetResult').classList.remove('hidden');
  $('#tweetStrategy').classList.toggle('hidden', loading);
  $('#tweetDraftList').classList.toggle('hidden', loading);
}

function renderTweetOptimization(result, language, showChineseTranslation = false) {
  $('#tweetMode').textContent = `DeepSeek · ${languageNames[language]}`;
  $('#tweetStrategy').replaceChildren(
    makeTweetLine('二创思路', result.strategy || '提炼原帖与高赞回复中的有效观点，写出独立判断。'),
    makeTweetLine('新增价值', result.valueAdded || '未返回，请人工确认这条推文是否提供了原帖之外的新判断。'),
    makeTweetLine('读者收获', result.readerBenefit || '未返回，请人工确认目标读者能获得的具体价值。'),
    ...(result.risk ? [makeTweetLine('风险提示', result.risk)] : [])
  );
  const list = $('#tweetDraftList');
  list.replaceChildren();
  result.posts.forEach((post, index) => {
    const card = document.createElement('article');
    card.className = 'draft-item';
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
    refine.textContent = '基于此再创作';
    refine.addEventListener('click', () => {
      $('#tweetIdeaInput').value = post;
      $('#tweetTopRepliesInput').value = '';
      $('#tweetFeedbackInput').value = '';
      showToast('可选补充高赞回复后再次生成', 'loading');
    });
    card.append(text);
    if (showChineseTranslation && language !== 'zh') {
      if (result.translation) {
        card.append(makeTweetLine('中文对照', result.translation));
      } else {
        const warning = document.createElement('div');
        warning.className = 'translation-warning';
        warning.textContent = '中文对照暂未返回，可再次生成。';
        card.append(warning);
      }
    }
    card.append(copy, refine);
    list.append(card);
  });
}
function makeTweetLine(label, value) {
  const line = document.createElement('div');
  const strong = document.createElement('strong');
  strong.textContent = `${label}：`;
  line.append(strong, document.createTextNode(value));
  return line;
}



function setIdeaLoading(loading) {
  $('#ideaLoading').classList.toggle('hidden', !loading);
  $('#ideaCard').classList.toggle('hidden', loading && !$('#ideaCard').textContent);
}

function getSettings() {
  const apiKey = localStorage.getItem('deepseekApiKey') || '';
  if (!apiKey) throw new Error('请先点击右上角“设置”，填写 DeepSeek API Key。');
  return { apiKey, model: localStorage.getItem('deepseekModel') || 'deepseek-chat' };
}
function formatApiError(payload, status) {
  const detail = payload.error ?? payload.message ?? `HTTP ${status}`;
  return typeof detail === 'string' ? detail : JSON.stringify(detail);
}

async function requestModel(settings, input, system) {
  const response = await fetch(`${DEEPSEEK_API}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${settings.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ model: settings.model, temperature: 0.7, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(input) }] })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(formatApiError(payload, response.status));
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error('模型没有返回可用内容。');
  return JSON.parse(content);
}

function renderReply(result) {
  const normalized = normalizeReplyResult(result);
  $('#replyResult').classList.remove('hidden');
  $('#analysisCard').replaceChildren(
    line('最合适的动作', replyActionNames[normalized.recommendedAction]),
    line('动作依据', normalized.actionReason),
    line('是否直接回复', normalized.shouldReply ? '可以考虑回复' : '不建议直接回复'),
    line('理由', normalized.reason),
    line('角度', normalized.angle),
    line('风险提示', normalized.risk)
  );
  const list = $('#draftList');
  list.replaceChildren();
  normalized.drafts.forEach((draft, index) => {
    const card = document.createElement('article');
    card.className = 'draft-item reply-draft';
    card.dataset.draftIndex = String(index + 1);
    const label = document.createElement('div');
    label.className = 'draft-label';
    label.textContent = `评论 ${index + 1}`;
    card.append(label, document.createTextNode(draft));
    if (normalized.translations[index]) card.append(line('中文译文', normalized.translations[index]));
    card.append(copyButton(`复制草稿 ${index + 1}`, draft));
    list.append(card);
  });
  if (!normalized.drafts.length) list.append(line('结果', '没有生成可用草稿，建议人工处理。'));
}

function renderIdeas(normalized, language) {
  if (!normalized.content) throw new Error('模型没有返回可用内容。');
  const card = $('#ideaCard');
  card.replaceChildren();
  const type = document.createElement('div');
  type.className = 'idea-card-type';
  type.textContent = `${normalized.type} · ${contentFormatNames[normalized.format]}`;
  const contentElement = document.createElement('div');
  contentElement.className = 'idea-content';
  contentElement.textContent = normalized.content;
  card.append(
    type,
    line('原创程度', originalityLevelNames[normalized.originalityLevel]),
    line('判断依据', normalized.originalityReason || '未提供判断依据。'),
    line('字数', `${normalized.contentLength}/${normalized.contentLengthLimit} 字${normalized.wasTruncated ? '（已按上限截断）' : ''}`)
  );
  if (normalized.missingValue) card.append(line('建议补充', normalized.missingValue));
  card.append(contentElement);
  let hasTranslation = language === 'zh';
  if (language !== 'zh') {
    hasTranslation = Boolean(normalized.translation);
    if (normalized.translation) {
      card.append(line('中文翻译', normalized.translation), copyButton('复制中文翻译', normalized.translation));
    } else {
      const warning = document.createElement('div');
      warning.className = 'translation-warning';
      warning.textContent = '中文翻译暂未返回，可再次生成。';
      card.append(warning);
    }
  }
  card.append(copyButton('复制原创草稿', normalized.content));
  card.classList.remove('hidden');
  return hasTranslation;
}

function line(label, value) { const element = document.createElement('div'); const strong = document.createElement('strong'); strong.textContent = `${label}：`; element.append(strong, document.createTextNode(value)); return element; }
function copyButton(label, value) {
  const button = document.createElement('button');
  button.className = 'copy-button';
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', async () => {
    const copied = await copyText(value);
    button.textContent = copied ? '已复制' : '请长按下方文字复制';
    setTimeout(() => { button.textContent = label; }, copied ? 1400 : 2600);
  });
  return button;
}

async function copyText(value) {
  let copied = false;
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      copied = true;
    } catch {
      // HTTP 页面或 iOS 权限策略可能拒绝 Clipboard API，继续使用兼容回退。
    }
  }

  if (!copied) {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '0';
    textarea.style.left = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    try {
      copied = document.execCommand('copy');
    } catch {
      copied = false;
    } finally {
      document.body.removeChild(textarea);
    }
  }

  showToast(copied ? '复制成功' : '复制失败，请手动选择文字', copied ? 'success' : 'error');
  return copied;
}
function setLoading(button, loading, text) { button.disabled = loading; button.textContent = text; }
function showError(message) { const element = $('#errorMessage'); element.textContent = message; element.classList.toggle('hidden', !message); }
