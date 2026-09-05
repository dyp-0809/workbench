const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const DEFAULT_KINDLE_SYNC_CONFIG = Object.freeze({
  sourceDir: '/Users/duanyipeng/Desktop/电子书',
  destDir: '/mnt/us/documents/Books',
  keyFile: '$HOME/.ssh/kindle_koreader',
  kindleHost: '192.168.0.106',
  port: 2222
});
const REMOTE_USER = 'root';
const HOST_PATTERN = /^(?:[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?)$/;

function expandHome(value) {
  const home = process.env.HOME || os.homedir();
  if (value === '$HOME' || value === '~') return home;
  if (value.startsWith('$HOME/')) return path.join(home, value.slice('$HOME/'.length));
  if (value.startsWith('~/')) return path.join(home, value.slice(2));
  return value;
}

function validatePath(value, label, { remote = false } = {}) {
  if (!value || value.includes('\0')) throw new Error(`${label}不能为空。`);
  if (!(remote ? path.posix.isAbsolute(value) : path.isAbsolute(value))) throw new Error(`${label}必须是绝对路径。`);
  return value;
}

function normalizeKindleSyncConfig(input = {}) {
  const sourceDir = expandHome(String(input.sourceDir ?? DEFAULT_KINDLE_SYNC_CONFIG.sourceDir).trim());
  const destDir = String(input.destDir ?? DEFAULT_KINDLE_SYNC_CONFIG.destDir).trim();
  const keyFile = expandHome(String(input.keyFile ?? DEFAULT_KINDLE_SYNC_CONFIG.keyFile).trim());
  const kindleHost = String(input.kindleHost ?? DEFAULT_KINDLE_SYNC_CONFIG.kindleHost).trim();
  const port = Number(input.port ?? DEFAULT_KINDLE_SYNC_CONFIG.port);

  validatePath(sourceDir, '源目录');
  validatePath(destDir, 'Kindle 目标目录', { remote: true });
  validatePath(keyFile, 'SSH 私钥路径');
  if (!HOST_PATTERN.test(kindleHost)) throw new Error('Kindle 地址只能包含字母、数字、点和连字符。');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SSH 端口必须是 1 到 65535 之间的整数。');

  return {
    sourceDir: path.resolve(sourceDir),
    destDir: path.posix.normalize(destDir),
    keyFile: path.resolve(keyFile),
    kindleHost,
    port
  };
}

function collectFiles(sourceDir) {
  const files = [];
  const walk = (directory) => {
    const entries = fs.readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' }));
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.isFile()) files.push(fullPath);
    }
  };
  walk(sourceDir);
  return files;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function sshArgs(config, command) {
  return [
    '-n',
    '-i', config.keyFile,
    '-o', 'IdentitiesOnly=yes',
    '-o', 'BatchMode=yes',
    '-p', String(config.port),
    `${REMOTE_USER}@${config.kindleHost}`,
    command
  ];
}

function scpArgs(config, localPath, remotePath) {
  return [
    '-O',
    '-i', config.keyFile,
    '-o', 'IdentitiesOnly=yes',
    '-o', 'BatchMode=yes',
    '-P', String(config.port),
    localPath,
    `${REMOTE_USER}@${config.kindleHost}:${remotePath}`
  ];
}
function createTemporaryRemotePath(remotePath) {
  return path.posix.join(
    path.posix.dirname(remotePath),
    `.${path.posix.basename(remotePath)}.workbench-${randomUUID()}.part`
  );
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

function commandError(result) {
  const detail = String(result.stderr || result.stdout || '').trim().split('\n').filter(Boolean).at(-1);
  return detail || `命令退出码 ${result.code ?? '未知'}。`;
}

function ensureLocalInputs(config) {
  if (!fs.existsSync(config.sourceDir) || !fs.statSync(config.sourceDir).isDirectory()) throw new Error(`源目录不存在或不是目录：${config.sourceDir}`);
  if (!fs.existsSync(config.keyFile) || !fs.statSync(config.keyFile).isFile()) throw new Error(`SSH 私钥不存在或不是文件：${config.keyFile}`);
}

function createKindleSync(options = {}) {
  const execute = options.runCommand || runCommand;
  return async function runKindleSync(input = {}) {
    const config = normalizeKindleSyncConfig(input);
    ensureLocalInputs(config);
    const files = collectFiles(config.sourceDir);
    const result = { sourceDir: config.sourceDir, destDir: config.destDir, kindleHost: config.kindleHost, port: config.port, total: files.length, skipped: 0, uploaded: 0, failed: [] };

    for (const file of files) {
      const relativePath = path.relative(config.sourceDir, file).split(path.sep).join('/');
      const remotePath = path.posix.join(config.destDir, relativePath);
      const remoteDirectory = path.posix.dirname(remotePath);
      let temporaryPath = '';
      let shouldCleanupTemporaryPath = false;
      try {
        const exists = await execute('ssh', sshArgs(config, `test -e ${shellQuote(remotePath)}`));
        if (exists.code === 0) {
          result.skipped += 1;
          continue;
        }
        const mkdir = await execute('ssh', sshArgs(config, `mkdir -p ${shellQuote(remoteDirectory)}`));
        if (mkdir.code !== 0) {
          result.failed.push({ relativePath, reason: commandError(mkdir) });
          continue;
        }
        temporaryPath = createTemporaryRemotePath(remotePath);
        shouldCleanupTemporaryPath = true;
        const copy = await execute('scp', scpArgs(config, file, temporaryPath));
        if (copy.code !== 0) {
          result.failed.push({ relativePath, reason: commandError(copy) });
          continue;
        }
        const move = await execute('ssh', sshArgs(config, `mv ${shellQuote(temporaryPath)} ${shellQuote(remotePath)}`));
        if (move.code !== 0) {
          result.failed.push({ relativePath, reason: commandError(move) });
          continue;
        }
        shouldCleanupTemporaryPath = false;
        result.uploaded += 1;
      } catch (error) {
        result.failed.push({ relativePath, reason: error.message || '命令执行失败。' });
      } finally {
        if (shouldCleanupTemporaryPath) {
          try {
            await execute('ssh', sshArgs(config, `rm -f ${shellQuote(temporaryPath)}`));
          } catch {
            // 清理失败不覆盖原始同步错误。
          }
        }
      }
    }

    return { ...result, completed: result.failed.length === 0 };
  };
}

const runKindleSync = createKindleSync();

module.exports = { DEFAULT_KINDLE_SYNC_CONFIG, collectFiles, createKindleSync, normalizeKindleSyncConfig, runKindleSync };
