const MARKET_TIMEZONE = 'America/New_York';
const DISPLAY_TIMEZONE = 'Asia/Shanghai';
const FED_SOURCE_URL = 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm';
const CBOE_SOURCE_URL = 'https://cdn.cboe.com/resources/options/Cboe2026OPTIONSCalendar.pdf';
const ELECTION_SOURCE_URL = 'https://www.usa.gov/election-day';

const FOMC_MEETINGS = {
  2026: [['2026-01-27', '2026-01-28'], ['2026-03-17', '2026-03-18'], ['2026-04-28', '2026-04-29'], ['2026-06-16', '2026-06-17'], ['2026-07-28', '2026-07-29'], ['2026-09-15', '2026-09-16'], ['2026-10-27', '2026-10-28'], ['2026-12-08', '2026-12-09']],
  2027: [['2027-01-26', '2027-01-27'], ['2027-03-16', '2027-03-17'], ['2027-04-27', '2027-04-28'], ['2027-06-08', '2027-06-09'], ['2027-07-27', '2027-07-28'], ['2027-09-14', '2027-09-15'], ['2027-10-26', '2027-10-27'], ['2027-12-07', '2027-12-08']]
};

const EVENT_DEFINITIONS = {
  'monetary-policy': { impactLevel: 'high', impact: '利率路径、美元和成长股估值可能出现明显波动。' },
  inflation: { impactLevel: 'high', impact: '通胀预期和利率预期可能重新定价，指数波动可能放大。' },
  employment: { impactLevel: 'high', impact: '就业和降息预期可能变化，利率敏感板块容易波动。' },
  growth: { impactLevel: 'high', impact: '经济增长预期可能调整，周期股与指数风险偏好可能变化。' },
  derivatives: { impactLevel: 'high', impact: '期权集中到期可能放大成交量、对冲调仓和日内波动。' },
  election: { impactLevel: 'high', impact: '政策、监管和财政预期可能变化，板块分化与波动可能上升。' }
};

function dateKeyFromParts(parts) {
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function timeParts(date, timeZone = MARKET_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
}


function dateKeyInZone(date, timeZone = MARKET_TIMEZONE) {
  const parts = timeParts(date, timeZone);
  return dateKeyFromParts(parts);
}

function addDays(dateKey, amount) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function dayOfWeek(dateKey) {
  return new Date(`${dateKey}T00:00:00Z`).getUTCDay();
}

function marketWeekStart(dateKey) {
  return addDays(dateKey, -((dayOfWeek(dateKey) + 6) % 7));
}

function parseDateParts(dateKey, time = '00:00') {
  const match = String(dateKey).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = String(time).match(/^(\d{2}):([0-5]\d)$/);
  if (!match || !timeMatch) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]), hour: Number(timeMatch[1]), minute: Number(timeMatch[2]) };
}

function zonedDateTimeToInstant(dateKey, time, timeZone = MARKET_TIMEZONE) {
  const parts = parseDateParts(dateKey, time);
  if (!parts) return null;
  const utcGuess = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  const zoneParts = timeParts(new Date(utcGuess), timeZone);
  const zoneAsUtc = Date.UTC(Number(zoneParts.year), Number(zoneParts.month) - 1, Number(zoneParts.day), Number(zoneParts.hour), Number(zoneParts.minute));
  return new Date(utcGuess - (zoneAsUtc - utcGuess));
}

function displayFields(marketDate, marketTime) {
  if (!marketTime) return { beijingDate: marketDate, beijingTime: null };
  const instant = zonedDateTimeToInstant(marketDate, marketTime);
  if (!instant) return { beijingDate: marketDate, beijingTime: null };
  const parts = timeParts(instant, DISPLAY_TIMEZONE);
  return { beijingDate: dateKeyFromParts(parts), beijingTime: `${parts.hour}:${parts.minute}` };
}

function thirdFriday(year, month) {
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  const offset = (5 - dayOfWeek(first) + 7) % 7;
  return addDays(first, offset + 14);
}

function nthWeekday(year, month, weekday, occurrence) {
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  return addDays(first, (weekday - dayOfWeek(first) + 7) % 7 + (occurrence - 1) * 7);
}

function lastWeekday(year, month, weekday) {
  const nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  return addDays(nextMonth, -((dayOfWeek(nextMonth) - weekday + 7) % 7 || 7));
}

function observedFixedHoliday(year, month, day) {
  const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const weekday = dayOfWeek(date);
  return weekday === 6 ? addDays(date, -1) : weekday === 0 ? addDays(date, 1) : date;
}

function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function isMarketHoliday(dateKey) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  const year = date.getUTCFullYear();
  const fixed = [observedFixedHoliday(year, 1, 1), observedFixedHoliday(year, 6, 19), observedFixedHoliday(year, 7, 4), observedFixedHoliday(year, 12, 25)];
  const movable = [
    nthWeekday(year, 1, 1, 3), nthWeekday(year, 2, 1, 3), lastWeekday(year, 5, 1),
    nthWeekday(year, 9, 1, 1), nthWeekday(year, 11, 4, 4), addDays(easterSunday(year), -2)
  ];
  return [...fixed, ...movable].includes(dateKey);
}

