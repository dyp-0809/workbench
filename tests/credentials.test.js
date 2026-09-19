const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { createContentHub } = require('../local-hub/src/content-hub.js');
const { getSafeBarkSettings, writeBarkSettings } = require('../local-hub/src/bark.js');
const { getSafeFinnhubSettings, testFinnhubConnection, writeFinnhubSettings, fetchConfiguredFinnhubQuote, fetchConfiguredFinnhubValuation } = require('../local-hub/src/finnhub.js');
const { getSafeModelSettings, writeModelSettings } = require('../local-hub/src/model-settings.js');

function request(baseUrl, pathname, options) {
  return fetch(`${baseUrl}${pathname}`, { headers: { 'Content-Type': 'application/json' }, ...options }).then(async (response) => ({ response, payload: await response.json() }));
}

function createConfiguredHub(dataDirectory) {
  return createContentHub({
    dataDirectory,
    modelSettings: { get: getSafeModelSettings, set: writeModelSettings },
    barkSettings: { get: getSafeBarkSettings, set: writeBarkSettings },
    finnhubSettings: { get: getSafeFinnhubSettings, set: writeFinnhubSettings, test: testFinnhubConnection },
    quoteFetcher: fetchConfiguredFinnhubQuote,
    valuationFetcher: fetchConfiguredFinnhubValuation
  });
}

test('本地服务的模型、Bark、Finnhub 和 GitHub 凭证持久化到 SQLite', async () => {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'x-assistant-credentials-'));
  let hub = createConfiguredHub(dataDirectory);
  let address = await hub.listen(0);
  const baseUrl = `http://127.0.0.1:${address.port}/v1`;
  try {
    assert.equal((await request(baseUrl, '/model-settings', { method: 'PUT', body: JSON.stringify({ provider: 'deepseek', endpoint: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-chat', apiKey: 'model-secret' }) })).response.status, 200);
    assert.equal((await request(baseUrl, '/bark-settings', { method: 'PUT', body: JSON.stringify({ deviceKey: 'bark-secret', serverUrl: 'https://bark.example.test' }) })).response.status, 200);
    assert.equal((await request(baseUrl, '/finnhub-settings', { method: 'PUT', body: JSON.stringify({ apiKey: 'finnhub-secret' }) })).response.status, 200);
    assert.deepEqual((await request(baseUrl, '/github-stars-settings', { method: 'PUT', body: JSON.stringify({ token: 'github-secret' }) })).payload, { settings: { configured: true } });
  } finally {
    await hub.close();
  }

  const db = new Database(path.join(dataDirectory, 'workbench.sqlite'), { readonly: true });
  const credentials = db.prepare('SELECT name, value FROM credentials ORDER BY name').all();
  db.close();
  assert.deepEqual(credentials, [
    { name: 'bark-settings', value: JSON.stringify({ deviceKey: 'bark-secret', serverUrl: 'https://bark.example.test' }) },
    { name: 'finnhub-settings', value: JSON.stringify({ apiKey: 'finnhub-secret' }) },
    { name: 'github-stars-token', value: 'github-secret' },
    { name: 'model-settings', value: JSON.stringify({ provider: 'deepseek', endpoint: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-chat', apiKey: 'model-secret' }) }
  ]);

  hub = createConfiguredHub(dataDirectory);
  address = await hub.listen(0);
  try {
    const model = await request(`http://127.0.0.1:${address.port}/v1`, '/model-settings');
    const bark = await request(`http://127.0.0.1:${address.port}/v1`, '/bark-settings');
    const finnhub = await request(`http://127.0.0.1:${address.port}/v1`, '/finnhub-settings');
    const github = await request(`http://127.0.0.1:${address.port}/v1`, '/github-stars-settings');
    assert.equal(model.payload.configured, true);
    assert.deepEqual(bark.payload, { configured: true, deviceKey: 'bark-secret', serverUrl: 'https://bark.example.test' });
    assert.equal(finnhub.payload.configured, true);
    assert.deepEqual(github.payload, { settings: { configured: true } });
  } finally {
    await hub.close();
    fs.rmSync(dataDirectory, { recursive: true, force: true });
  }
});
