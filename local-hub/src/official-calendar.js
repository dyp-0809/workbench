const MARKET_TIMEZONE = 'America/New_York';
const BLS_CALENDAR_URL = 'https://www.bls.gov/schedule/news_release/bls.ics';
const BEA_CALENDAR_URL = 'https://apps.bea.gov/API/signup/release_dates.json';

const BLS_DEFINITIONS = [
  { pattern: /consumer price index/i, category: 'inflation', title: '美国 CPI 通胀数据' },
  { pattern: /producer price index/i, category: 'inflation', title: '美国 PPI 通胀数据' },
  { pattern: /employment situation/i, category: 'employment', title: '美国非农就业数据' },
  { pattern: /job openings and labor turnover survey/i, category: 'employment', title: '美国 JOLTS 职位空缺数据' }
];

const BEA_DEFINITIONS = [
  { pattern: /^gross domestic product$/i, category: 'growth', title: '美国 GDP 数据' },
  { pattern: /^personal income and outlays$/i, category: 'inflation', title: '美国 PCE 通胀数据' },
  { pattern: /^u\.s\. international trade in goods and services$/i, category: 'growth', title: '美国贸易数据' }
];

function decodeIcsText(value) {
  return String(value || '').replace(/\\([\\,;Nn])/g, (_, token) => token.toLowerCase() === 'n' ? '\n' : token);
}

function unfoldIcs(text) {
  return String(text || '').replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
}

function parseIcsStart(line) {
  const match = String(line).match(/^DTSTART(?:;[^:]*)?:(\d{8})(?:T(\d{2})(\d{2})(?:\d{2})?(Z)?)?$/i);
  if (!match) return null;
  const [, date, hour, minute] = match;
  return { marketDate: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`, marketTime: hour && minute ? `${hour}:${minute}` : null };
}

function parseBlsCalendar(text, from, to) {
  const events = [];
  let summary = '';
  let start = null;
  for (const line of unfoldIcs(text)) {
    if (line.startsWith('SUMMARY:')) summary = decodeIcsText(line.slice('SUMMARY:'.length));
    if (line.startsWith('DTSTART')) start = parseIcsStart(line);
    if (line === 'END:VEVENT') {
      const definition = BLS_DEFINITIONS.find((item) => item.pattern.test(summary));
      if (definition && start && start.marketDate >= from && start.marketDate <= to) {
        events.push({ ...definition, ...start, source: 'BLS', sourceUrl: BLS_CALENDAR_URL, sourceType: 'official' });
      }
      summary = '';
      start = null;
    }
  }
  return events;
}

function timeParts(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MARKET_TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  if (!values.year || !values.month || !values.day) return null;
  return { marketDate: `${values.year}-${values.month}-${values.day}`, marketTime: values.hour && values.minute ? `${values.hour}:${values.minute}` : null };
}

function parseBeaCalendar(payload, from, to) {
  const events = [];
  for (const [release, dates] of Object.entries(payload && typeof payload === 'object' ? payload : {})) {
    const definition = BEA_DEFINITIONS.find((item) => item.pattern.test(release));
    if (!definition || !Array.isArray(dates?.release_dates)) continue;
    dates.release_dates.forEach((value, index) => {
      const start = timeParts(value);
      if (!start || start.marketDate < from || start.marketDate > to) return;
      events.push({ ...definition, ...start, source: 'BEA', sourceUrl: BEA_CALENDAR_URL, sourceType: 'official', id: `bea:${definition.category}:${start.marketDate}:${index}` });
    });
  }
  return events;
}

async function fetchText(fetchImpl, url, label) {
  let response;
  try {
    response = await fetchImpl(url, { headers: { Accept: 'text/calendar, application/json' } });
  } catch (error) {
    throw new Error(`${label} 请求失败：${error.message}`);
  }
  if (!response.ok) throw new Error(`${label} 请求失败（${response.status}）。`);
  return response.text();
}

async function fetchOfficialMacroCalendar(range, { fetchImpl = globalThis.fetch } = {}) {
  const from = String(range?.from || '').trim();
  const to = String(range?.to || '').trim();
  const results = await Promise.allSettled([
    fetchText(fetchImpl, BLS_CALENDAR_URL, 'BLS 发布日历'),
    fetchText(fetchImpl, BEA_CALENDAR_URL, 'BEA 发布日历')
  ]);
  const [blsResult, beaResult] = results;
  const sourceResults = {
    bls: blsResult.status === 'fulfilled' ? { status: 'ok', label: 'BLS', sourceUrl: BLS_CALENDAR_URL } : { status: 'error', label: 'BLS', sourceUrl: BLS_CALENDAR_URL, error: blsResult.reason.message },
    bea: beaResult.status === 'fulfilled' ? { status: 'ok', label: 'BEA', sourceUrl: BEA_CALENDAR_URL } : { status: 'error', label: 'BEA', sourceUrl: BEA_CALENDAR_URL, error: beaResult.reason.message }
  };
  const events = [];
  if (blsResult.status === 'fulfilled') events.push(...parseBlsCalendar(blsResult.value, from, to).map((event, index) => ({ ...event, id: `bls:${event.category}:${event.marketDate}:${index}` })));
  if (beaResult.status === 'fulfilled') {
    let payload;
    try {
      payload = JSON.parse(beaResult.value);
      events.push(...parseBeaCalendar(payload, from, to));
    } catch (error) {
      sourceResults.bea = { status: 'error', label: 'BEA', sourceUrl: BEA_CALENDAR_URL, error: `响应格式无效：${error.message}` };
    }
  }
  const sourceList = Object.values(sourceResults);
  const successful = sourceList.filter((source) => source.status === 'ok').length;
  const failed = sourceList.filter((source) => source.status === 'error');
  const status = successful === 0 ? 'error' : successful === sourceList.length ? 'ok' : 'partial';
  return {
    events,
    source: {
      status,
      label: 'BLS + BEA 官方发布日历',
      sources: sourceResults,
      ...(failed.length ? { error: failed.map((source) => `${source.label}：${source.error}`).join('；') } : {})
    }
  };
}

function createOfficialMacroCalendarFetcher({ fetchImpl = globalThis.fetch, cacheTtlMs = 15 * 60 * 1000 } = {}) {
  const cache = new Map();
  return async (range) => {
    const key = `${range?.from || ''}:${range?.to || ''}`;
    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const value = await fetchOfficialMacroCalendar(range, { fetchImpl });
    if (value.source?.status === 'ok') cache.set(key, { value, expiresAt: Date.now() + cacheTtlMs });
    return value;
  };
}

module.exports = { BLS_CALENDAR_URL, BEA_CALENDAR_URL, createOfficialMacroCalendarFetcher, fetchOfficialMacroCalendar, parseBeaCalendar, parseBlsCalendar };
