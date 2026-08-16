const { spawn } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const viteBin = path.join(root, 'node_modules', '.bin', 'vite');

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
