const CREDENTIAL_NAME = 'finnhub-settings';
const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';

function requireCredentialStore(credentialStore) {
  if (!credentialStore || typeof credentialStore.get !== 'function' || typeof credentialStore.set !== 'function') {
    throw new Error('SQLite 凭证存储不可用。');
  }
  return credentialStore;
}

function normalizeSymbol(value) {
  return String(value || '').trim().toUpperCase();
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function readFinnhubSettings(credentialStore) {
  try {
    const value = credentialStore?.get(CREDENTIAL_NAME);
    if (!value) return null;
    const settings = JSON.parse(value);
    const apiKey = String(settings.apiKey || '').trim();
    return apiKey ? { apiKey } : null;
  } catch {
    return null;
  }
}

async function writeFinnhubSettings(input, credentialStore) {
  const existing = await readFinnhubSettings(credentialStore);
  const apiKey = String(input.apiKey || '').trim() || existing?.apiKey || '';
  if (!apiKey) throw new Error('Finnhub API Key 不能为空。');
  requireCredentialStore(credentialStore).set(CREDENTIAL_NAME, JSON.stringify({ apiKey }));
  return { configured: true, provider: 'Finnhub' };
}

async function getSafeFinnhubSettings(credentialStore) {
  const settings = await readFinnhubSettings(credentialStore);
  return { configured: Boolean(settings?.apiKey), provider: 'Finnhub', apiKey: settings?.apiKey || '' };
}

async function fetchFinnhubQuote(symbol, settings) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const apiKey = String(settings?.apiKey || '').trim();
  if (!normalizedSymbol) throw new Error('股票代码不能为空。');
  if (!apiKey) throw new Error('请先在设置中配置 Finnhub API Key。');

  const url = new URL(`${FINNHUB_BASE_URL}/quote`);
  url.searchParams.set('symbol', normalizedSymbol);
  url.searchParams.set('token', apiKey);
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`Finnhub 行情请求失败（${response.status}）。`);
  const payload = await response.json();
  const currentPrice = numberOrNull(payload.c);
  if (currentPrice === null || currentPrice <= 0) throw new Error(`Finnhub 未返回 ${normalizedSymbol} 的有效现价。`);
  const quoteTime = numberOrNull(payload.t);
  return {
    symbol: normalizedSymbol,
    currentPrice,
    change: numberOrNull(payload.d),
    changePercent: numberOrNull(payload.dp),
    high: numberOrNull(payload.h),
    low: numberOrNull(payload.l),
    open: numberOrNull(payload.o),
    previousClose: numberOrNull(payload.pc),
    quotedAt: quoteTime ? new Date(quoteTime * 1000).toISOString() : null
  };
}

async function fetchFinnhubValuation(symbol, settings) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const apiKey = String(settings?.apiKey || '').trim();
  if (!normalizedSymbol) throw new Error('股票代码不能为空。');
  if (!apiKey) throw new Error('请先在设置中配置 Finnhub API Key。');

  const url = new URL(`${FINNHUB_BASE_URL}/stock/metric`);
  url.searchParams.set('symbol', normalizedSymbol);
  url.searchParams.set('metric', 'all');
  url.searchParams.set('token', apiKey);
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`Finnhub 基础财务指标请求失败（${response.status}）。`);
  const payload = await response.json();
  const metric = payload && typeof payload.metric === 'object' ? payload.metric : {};
  const firstPositiveNumber = (...values) => values.map(numberOrNull).find((value) => value !== null && value > 0) ?? null;
  return {
    symbol: normalizedSymbol,
    trailingPE: firstPositiveNumber(metric.peTTM, metric.peNormalizedTTM, metric.peExclExtraTTM, metric.peBasicExclExtraTTM, metric.priceToEarnings),
    forwardPE: firstPositiveNumber(metric.forwardPE, metric.forwardPe, metric.peForward, metric.peForwardAnnual, metric.peForwardTTM),
    metricKeys: Object.keys(metric)
  };
}


async function testFinnhubConnection(input, credentialStore) {
  const existing = await readFinnhubSettings(credentialStore);
  const apiKey = String(input.apiKey || '').trim() || existing?.apiKey || '';
  const quote = await fetchFinnhubQuote('AAPL', { apiKey });
  return { connected: true, quote };
}

async function fetchConfiguredFinnhubQuote(symbol, credentialStore) {
  return fetchFinnhubQuote(symbol, await readFinnhubSettings(credentialStore));
}

async function fetchConfiguredFinnhubValuation(symbol, credentialStore) {
  return fetchFinnhubValuation(symbol, await readFinnhubSettings(credentialStore));
}

module.exports = { fetchConfiguredFinnhubQuote, fetchConfiguredFinnhubValuation, getSafeFinnhubSettings, readFinnhubSettings, testFinnhubConnection, writeFinnhubSettings };
