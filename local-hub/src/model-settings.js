const CREDENTIAL_NAME = 'model-settings';

function requireCredentialStore(credentialStore) {
  if (!credentialStore || typeof credentialStore.get !== 'function' || typeof credentialStore.set !== 'function') {
    throw new Error('SQLite 凭证存储不可用。');
  }
  return credentialStore;
}

async function readModelSettings(credentialStore) {
  try {
    const value = credentialStore?.get(CREDENTIAL_NAME);
    if (!value) return null;
    const settings = JSON.parse(value);
    return {
      provider: String(settings.provider || 'openai-compatible'),
      endpoint: String(settings.endpoint || 'https://api.openai.com/v1/chat/completions'),
      model: String(settings.model || 'gpt-4o-mini'),
      apiKey: String(settings.apiKey || '')
    };
  } catch {
    return null;
  }
}

function modelsEndpoint(endpoint) {
  const url = new URL(endpoint);
  url.pathname = url.pathname.replace(/\/(?:chat\/)?completions\/?$/, '/models');
  if (!url.pathname.endsWith('/models')) url.pathname = `${url.pathname.replace(/\/$/, '')}/models`;
  url.search = '';
  return url.toString();
}

async function discoverModels(input) {
  const endpoint = String(input.endpoint || '').trim();
  const apiKey = String(input.apiKey || '').trim();
  if (!endpoint || !apiKey) throw new Error('填写服务地址和 API Key 后才能在线获取模型。');
  const response = await fetch(modelsEndpoint(endpoint), {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`无法连接模型服务（${response.status}）。`);
  const payload = await response.json();
  const models = Array.isArray(payload.data) ? payload.data.map((item) => item.id) : [];
  const uniqueModels = [...new Set(models.filter((model) => typeof model === 'string' && model.trim()))].sort();
  if (!uniqueModels.length) throw new Error('模型服务未返回可选模型。');
  return { endpoint: modelsEndpoint(endpoint), models: uniqueModels };
}

async function writeModelSettings(input, credentialStore) {
  const provider = String(input.provider || 'openai-compatible').trim() || 'openai-compatible';
  const endpoint = String(input.endpoint || '').trim();
  const model = String(input.model || '').trim();
  const existing = await readModelSettings(credentialStore);
  const apiKey = String(input.apiKey || '').trim() || existing?.apiKey || '';
  if (!endpoint || !model || !apiKey) throw new Error('服务地址、模型和 API Key 均不能为空。');
  requireCredentialStore(credentialStore).set(CREDENTIAL_NAME, JSON.stringify({ provider, endpoint, model, apiKey }));
  return { provider, endpoint, model, configured: true };
}

async function getSafeModelSettings(credentialStore) {
  const settings = await readModelSettings(credentialStore);
  if (!settings) return { configured: false, provider: 'openai-compatible', endpoint: '', model: '', apiKey: '' };
  return { provider: settings.provider, endpoint: settings.endpoint, model: settings.model, configured: Boolean(settings.apiKey), apiKey: settings.apiKey };
}

module.exports = { discoverModels, getSafeModelSettings, readModelSettings, writeModelSettings };