function generalElectionDate(year) {
  if (year % 4 !== 2) return null;
  const firstMonday = nthWeekday(year, 11, 1, 1);
  return addDays(firstMonday, 1);
}

function localEvent({ id, category, title, marketDate, endDate = null, marketTime = null, source, sourceUrl }) {
  const definition = EVENT_DEFINITIONS[category];
  return {
    id, category, title, marketDate, endDate, marketTime,
    impactLevel: definition.impactLevel, impact: definition.impact,
    sourceType: 'local', source, sourceUrl, timezone: MARKET_TIMEZONE
  };
}

function buildLocalMarketEvents(from, to) {
  const events = [];
  const fromYear = Number(from.slice(0, 4));
  const toYear = Number(to.slice(0, 4));
  for (let year = fromYear; year <= toYear; year += 1) {
    for (const [start, end] of FOMC_MEETINGS[year] || []) {
      if (start <= to && end >= from) events.push(localEvent({ id: `fomc:${start}`, category: 'monetary-policy', title: '美联储 FOMC 会议', marketDate: start, endDate: end, source: 'Federal Reserve', sourceUrl: FED_SOURCE_URL }));
    }
    for (const month of [3, 6, 9, 12]) {
      const baseDate = thirdFriday(year, month);
      const marketDate = isMarketHoliday(baseDate) ? addDays(baseDate, -1) : baseDate;
      if (marketDate >= from && marketDate <= to) events.push(localEvent({ id: `witching:${marketDate}`, category: 'derivatives', title: '三巫日（季度期权集中到期）', marketDate, source: 'Cboe', sourceUrl: year === 2026 ? CBOE_SOURCE_URL : 'https://www.cboe.com/tradable-products/etp-options/weekly-options' }));
    }
    const electionDate = generalElectionDate(year);
    if (electionDate && electionDate >= from && electionDate <= to) events.push(localEvent({ id: `election:${electionDate}`, category: 'election', title: '美国大选日', marketDate: electionDate, source: 'USA.gov', sourceUrl: ELECTION_SOURCE_URL }));
  }
  return events;
}

function eventKey(event) {
  return `${event.category}:${event.marketDate}`;
}

function normalizeOfficialEvents(rows, from, to) {
  return (Array.isArray(rows) ? rows : []).flatMap((row, index) => {
    if (!EVENT_DEFINITIONS[row?.category] || !row?.marketDate || row.marketDate < from || row.marketDate > to) return [];
    const event = localEvent({
      id: row.id || `official:${row.category}:${row.marketDate}:${index}`,
      category: row.category,
      title: row.title,
      marketDate: row.marketDate,
      endDate: row.endDate || null,
      marketTime: row.marketTime || null,
      source: row.source,
      sourceUrl: row.sourceUrl
    });
    return [{ ...event, sourceType: 'official' }];
  });
}

function compareEvents(left, right) {
  return left.marketDate.localeCompare(right.marketDate)
    || (left.marketTime || '99:99').localeCompare(right.marketTime || '99:99')
    || left.title.localeCompare(right.title, 'zh-CN');
}

function publicEvent(event, currentMarketDate, now) {
  const display = displayFields(event.marketDate, event.marketTime);
  const instant = event.marketTime ? zonedDateTimeToInstant(event.marketDate, event.marketTime) : null;
  const status = event.marketDate < currentMarketDate || (event.marketDate === currentMarketDate && instant && instant <= now) ? 'occurred' : 'upcoming';
  return {
    ...event,
    marketWeek: marketWeekStart(event.marketDate),
    status,
    beijingDate: display.beijingDate,
    beijingTime: display.beijingTime,
    displayTimezone: DISPLAY_TIMEZONE,
    updatedAt: now.toISOString()
  };
}


async function getMarketEvents({ now = new Date(), officialCalendarFetcher } = {}) {
  const currentMarketDate = dateKeyInZone(now, MARKET_TIMEZONE);
  const from = marketWeekStart(currentMarketDate);
  const to = addDays(from, 27);
  const localEvents = buildLocalMarketEvents(from, to);
  let externalSource = { status: 'unavailable', label: 'BLS + BEA 官方发布日历' };
  let externalEvents = [];
  if (typeof officialCalendarFetcher === 'function') {
    try {
      const result = await officialCalendarFetcher({ from, to });
      externalEvents = normalizeOfficialEvents(result?.events, from, to);
      externalSource = { ...externalSource, ...(result?.source || {}) };
    } catch (error) {
      externalSource = { ...externalSource, status: 'error', error: error.message };
    }
  }
  const seen = new Set(localEvents.map(eventKey));
  const events = [...localEvents, ...externalEvents.filter((event) => !seen.has(eventKey(event)))].sort(compareEvents).map((event) => publicEvent(event, currentMarketDate, now));
  return {
    window: { from, to, timezone: MARKET_TIMEZONE },
    events,
    sources: { local: { status: 'ok', label: '本地规则 + Federal Reserve', updatedAt: now.toISOString() }, external: externalSource },
    updatedAt: now.toISOString()
  };
}

module.exports = { buildLocalMarketEvents, getMarketEvents, normalizeOfficialEvents };

