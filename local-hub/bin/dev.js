const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const viteBin = path.join(root, 'node_modules', '.bin', 'vite');
const DEV_PORTS = [4318, 5173];
const OWNED_COMMAND_PARTS = [
  path.join(root, 'local-hub', 'bin', 'dev.js'),
  path.join(root, 'local-hub', 'src', 'main.js'),
  'local-hub/bin/dev.js',
  'local-hub/src/main.js',
  'packages/shell/vite.config.js'
];

function processCommand(pid) {
  try {
    return execFileSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function isOwnedCommand(command) {
  return OWNED_COMMAND_PARTS.some((part) => command.includes(part));
}

function listeningPids(port) {
  try {
    const output = execFileSync('lsof', ['-tiTCP:' + port, '-sTCP:LISTEN', '-n', '-P'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return [...new Set(output.split(/\s+/).filter(Boolean).map(Number).filter(Number.isInteger))];
  } catch {
    return [];
  }
}

function projectProcessPids() {
  let output = '';
  try {
    output = execFileSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return [];
  }
  return output.split('\n').flatMap((line) => {
    const match = line.trim().match(/^(\d+)\s+(.+)$/);
    if (!match || Number(match[1]) === process.pid || !isOwnedCommand(match[2])) return [];
    return [Number(match[1])];
  });
}

function staleProcessPids() {
  const pids = new Set(projectProcessPids());
  for (const port of DEV_PORTS) {
    for (const pid of listeningPids(port)) {
      if (isOwnedCommand(processCommand(pid))) pids.add(pid);
    }
  }
  return [...pids];
}

function signalProcesses(pids, signal) {
  for (const pid of pids) {
    try {
      process.kill(pid, signal);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function stopExistingServices() {
  const stale = staleProcessPids();
  if (stale.length) {
    process.stderr.write(`正在清理旧开发进程：${stale.join(', ')}\n`);
    signalProcesses(stale, 'SIGTERM');
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && staleProcessPids().length) await delay(100);
    const remaining = staleProcessPids();
    if (remaining.length) signalProcesses(remaining, 'SIGKILL');
  }

  const occupied = DEV_PORTS.flatMap((port) => listeningPids(port).map((pid) => ({ port, pid, command: processCommand(pid) })));
  if (occupied.length) {
    const details = occupied.map(({ port, pid, command }) => `${port}（PID ${pid}${command ? `，${command}` : ''}）`).join('、');
    throw new Error(`开发端口仍被其他进程占用：${details}`);
  }
}

// idea-engine 唯一源在 packages/h5，开发时自动同步到扩展目录（Chrome 扩展不能引用目录外文件）
const ideaEngineSource = path.join(root, 'packages', 'h5', 'idea-engine.js');
const ideaEngineTarget = path.join(root, 'packages', 'chrome-extension', 'idea-engine.js');
const syncIdeaEngine = () => { try { fs.copyFileSync(ideaEngineSource, ideaEngineTarget); } catch {} };
syncIdeaEngine();
try { fs.watch(ideaEngineSource, syncIdeaEngine); } catch {}

let vite;
let hub;
let stopping = false;
function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  vite?.kill('SIGTERM');
  hub?.kill('SIGTERM');
  setTimeout(() => process.exit(exitCode), 300);
}
function handleChildFailure(name, error) {
  process.stderr.write(`${name} 启动失败：${error.message}\n`);
  stop(1);
}
function handleChildExit(name, code, signal) {
  if (stopping) return;
  process.stderr.write(`${name} 已退出（code=${code ?? 'null'}，signal=${signal || 'none'}）。\n`);
  stop(1);
}

async function start() {
  await stopExistingServices();
  vite = spawn(viteBin, ['--config', 'packages/shell/vite.config.js'], { cwd: root, stdio: 'inherit' });
  hub = spawn(process.execPath, ['--watch', 'local-hub/src/main.js'], { cwd: root, stdio: 'inherit' });
  vite.on('error', (error) => handleChildFailure('Vite', error));
  hub.on('error', (error) => handleChildFailure('Content Hub', error));
  vite.on('exit', (code, signal) => handleChildExit('Vite', code, signal));
  hub.on('exit', (code, signal) => handleChildExit('Content Hub', code, signal));
}

process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
start().catch((error) => {
  process.stderr.write(`开发服务启动失败：${error.message}\n`);
  stop(1);
});
process.on('SIGTERM', stop);
