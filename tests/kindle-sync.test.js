const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { createContentHub } = require('../local-hub/src/content-hub.js');
const { createKindleSync } = require('../local-hub/src/kindle-sync.js');

function createFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'x-assistant-kindle-'));
  const sourceDir = path.join(directory, 'books');
  const keyFile = path.join(directory, 'kindle_key');
  fs.mkdirSync(path.join(sourceDir, 'nested'), { recursive: true });
  fs.writeFileSync(path.join(sourceDir, 'existing.epub'), 'existing');
  fs.writeFileSync(path.join(sourceDir, 'nested', 'new book.pdf'), 'new');
  fs.writeFileSync(path.join(sourceDir, 'notes.md'), 'ignored by the UI but synced by the script');
  fs.writeFileSync(keyFile, 'test key');
  return { directory, sourceDir, keyFile };
}

test('Kindle 同步保留目录结构并跳过远端已有文件', async () => {
  const fixture = createFixture();
  const calls = [];
  try {
    const runCommand = async (command, args) => {
      calls.push({ command, args });
      if (command === 'ssh' && args.at(-1).startsWith('test -e')) {
        return { code: args.at(-1).includes('existing.epub') ? 0 : 1, stdout: '', stderr: '' };
      }
      return { code: 0, stdout: '', stderr: '' };
    };
    const sync = createKindleSync({ runCommand });
    const result = await sync({ sourceDir: fixture.sourceDir, destDir: '/mnt/us/documents/Books', keyFile: fixture.keyFile, kindleHost: '192.168.0.106', port: 2222 });

    assert.deepEqual({ total: result.total, skipped: result.skipped, uploaded: result.uploaded, failed: result.failed.length, completed: result.completed }, { total: 3, skipped: 1, uploaded: 2, failed: 0, completed: true });
    const copyCalls = calls.filter(({ command }) => command === 'scp');
    assert.equal(copyCalls.length, 2);
    assert.ok(copyCalls.every(({ args }) => args.at(-1).startsWith('root@192.168.0.106:/mnt/us/documents/Books/') && args.at(-1).includes('.workbench-') && !args.at(-1).endsWith('/')));
    assert.ok(copyCalls.some(({ args }) => args.at(-2) === path.join(fixture.sourceDir, 'nested', 'new book.pdf')));
    const nestedCopyCall = copyCalls.find(({ args }) => args.at(-2) === path.join(fixture.sourceDir, 'nested', 'new book.pdf'));
    assert.ok(nestedCopyCall);
    const nestedTemporaryPath = nestedCopyCall.args.at(-1).slice(nestedCopyCall.args.at(-1).indexOf(':') + 1);
    assert.match(nestedTemporaryPath, /^\/mnt\/us\/documents\/Books\/nested\/\.new book\.pdf\.workbench-[0-9a-f-]+\.part$/);
    assert.ok(calls.some(({ command, args }) => command === 'ssh' && args.at(-1) === `mv '${nestedTemporaryPath}' '/mnt/us/documents/Books/nested/new book.pdf'`));
    assert.ok(calls.some(({ command, args }) => command === 'ssh' && args.at(-1) === "mkdir -p '/mnt/us/documents/Books/nested'"));
  } finally {
    fs.rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test('Kindle 同步上传失败时清理远端临时文件', async () => {
  const fixture = createFixture();
  const calls = [];
  try {
    const runCommand = async (command, args) => {
      calls.push({ command, args });
      if (command === 'ssh' && args.at(-1).startsWith('test -e')) return { code: 1, stdout: '', stderr: '' };
      if (command === 'scp') return { code: 1, stdout: '', stderr: 'scp 传输失败' };
      return { code: 0, stdout: '', stderr: '' };
    };
    const sync = createKindleSync({ runCommand });
    const result = await sync({ sourceDir: fixture.sourceDir, destDir: '/mnt/us/documents/Books', keyFile: fixture.keyFile, kindleHost: '192.168.0.106', port: 2222 });

    assert.deepEqual({ total: result.total, skipped: result.skipped, uploaded: result.uploaded, failed: result.failed.length, completed: result.completed }, { total: 3, skipped: 0, uploaded: 0, failed: 3, completed: false });
    const copyCalls = calls.filter(({ command }) => command === 'scp');
    assert.equal(copyCalls.length, 3);
    for (const { args } of copyCalls) {
      const temporaryPath = args.at(-1).slice(args.at(-1).indexOf(':') + 1);
      assert.ok(calls.some(({ command, args: commandArgs }) => command === 'ssh' && commandArgs.at(-1) === `rm -f '${temporaryPath}'`));
    }
    assert.equal(calls.filter(({ command, args }) => command === 'ssh' && args.at(-1).startsWith('mv ')).length, 0);
  } finally {
    fs.rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test('Kindle 同步拒绝不安全的设备地址', async () => {
  const fixture = createFixture();
  try {
    const sync = createKindleSync({ runCommand: async () => ({ code: 0, stdout: '', stderr: '' }) });
    await assert.rejects(() => sync({ sourceDir: fixture.sourceDir, destDir: '/mnt/us/documents/Books', keyFile: fixture.keyFile, kindleHost: '192.168.0.106;touch', port: 2222 }), /Kindle 地址/);
  } finally {
    fs.rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test('Kindle 同步接口接收弹窗确认后的参数', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'x-assistant-kindle-hub-'));
  const received = [];
  const hub = createContentHub({
    dataDirectory: directory,
    kindleSync: async (input) => {
      received.push(input);
      return { total: 1, skipped: 1, uploaded: 0, failed: [], completed: true };
    }
  });
  const address = await hub.listen(0);
  try {
    const input = { sourceDir: '/tmp/books', destDir: '/mnt/us/documents/Books', keyFile: '$HOME/.ssh/kindle_koreader', kindleHost: '192.168.0.106', port: '2222' };
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/kindle/sync`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { total: 1, skipped: 1, uploaded: 0, failed: [], completed: true });
    assert.deepEqual(received, [input]);
  } finally {
    await hub.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
