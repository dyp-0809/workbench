const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { createContentHub } = require('../local-hub/src/content-hub.js');

test('扩展必须先用一次性配对码换取令牌，之后才能读取本机数据', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'x-assistant-pairing-'));
  const hub = createContentHub({ dataDirectory: directory });
  const address = await hub.listen(0);
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const origin = 'chrome-extension://testextension';
  try {
    const denied = await fetch(`${baseUrl}/v1/dashboard`, { headers: { Origin: origin } });
    assert.equal(denied.status, 401);

    const pairingCode = await (await fetch(`${baseUrl}/v1/pairing-code`)).json();
    const pairing = await fetch(`${baseUrl}/v1/pairings`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: pairingCode.code })
    });
    const token = (await pairing.json()).token;
    assert.ok(token);

    const dashboard = await fetch(`${baseUrl}/v1/dashboard`, { headers: { Origin: origin, Authorization: `Bearer ${token}` } });
    assert.equal(dashboard.status, 200);
    assert.equal(dashboard.headers.get('access-control-allow-origin'), origin);
  } finally {
    await hub.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('模型发现将联网模型列表仅返回给本机工作台', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'x-assistant-model-discovery-'));
  const hub = createContentHub({
    dataDirectory: directory,
    modelSettings: {
      discover: async (input) => ({ endpoint: `${input.endpoint}/models`, models: ['model-a', 'model-b'] })
    }
  });
  const address = await hub.listen(0);
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/model-settings/discover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: 'https://models.example.test/v1', apiKey: 'secret' })
    });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).models, ['model-a', 'model-b']);
  } finally {
    await hub.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
