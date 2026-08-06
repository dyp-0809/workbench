const { languageNames, ideaTypeNames, buildIdeaPrompt, normalizeIdea } = XReplyCopilotIdeaEngine;
const styleNames = { insightful: '补充观点', practical: '实操建议', question: '提问式', concise: '极简回应', professional: '专业分析', friendly: '友好支持', contrarian: '温和反驳', witty: '轻松幽默' };
const DEEPSEEK_API = 'https://api.deepseek.com';
const $ = (selector) => document.querySelector(selector);

let currentIdeaType = 'all';
let ideasInitialized = false;

$('#ideaLanguageSelect').value = 'zh';

for (const button of document.querySelectorAll('[data-tab]')) {
  button.addEventListener('click', () => {
    const tab = button.dataset.tab;
    for (const item of document.querySelectorAll('[data-tab]')) item.classList.toggle('active', item === button);
    for (const panel of document.querySelectorAll('[data-tab-panel]')) panel.classList.toggle('hidden', panel.dataset.tabPanel !== tab);
    if (tab === 'ideas' && !ideasInitialized) {
      ideasInitialized = true;
      generateIdeas();
    }
  });
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
for (const button of document.querySelectorAll('[data-idea-type]')) {
  button.addEventListener('click', () => {
    currentIdeaType = button.dataset.ideaType;
    for (const item of document.querySelectorAll('[data-idea-type]')) item.classList.toggle('active', item === button);
    generateIdeas();
  });
}
$('#clearPostButton').addEventListener('click', () => {
  $('#postInput').value = '';
  $('#postInput').focus();
});
$('#pastePostButton').addEventListener('click', pastePost);
$('#testConnectionButton').addEventListener('click', testConnection);
if (localStorage.getItem('deepseekApiKey')) testConnection();

async function pastePost() {
  try {
    if (!window.isSecureContext || !navigator.clipboard?.readText) {
      throw new Error('当前 HTTP 页面不允许读取粘贴板，请在输入框中使用 iPhone 系统“粘贴”。');
    }
    const text = await navigator.clipboard.readText();
    $('#postInput').value = text;
    showError('');
  } catch (error) {
    showError(error.message || '读取粘贴板失败，请在输入框中使用 iPhone 系统“粘贴”。');
    $('#postInput').focus();
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
    const settings = getSettings();
    const result = await requestModel(settings, {
      accountProfile: $('#profileInput').value.trim() || '未提供账号定位，请保持克制、具体、非营销化。',
      targetLanguage: languageNames[language],
      preferredStyle: styleNames[style],
      post
    }, `你是 X 评论草稿助手，只生成草稿，绝不决定发布。\n硬性规则：不虚构事实、数据、客户或个人经历；不把无关帖子变成广告；不对医疗、法律、投资、政治事件给出确定性判断；没有足够上下文时建议不回复；默认不放链接；评论必须直接回应原帖。\n请使用${languageNames[language]}生成所有面向用户的字段和草稿。回复风格为“${styleNames[style]}”。当目标语言不是中文时，额外返回与 drafts 逐条对应的中文译文；中文时 translations 返回空数组。\n请输出 JSON：{"shouldReply":boolean,"reason":string,"risk":string,"angle":string,"drafts":string[],"translations":string[]}`);
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

async function generateIdeas() {
  const button = $('#ideasRefreshButton');
  const language = $('#ideaLanguageSelect').value || 'zh';
  const type = ideaTypeNames[currentIdeaType];
  setLoading(button, true, '生成中…');
  setIdeaLoading(true);
  showError('');
  showToast('正在想一条…', 'loading');
  try {
    const settings = getSettings();
    const profile = $('#contentProfileInput').value.trim() || '未提供账号定位，请保持自然、具体，不做营销化表达。';
    const result = await requestModel(settings, {
      type,
      language: languageNames[language],
      profile
    }, buildIdeaPrompt(type, languageNames[language], profile));
    const hasTranslation = renderIdeas(result, language);
    showToast(hasTranslation ? '内容生成成功' : '内容生成成功，中文翻译暂未返回', hasTranslation ? 'success' : 'loading');
  } catch (error) {
    showError(error.message);
    showToast('内容生成失败，请查看下方错误信息', 'error');
  } finally {
    setIdeaLoading(false);
    setLoading(button, false, '换一个');
  }
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
  const normalized = { shouldReply: Boolean(result.shouldReply), reason: String(result.reason || '未提供判断理由。'), risk: String(result.risk || '请人工复核语境。'), angle: String(result.angle || '未提供建议角度。'), drafts: Array.isArray(result.drafts) ? result.drafts.filter(Boolean).slice(0, 3) : [], translations: Array.isArray(result.translations) ? result.translations : [] };
  $('#replyResult').classList.remove('hidden');
  $('#analysisCard').replaceChildren(line('建议', normalized.shouldReply ? '可以考虑回复' : '不建议回复'), line('理由', normalized.reason), line('角度', normalized.angle), line('风险提示', normalized.risk), line('生成', '以上建议仅供参考，不影响下方评论草稿正常生成。'));
  const list = $('#draftList'); list.replaceChildren();
  normalized.drafts.forEach((draft, index) => {
    const card = document.createElement('article');
    card.className = 'draft-item reply-draft';
    card.dataset.draftIndex = String(index + 1);
    const label = document.createElement('div');
    label.className = 'draft-label';
    label.textContent = `评论 ${index + 1}`;
    card.append(label, document.createTextNode(draft));
    if (normalized.translations[index]) card.append(line('中文译文', normalized.translations[index]));
    card.append(copyButton(`复制草稿 ${index + 1}`, draft)); list.append(card);
  });
  if (!normalized.drafts.length) list.append(line('结果', '没有生成可用草稿，建议人工处理。'));
}

function renderIdeas(result, language) {
  const normalized = normalizeIdea(result, ideaTypeNames[currentIdeaType]);
  if (!normalized.content) throw new Error('模型没有返回可用内容。');
  const card = $('#ideaCard');
  card.replaceChildren();
  const type = document.createElement('div');
  type.className = 'idea-card-type';
  type.textContent = normalized.type;
  const contentElement = document.createElement('div');
  contentElement.className = 'idea-content';
  contentElement.textContent = normalized.content;
  card.append(type, contentElement);
  let hasTranslation = language === 'zh';
  if (language !== 'zh') {
    hasTranslation = Boolean(normalized.translation);
    if (normalized.translation) {
      card.append(line('中文翻译', normalized.translation), copyButton('复制中文翻译', normalized.translation));
    } else {
      const warning = document.createElement('div');
      warning.className = 'translation-warning';
      warning.textContent = '中文翻译暂未返回，可点击“换一个”重试。';
      card.append(warning);
    }
  }
  card.append(copyButton('复制原文', normalized.content));
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
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // HTTP 页面或 iOS 权限策略可能拒绝 Clipboard API，继续使用兼容回退。
    }
  }

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
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } finally {
    document.body.removeChild(textarea);
  }
  return copied;
}
function setLoading(button, loading, text) { button.disabled = loading; button.textContent = text; }
function showError(message) { const element = $('#errorMessage'); element.textContent = message; element.classList.toggle('hidden', !message); }
