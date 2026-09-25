const BINANCE_PRICE_URL = 'https://data-api.binance.vision/api/v3/ticker/price';

function toBinanceSymbol(symbol) {
  const normalized = String(symbol || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{2,20}$/.test(normalized)) throw new Error('加密货币代码只能包含 2–20 位字母或数字。');
  return `${normalized}USDT`;
}

async function fetchBinanceQuote(symbol) {
  const pair = toBinanceSymbol(symbol);
  const url = new URL(BINANCE_PRICE_URL);
  url.searchParams.set('symbol', pair);
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Binance 行情请求失败（${response.status}）。`);
  const data = await response.json();
  const currentPrice = Number(data?.price);
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) throw new Error(`Binance 未返回 ${pair} 的有效现价。`);
  return { symbol: String(symbol).trim().toUpperCase(), currentPrice, quotedAt: new Date().toISOString() };
}

module.exports = { fetchBinanceQuote, toBinanceSymbol };
