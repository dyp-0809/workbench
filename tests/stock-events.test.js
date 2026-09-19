const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createContentHub } = require('../local-hub/src/content-hub.js');
const { createOfficialMacroCalendarFetcher, fetchOfficialMacroCalendar } = require('../local-hub/src/official-calendar.js');
const { buildLocalMarketEvents } = require('../local-hub/src/stock-events.js');

const NOW = new Date('2026-09-15T12:00:00.000Z');

async function withHub(options, run) {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-stock-events-'));
  const hub = createContentHub({ dataDirectory, now: () => NOW, ...options });
  const address = await hub.listen(0);
  const baseUrl = `http://127.0.0.1:${address.port}/v1`;
  try {
    await run(baseUrl);
  } finally {
    await hub.close();
    fs.rmSync(dataDirectory, { recursive: true, force: true });
  }
}

test('重要事件接口聚合四个美东市场周的本地事件和官方宏观事件', async () => {
  const requests = [];
  const blsCalendar = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'DTSTART;TZID=US-Eastern:20260916T083000',
    'SUMMARY:Consumer Price Index',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'DTSTART;TZID=US-Eastern:20260918T083000',
    'SUMMARY:Employment Situation',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'DTSTART;TZID=US-Eastern:20260917T100000',
    'SUMMARY:Low impact local release',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
  const beaCalendar = JSON.stringify({
    'Gross Domestic Product': { release_dates: ['2026-09-30T12:30:00+00:00'] },
    'Personal Income and Outlays': { release_dates: ['2026-09-30T12:30:00+00:00'] }
  });
  const officialCalendarFetcher = createOfficialMacroCalendarFetcher({
    fetchImpl: async (url) => {
      requests.push(url);
      return url.includes('bls.gov') ? { ok: true, text: async () => blsCalendar } : { ok: true, text: async () => beaCalendar };
    }
  });
  await withHub({ officialCalendarFetcher }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/stock-events`);
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(requests, [
      'https://www.bls.gov/schedule/news_release/bls.ics',
      'https://apps.bea.gov/API/signup/release_dates.json'
    ]);
    assert.deepEqual(payload.window, { from: '2026-09-14', to: '2026-10-11', timezone: 'America/New_York' });
    assert.equal(payload.events.some((event) => event.title === '美国 CPI 通胀数据' && event.sourceType === 'official'), true);
    assert.equal(payload.events.some((event) => event.title === '美国非农就业数据' && event.sourceType === 'official'), true);
    assert.equal(payload.events.some((event) => event.title === '美国 GDP 数据' && event.sourceType === 'official'), true);
    assert.equal(payload.events.some((event) => event.title === '美国 PCE 通胀数据' && event.sourceType === 'official'), true);
    assert.equal(payload.events.some((event) => event.title === 'Low impact local release'), false);
    assert.equal(payload.events.some((event) => event.category === 'monetary-policy' && event.marketDate === '2026-09-15'), true);
    assert.equal(payload.events.some((event) => event.category === 'derivatives' && event.marketDate === '2026-09-18'), true);
    assert.equal(payload.sources.external.status, 'ok');
    assert.deepEqual(payload.sources.external.sources, {
      bls: { status: 'ok', label: 'BLS', sourceUrl: 'https://www.bls.gov/schedule/news_release/bls.ics' },
      bea: { status: 'ok', label: 'BEA', sourceUrl: 'https://apps.bea.gov/API/signup/release_dates.json' }
    });
  });
});

test('官方宏观日历部分失败时保留成功来源和本地事件', async () => {
  await withHub({
    officialCalendarFetcher: async () => ({
      events: [{ id: 'bea:growth:2026-09-30:0', category: 'growth', title: '美国 GDP 数据', marketDate: '2026-09-30', marketTime: '08:30', source: 'BEA', sourceUrl: 'https://apps.bea.gov/API/signup/release_dates.json' }],
      source: {
        status: 'partial',
        label: 'BLS + BEA 官方发布日历',
        error: 'BLS：BLS 发布日历请求失败（503）。',
        sources: {
          bls: { status: 'error', label: 'BLS', sourceUrl: 'https://www.bls.gov/schedule/news_release/bls.ics', error: 'BLS 发布日历请求失败（503）。' },
          bea: { status: 'ok', label: 'BEA', sourceUrl: 'https://apps.bea.gov/API/signup/release_dates.json' }
        }
      }
    })
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/stock-events`);
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.events.some((event) => event.title === '美国 GDP 数据'), true);
    assert.equal(payload.events.some((event) => event.category === 'monetary-policy'), true);
    assert.equal(payload.sources.external.status, 'partial');
    assert.equal(payload.sources.external.error, 'BLS：BLS 发布日历请求失败（503）。');
  });
});

test('官方宏观日历按日期窗口缓存请求结果', async () => {
  const requests = [];
  const fetcher = createOfficialMacroCalendarFetcher({
    fetchImpl: async (url) => {
      requests.push(url);
      return url.includes('bls.gov')
        ? { ok: true, text: async () => 'BEGIN:VCALENDAR\\r\\nEND:VCALENDAR' }
        : { ok: true, text: async () => '{}' };
    }
  });
  const range = { from: '2026-09-14', to: '2026-10-11' };
  await fetcher(range);
  await fetcher(range);
  assert.equal(requests.length, 2);
});

test('官方宏观日历请求失败时返回错误来源状态', async () => {
  const result = await fetchOfficialMacroCalendar({ from: '2026-09-14', to: '2026-10-11' }, {
    fetchImpl: async () => ({ ok: false, status: 403, text: async () => '' })
  });
  assert.equal(result.source.status, 'error');
  assert.match(result.source.error, /BLS.*403/);
  assert.match(result.source.error, /BEA.*403/);
});

test('三巫日遇交易所假日时提前到上一个交易日', () => {
  const events = buildLocalMarketEvents('2026-06-15', '2026-06-22');
  assert.equal(events.find((event) => event.category === 'derivatives')?.marketDate, '2026-06-18');
});

