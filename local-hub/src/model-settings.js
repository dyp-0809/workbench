const keytar = require('keytar');

const SERVICE = 'com.x-assistant.local-hub';
const ACCOUNT = 'model-settings';

async function readModelSettings() {
  try {
    const value = await keytar.getPassword(SERVICE, ACCOUNT);
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


async function writeModelSettings(input) {
  const provider = String(input.provider || 'openai-compatible').trim() || 'openai-compatible';
  const endpoint = String(input.endpoint || '').trim();
  const model = String(input.model || '').trim();
  const existing = await readModelSettings();
  const apiKey = String(input.apiKey || '').trim() || existing?.apiKey || '';
  if (!endpoint || !model || !apiKey) throw new Error('服务地址、模型和 API Key 均不能为空。');
  await keytar.setPassword(SERVICE, ACCOUNT, JSON.stringify({ provider, endpoint, model, apiKey }));
  return { provider, endpoint, model, configured: true };
}

async function getSafeModelSettings() {
  const settings = await readModelSettings();
  if (!settings) return { configured: false, provider: 'openai-compatible', endpoint: '', model: '', apiKey: '' };
  return { configured: Boolean(settings.apiKey), provider: settings.provider, endpoint: settings.endpoint, model: settings.model, apiKey: settings.apiKey };
}

module.exports = { discoverModels, getSafeModelSettings, readModelSettings, writeModelSettings };
