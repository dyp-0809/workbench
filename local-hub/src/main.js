const path = require('node:path');
const { createContentHub } = require('./content-hub.js');
const { generateDailyCandidates } = require('./daily-generator.js');
const { extractSemanticProfile } = require('./semantic-profile.js');
const { discoverModels, getSafeModelSettings, writeModelSettings } = require('./model-settings.js');
const { getSafeBarkSettings, pushBarkNotification, writeBarkSettings } = require('./bark.js');
const { fetchConfiguredFinnhubQuote, fetchConfiguredFinnhubValuation, getSafeFinnhubSettings, testFinnhubConnection, writeFinnhubSettings } = require('./finnhub.js');

const port = Number(process.env.X_ASSISTANT_PORT || 4318);
const hub = createContentHub({
  staticDirectory: path.join(__dirname, '..', '..', 'packages', 'shell', 'dist'),
  generator: generateDailyCandidates,
  semanticExtractor: extractSemanticProfile,
  modelSettings: { discover: discoverModels, get: getSafeModelSettings, set: writeModelSettings },
  barkSettings: { get: getSafeBarkSettings, set: writeBarkSettings },
  barkPusher: pushBarkNotification,
  finnhubSettings: { get: getSafeFinnhubSettings, set: writeFinnhubSettings, test: testFinnhubConnection },
  quoteFetcher: fetchConfiguredFinnhubQuote,
  valuationFetcher: fetchConfiguredFinnhubValuation
});

async function runScheduledWork() {
  hub.runMaintenance();
  const result = await hub.runDueSchedules(generateDailyCandidates);
  if (result.created.length) process.stderr.write(`已生成 ${result.created.length} 个定时内容包\n`);
  const reminders = await hub.runExpiringReminders();
  if (reminders.pushed) process.stderr.write(`已推送 ${reminders.pushed} 条到期提醒\n`);
}

async function start() {
  const address = await hub.listen(port);
  process.stderr.write(`X Assistant Content Hub 正在 http://127.0.0.1:${address.port} 运行\n`);
  try {
    await runScheduledWork();
  } catch (error) {
    process.stderr.write(`定时任务检查失败：${error.message}\n`);
  }
  const timer = setInterval(() => {
    runScheduledWork().catch((error) => process.stderr.write(`定时任务检查失败：${error.message}\n`));
  }, 60_000);
  const stop = async () => { clearInterval(timer); await hub.close(); process.exit(0); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

start().catch((error) => { process.stderr.write(`Content Hub 启动失败：${error.stack || error.message}\n`); process.exit(1); });
