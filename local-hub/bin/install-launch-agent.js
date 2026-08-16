const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const repositoryDirectory = path.resolve(__dirname, '..', '..');
const label = 'com.x-assistant.content-hub';
const launchAgentsDirectory = path.join(os.homedir(), 'Library', 'LaunchAgents');
const plistPath = path.join(launchAgentsDirectory, `${label}.plist`);
const logsDirectory = path.join(os.homedir(), 'Library', 'Logs', 'X Assistant');
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key><array><string>${process.execPath}</string><string>${path.join(repositoryDirectory, 'local-hub', 'src', 'main.js')}</string></array>
  <key>WorkingDirectory</key><string>${repositoryDirectory}</string>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>${path.join(logsDirectory, 'content-hub.log')}</string>
  <key>StandardErrorPath</key><string>${path.join(logsDirectory, 'content-hub.error.log')}</string>
</dict></plist>`;

fs.mkdirSync(launchAgentsDirectory, { recursive: true });
fs.mkdirSync(logsDirectory, { recursive: true });
fs.writeFileSync(plistPath, xml, { mode: 0o644 });
const domain = `gui/${process.getuid()}`;
try { execFileSync('launchctl', ['bootout', domain, plistPath], { stdio: 'ignore' }); } catch {}
execFileSync('launchctl', ['bootstrap', domain, plistPath]);
console.log(`已安装并启动 ${label}`);
