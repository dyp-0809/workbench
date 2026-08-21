const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const root = path.resolve(__dirname, '..', '..');
const viteBin = path.join(root, 'node_modules', '.bin', 'vite');

// idea-engine 唯一源在 packages/h5，开发时自动同步到扩展目录（Chrome 扩展不能引用目录外文件）
const ideaEngineSource = path.join(root, 'packages', 'h5', 'idea-engine.js');
const ideaEngineTarget = path.join(root, 'packages', 'chrome-extension', 'idea-engine.js');
const syncIdeaEngine = () => { try { fs.copyFileSync(ideaEngineSource, ideaEngineTarget); } catch {} };
syncIdeaEngine();
try { fs.watch(ideaEngineSource, syncIdeaEngine); } catch {}

const vite = spawn(viteBin, ['--config', 'packages/shell/vite.config.js'], { cwd: root, stdio: 'inherit' });
const hub = spawn(process.execPath, ['--watch', 'local-hub/src/main.js'], { cwd: root, stdio: 'inherit' });

let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  vite.kill('SIGTERM');
  hub.kill('SIGTERM');
  setTimeout(() => process.exit(0), 300);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
