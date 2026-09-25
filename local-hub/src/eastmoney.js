const EASTMONEY_QUOTE_URL = 'https://push2.eastmoney.com/api/qt/stock/get';
const EASTMONEY_ETF_QUOTE_URL = 'https://push2.eastmoney.com/api/qt/clist/get';
const ETF_PAGE_SIZE = 100;

function toEastmoneySecid(symbol) {
  const normalized = String(symbol || '').trim();
  if (!/^\d{6}$/.test(normalized)) throw new Error('A 股代码必须是 6 位数字。');
  return `${/^[69]/.test(normalized) ? '1' : '0'}.${normalized}`;
}

function asNumberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function fetchEastmoneyEtfQuote(symbol) {
  const market = symbol.startsWith('5') ? '1' : '0';
  const requestPage = async (page) => {
    const url = new URL(EASTMONEY_ETF_QUOTE_URL);
    Object.entries({
      pn: String(page), pz: String(ETF_PAGE_SIZE), po: '0', np: '1', ut: 'bd1d9ddb04089700cf9c27f6f7426281',
      fltt: '2', invt: '2', fid: 'f12', fs: `m:${market}+t:10`, fields: 'f2,f12,f13,f14,f402,f441'
    }).forEach(([key, value]) => url.searchParams.set(key, value));
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`东方财富 ETF 行情请求失败（${response.status}）。`);
    return response.json();
  };
  const firstPage = await requestPage(1);
  const firstMatch = firstPage.data?.diff?.find((item) => item.f12 === symbol);
  const pageCount = Math.ceil((firstPage.data?.total || 0) / ETF_PAGE_SIZE);
  let match = firstMatch;
  let low = 1;
  let high = pageCount;
  while (!match && low <= high) {
    const pageNumber = Math.floor((low + high) / 2);
    const page = await requestPage(pageNumber);
    const items = page.data?.diff || [];
    match = items.find((item) => item.f12 === symbol);
    if (match || !items.length) break;
    if (symbol < items[0].f12) high = pageNumber - 1;
    else low = pageNumber + 1;
  }
  const currentPrice = asNumberOrNull(match?.f2);
  const iopv = asNumberOrNull(match?.f441);
  return currentPrice && iopv && iopv > 0 ? {
    symbol: String(match.f12), name: String(match.f14 || ''), currentPrice, iopv,
    premiumRate: (currentPrice / iopv) - 1, quotedAt: new Date().toISOString()
  } : null;
}

async function fetchEastmoneyQuote(symbol) {
  const normalized = String(symbol || '').trim();
  if (/^(15|16|5)/.test(normalized)) {
    try {
      const etfQuote = await fetchEastmoneyEtfQuote(normalized);
      if (etfQuote) return etfQuote;
    } catch {
      // ETF IOPV 不可用时仍保留普通行情，避免阻断持仓价格刷新。
    }
  }
  const url = new URL(EASTMONEY_QUOTE_URL);
  url.searchParams.set('secid', toEastmoneySecid(normalized));
  url.searchParams.set('ut', 'bd1d9ddb04089700cf9c27f6f7426281');
  url.searchParams.set('fltt', '2');
  url.searchParams.set('invt', '2');
  url.searchParams.set('fields', 'f43,f57,f58,f169,f170');
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`东方财富行情请求失败（${response.status}）。`);
  const data = (await response.json()).data;
  const currentPrice = Number(data?.f43);
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) throw new Error(`东方财富未返回 ${symbol} 的有效现价。`);
  const change = Number(data.f169);
  const changePercent = Number(data.f170);
  return {
    symbol: String(data.f57 || symbol),
    name: String(data.f58 || ''),
    currentPrice,
    change: Number.isFinite(change) ? change : null,
    changePercent: Number.isFinite(changePercent) ? changePercent : null,
    iopv: null,
    quotedAt: new Date().toISOString()
  };
}

module.exports = { fetchEastmoneyEtfQuote, fetchEastmoneyQuote, toEastmoneySecid };
