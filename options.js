const fields = {
  provider: document.querySelector('#provider'),
  endpoint: document.querySelector('#endpoint'),
  model: document.querySelector('#model'),
  apiKey: document.querySelector('#apiKey'),
  fetchModels: document.querySelector('#fetchModels'),
  testConnection: document.querySelector('#testConnection'),
  connectionStatus: document.querySelector('#connectionStatus'),
  modelOptions: document.querySelector('#modelOptions')
};

const presets = {
  deepseek: {
    endpoint: 'https://api.deepseek.com',
    model: 'deepseek-chat'
  },
  'openai-compatible': {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini'
  }
};

const defaults = {
  provider: 'openai-compatible',
  endpoint: presets['openai-compatible'].endpoint,
  model: presets['openai-compatible'].model,
  apiKey: '',
  apiKeys: {},
};

let currentSettings;


initialize();

async function initialize() {
  currentSettings = await chrome.storage.local.get(defaults);
  currentSettings.apiKeys ||= {};
  currentSettings.endpoint = normalizeEndpoint(currentSettings.provider, currentSettings.endpoint);
  fields.provider.value = currentSettings.provider;
  fields.endpoint.value = currentSettings.endpoint;
  fields.model.value = currentSettings.model;
  fields.apiKey.value = currentSettings.apiKeys[currentSettings.provider] || currentSettings.apiKey || '';

  fields.provider.addEventListener('change', async () => {
    const previousProvider = currentSettings.provider;
    currentSettings.apiKeys[previousProvider] = fields.apiKey.value.trim();
    currentSettings.provider = fields.provider.value;
    const preset = presets[currentSettings.provider];
    if (!preset) return;

    fields.endpoint.value = preset.endpoint;
    fields.model.value = preset.model;
    fields.apiKey.value = currentSettings.apiKeys[currentSettings.provider] || '';
    clearConnectionStatus();
    if (currentSettings.provider === 'deepseek' && fields.apiKey.value.trim()) {
      await fetchModels();
    }
  });

  fields.apiKey.addEventListener('change', clearConnectionStatus);
  fields.endpoint.addEventListener('change', clearConnectionStatus);
  fields.fetchModels.addEventListener('click', fetchModels);
  fields.testConnection.addEventListener('click', testConnection);

  if (fields.provider.value === 'deepseek' && fields.apiKey.value.trim()) {
    fetchModels();
  }
}

document.querySelector('#save').addEventListener('click', async () => {
  const provider = fields.provider.value;
  const endpoint = normalizeEndpoint(provider, fields.endpoint.value.trim());
  const model = fields.model.value.trim();
  const apiKey = fields.apiKey.value.trim();

  if (!endpoint || !model) {
    showStatus('接口地址和模型名称不能为空。', true);
    return;
  }

  currentSettings.provider = provider;
  currentSettings.endpoint = endpoint;
  currentSettings.model = model;
  currentSettings.apiKey = apiKey;
  currentSettings.apiKeys[provider] = apiKey;
  fields.endpoint.value = endpoint;
  await chrome.storage.local.set(currentSettings);
  showStatus('已保存。');
});
async function fetchModels() {
  const apiKey = fields.apiKey.value.trim();
  if (!apiKey) {
    setConnectionStatus('请先填写 API Key。', 'error');
    return;
  }

  setBusy(fields.fetchModels, true, '获取中…');
  try {
    const response = await fetch(buildModelsEndpoint(), {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(formatApiError(response.status, payload));

    const models = Array.isArray(payload.data)
      ? payload.data.map((item) => item.id).filter(Boolean)
      : [];
    if (!models.length) throw new Error('官方没有返回可用模型。');

    fields.modelOptions.replaceChildren(...models.map((model) => {
      const option = document.createElement('option');
      option.value = model;
      return option;
    }));
    if (!models.includes(fields.model.value)) fields.model.value = models[0];
    setConnectionStatus(`已连接，获取到 ${models.length} 个模型。`, 'success');
  } catch (error) {
    setConnectionStatus(`连接失败：${error.message}`, 'error');
  } finally {
    setBusy(fields.fetchModels, false, '从官方获取模型');
  }
}

async function testConnection() {
  const apiKey = fields.apiKey.value.trim();
  if (!apiKey) {
    setConnectionStatus('请先填写 API Key。', 'error');
    return;
  }

  setBusy(fields.testConnection, true, '测试中…');
  try {
    const response = await fetch(buildModelsEndpoint(), {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(formatApiError(response.status, payload));
    setConnectionStatus('连接正常，可以请求模型。', 'success');
  } catch (error) {
    setConnectionStatus(`连接失败：${error.message}`, 'error');
  } finally {
    setBusy(fields.testConnection, false, '测试连接');
  }
}

function buildModelsEndpoint() {
  const endpoint = normalizeEndpoint(fields.provider.value, fields.endpoint.value.trim());
  if (fields.provider.value === 'deepseek') return `${endpoint}/models`;
  return endpoint.replace(/\/chat\/completions\/?$/, '/models');
}

function normalizeEndpoint(provider, endpoint) {
  if (provider !== 'deepseek') return endpoint;
  return endpoint.replace(/\/chat\/completions\/?$/, '').replace(/\/+$/, '') || presets.deepseek.endpoint;
}

function formatApiError(status, payload) {
  return payload.error?.message || `HTTP ${status}`;
}

function setBusy(button, busy, label) {
  button.disabled = busy;
  button.textContent = label;
}

function setConnectionStatus(message, state) {
  fields.connectionStatus.textContent = message;
  fields.connectionStatus.dataset.state = state;
}

function clearConnectionStatus() {
  fields.connectionStatus.textContent = '尚未测试连接';
  delete fields.connectionStatus.dataset.state;
}

function showStatus(message, isError = false) {
  const status = document.querySelector('#status');
  status.textContent = message;
  status.style.color = isError ? '#8a1c1c' : '#167447';
  setTimeout(() => { status.textContent = ''; }, 2200);
}
