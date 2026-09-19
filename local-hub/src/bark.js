const CREDENTIAL_NAME = 'bark-settings';
const DEFAULT_SERVER = 'https://api.day.app';

function requireCredentialStore(credentialStore) {
  if (!credentialStore || typeof credentialStore.get !== 'function' || typeof credentialStore.set !== 'function') {
    throw new Error('SQLite 凭证存储不可用。');
  }
  return credentialStore;
}

async function readBarkSettings(credentialStore) {
  try {
    const value = credentialStore?.get(CREDENTIAL_NAME);
    if (!value) return null;
    const settings = JSON.parse(value);
    return { deviceKey: String(settings.deviceKey || ''), serverUrl: String(settings.serverUrl || DEFAULT_SERVER).replace(/\/+$/, '') };
  } catch {
    return null;
  }
}

async function writeBarkSettings(input, credentialStore) {
  const deviceKey = String(input.deviceKey || '').trim();
  const serverUrl = String(input.serverUrl || DEFAULT_SERVER).trim().replace(/\/+$/, '') || DEFAULT_SERVER;
  if (!deviceKey) throw new Error('Bark device key 不能为空。');
  requireCredentialStore(credentialStore).set(CREDENTIAL_NAME, JSON.stringify({ deviceKey, serverUrl }));
  return { configured: true, serverUrl };
}

async function getSafeBarkSettings(credentialStore) {
  const settings = await readBarkSettings(credentialStore);
  if (!settings?.deviceKey) return { configured: false, deviceKey: '', serverUrl: settings?.serverUrl || DEFAULT_SERVER };
  return { configured: true, deviceKey: settings.deviceKey, serverUrl: settings.serverUrl };
}

async function pushBark(settings, title, body) {
  const response = await fetch(`${settings.serverUrl}/${settings.deviceKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ title, body, group: 'X Assistant' }),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`Bark 推送失败（${response.status}）。`);
  return true;
}
async function pushBarkNotification(title, body, credentialStore) {
  const settings = await readBarkSettings(credentialStore);
  if (!settings?.deviceKey) throw new Error('Bark 未配置。');
  return pushBark(settings, title, body);
}

module.exports = { DEFAULT_SERVER, getSafeBarkSettings, pushBark, pushBarkNotification, readBarkSettings, writeBarkSettings };

