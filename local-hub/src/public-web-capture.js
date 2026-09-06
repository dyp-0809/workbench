const dns = require('node:dns');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_REDIRECTS = 5;
const DEFAULT_MAX_BYTES = 1024 * 1024;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function hostnameWithoutBrackets(hostname) {
  return String(hostname || '').replace(/^\[|\]$/g, '').toLowerCase();
}

function isUnsafeIpv4(address) {
  const octets = String(address).split('.').map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return true;
  const [first, second, third] = octets;
  return first === 0
    || first === 10
    || first === 127
    || first >= 224
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 0 && (third === 0 || third === 2))
    || (first === 192 && second === 168)
    || (first === 198 && (second === 18 || second === 19))
    || (first === 198 && second === 51 && third === 100)
    || (first === 203 && second === 0 && third === 113);
}

function ipv4Integer(address) {
  return String(address).split('.').map(Number).reduce((value, octet) => (value << 8n) + BigInt(octet), 0n);
}

function parseIpv6(address) {
  let source = hostnameWithoutBrackets(address);
  if (!source) return null;
  if (source.includes('.')) {
    const separator = source.lastIndexOf(':');
    const embeddedIpv4 = source.slice(separator + 1);
    if (net.isIP(embeddedIpv4) !== 4) return null;
    const value = ipv4Integer(embeddedIpv4);
    source = `${source.slice(0, separator)}:${((value >> 16n) & 0xffffn).toString(16)}:${(value & 0xffffn).toString(16)}`;
  }
  const pieces = source.split('::');
  if (pieces.length > 2) return null;
  const head = pieces[0] ? pieces[0].split(':') : [];
  const tail = pieces.length === 2 && pieces[1] ? pieces[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (missing < 0 || (pieces.length === 1 && missing !== 0)) return null;
  const groups = [...head, ...Array(missing).fill('0'), ...tail];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/i.test(group))) return null;
  return groups.reduce((value, group) => (value << 16n) + BigInt(`0x${group}`), 0n);
}

function ipv4FromInteger(value) {
  return [
    Number((value >> 24n) & 0xffn),
    Number((value >> 16n) & 0xffn),
    Number((value >> 8n) & 0xffn),
    Number(value & 0xffn)
  ].join('.');
}

function isUnsafeIpv6(address) {
  const value = parseIpv6(address);
  if (value === null || value === 0n || value === 1n) return true;
  const embeddedIpv4 = value & 0xffffffffn;
  const embeddedIpv4Prefix = value >> 32n;
  if (embeddedIpv4Prefix === 0n || embeddedIpv4Prefix === 0xffffn || embeddedIpv4Prefix === 0xffff0000n) {
    return isUnsafeIpv4(ipv4FromInteger(embeddedIpv4));
  }
  const wellKnownNat64Start = 0x0064ff9b000000000000000000000000n;
  if (value >= wellKnownNat64Start && value < wellKnownNat64Start + (1n << 32n)) return isUnsafeIpv4(ipv4FromInteger(embeddedIpv4));
  const localNat64Start = 0x0064ff9b000100000000000000000000n;
  const localNat64End = localNat64Start + (1n << 80n);
  if (value >= localNat64Start && value < localNat64End) return true;
  if ((value >> 112n) === 0x2002n && isUnsafeIpv4(ipv4FromInteger((value >> 80n) & 0xffffffffn))) return true;

  const ulaStart = 0xfc00n << 112n;
  const ulaEnd = 0xfe00n << 112n;
  const linkLocalStart = 0xfe80n << 112n;
  const linkLocalEnd = 0xfec0n << 112n;
  const siteLocalStart = 0xfec0n << 112n;
  const siteLocalEnd = 0xff00n << 112n;
  const documentationStart = 0x20010db8n << 96n;
  const documentationEnd = documentationStart + (1n << 96n);
  const multicastStart = 0xff00n << 112n;
  return (value >= ulaStart && value < ulaEnd)
    || (value >= linkLocalStart && value < linkLocalEnd)
    || (value >= siteLocalStart && value < siteLocalEnd)
    || (value >= documentationStart && value < documentationEnd)
    || value >= multicastStart;
}

function isUnsafeAddress(address) {
  const normalized = hostnameWithoutBrackets(address);
  const family = net.isIP(normalized);
  return family === 4 ? isUnsafeIpv4(normalized) : family === 6 ? isUnsafeIpv6(normalized) : true;
}

function parsePublicUrl(value) {
  let url;
  try {
    url = value instanceof URL ? new URL(value.toString()) : new URL(String(value || '').trim());
  } catch {
    throw new Error('采集地址必须是有效 URL。');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('采集地址只支持 http 或 https。');
  if (url.username || url.password) throw new Error('采集地址不能包含账号或密码。');
  const hostname = hostnameWithoutBrackets(url.hostname);
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new Error('采集地址必须是受限公开地址。');
  }
  if (net.isIP(hostname) && isUnsafeAddress(hostname)) throw new Error('采集地址不能指向内部网络。');
  return url;
}

function metadataUrl(value, baseUrl) {
  if (!value) return null;
  try {
    return parsePublicUrl(new URL(String(value).trim(), baseUrl)).toString();
  } catch {
    return null;
  }
}

function normalizeResolvedAddresses(addresses) {
  const normalized = (Array.isArray(addresses) ? addresses : [addresses]).map((entry) => {
    const address = typeof entry === 'string' ? entry : entry?.address;
    const family = typeof entry === 'object' && entry ? Number(entry.family) : net.isIP(hostnameWithoutBrackets(address));
    return { address: hostnameWithoutBrackets(address), family };
  }).filter((entry) => entry.address && (entry.family === 4 || entry.family === 6));
  if (!normalized.length) throw new Error('无法解析采集地址。');
  if (normalized.some((entry) => isUnsafeAddress(entry.address))) throw new Error('采集地址不能指向内部网络。');
  return normalized;
}

async function resolvePublicAddresses(url, hostnameResolver) {
  const hostname = hostnameWithoutBrackets(url.hostname);
  if (net.isIP(hostname)) return normalizeResolvedAddresses([{ address: hostname, family: net.isIP(hostname) }]);
  try {
    return normalizeResolvedAddresses(await hostnameResolver(hostname));
  } catch (error) {
    if (error?.message?.includes('内部网络')) throw error;
    throw new Error('无法解析采集地址。');
  }
}

function headerValue(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === 'function') return headers.get(name);
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  const value = key ? headers[key] : null;
  return Array.isArray(value) ? value[0] : value;
}

function decodeHtml(value) {
  return String(value || '').replace(/&(?:#x([0-9a-f]+)|#(\d+)|quot|apos|amp|lt|gt);/gi, (entity, hexadecimal, decimal) => {
    const encoded = hexadecimal ? Number.parseInt(hexadecimal, 16) : decimal ? Number.parseInt(decimal, 10) : null;
    if (encoded !== null) return Number.isInteger(encoded) && encoded <= 0x10ffff ? String.fromCodePoint(encoded) : entity;
    return { '&quot;': '"', '&apos;': "'", '&amp;': '&', '&lt;': '<', '&gt;': '>' }[entity.toLowerCase()] || entity;
  }).replace(/\s+/g, ' ').trim();
}

function attributesFromTag(tag) {
  const attributes = {};
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;
  while ((match = pattern.exec(tag))) {
    const name = match[1].toLowerCase();
    if (name === 'meta' || name === 'link' || name === 'script' || name === 'base') continue;
    attributes[name] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attributes;
}

function tagsFromHtml(html, name) {
  return [...String(html).matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map((match) => attributesFromTag(match[0]));
}

function firstValue(...values) {
  return values.flat().find((value) => typeof value === 'string' && value.trim()) || null;
}

function jsonLdMetadata(html) {
  const items = [];
  for (const match of String(html).matchAll(/<script\b[^>]*type\s*=\s*(?:"application\/ld\+json"|'application\/ld\+json'|application\/ld\+json)[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const queue = [JSON.parse(match[1])];
      while (queue.length) {
        const value = queue.shift();
        if (Array.isArray(value)) {
          queue.push(...value);
          continue;
        }
        if (!value || typeof value !== 'object') continue;
        if (Array.isArray(value['@graph'])) queue.push(...value['@graph']);
        const author = Array.isArray(value.author) ? value.author[0] : value.author;
        const image = Array.isArray(value.image) ? value.image[0] : value.image;
        items.push({
          title: typeof value.headline === 'string' ? value.headline : typeof value.name === 'string' ? value.name : null,
          summary: typeof value.description === 'string' ? value.description : null,
          author: typeof author === 'string' ? author : typeof author?.name === 'string' ? author.name : null,
          imageUrl: typeof image === 'string' ? image : typeof image?.url === 'string' ? image.url : null
        });
      }
    } catch {
      // Malformed JSON-LD is optional page metadata, never a capture failure.
    }
  }
  return {
    title: firstValue(items.map((item) => item.title)),
    summary: firstValue(items.map((item) => item.summary)),
    author: firstValue(items.map((item) => item.author)),
    imageUrl: firstValue(items.map((item) => item.imageUrl))
  };
}

function extractMetadata(html, finalUrl) {
  const meta = new Map();
  for (const attributes of tagsFromHtml(html, 'meta')) {
    const key = String(attributes.property || attributes.name || '').toLowerCase();
    if (key && attributes.content && !meta.has(key)) meta.set(key, attributes.content);
  }
  const canonical = firstValue(tagsFromHtml(html, 'link')
    .filter((attributes) => String(attributes.rel || '').toLowerCase().split(/\s+/).includes('canonical'))
    .map((attributes) => attributes.href));
  const titleTag = String(html).match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, ' ');
  const jsonLd = jsonLdMetadata(html);
  const canonicalUrl = metadataUrl(firstValue(canonical, meta.get('og:url')), finalUrl) || finalUrl;
  return {
    canonicalUrl,
    title: decodeHtml(firstValue(meta.get('og:title'), jsonLd.title, titleTag)),
    summary: decodeHtml(firstValue(meta.get('og:description'), jsonLd.summary, meta.get('description'))),
    author: decodeHtml(firstValue(meta.get('article:author'), meta.get('author'), jsonLd.author)),
    imageUrl: metadataUrl(firstValue(meta.get('og:image'), jsonLd.imageUrl), finalUrl)
  };
}

function defaultWebFetcher(url, { addresses, timeoutMs, maxBytes, signal }) {
  const client = url.protocol === 'https:' ? https : http;
  const address = addresses[0];
  return new Promise((resolve, reject) => {
    let request;
    let settled = false;
    let onAbort = null;
    const complete = (callback, value) => {
      if (settled) return;
      settled = true;
      if (onAbort) signal?.removeEventListener('abort', onAbort);
      callback(value);
    };
    onAbort = () => {
      const error = new Error('网页请求超时。');
      if (request) request.destroy(error);
      complete(reject, error);
    };
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });
    request = client.request(url, {
      method: 'GET',
      agent: false,
      autoSelectFamily: false,
      headers: {
        Accept: 'text/html,application/xhtml+xml;q=0.9',
        'Accept-Encoding': 'identity',
        'User-Agent': 'Personal-Workbench/0.3 public-metadata-capture'
      },
      lookup: (_hostname, options, callback) => {
        if (options?.all) return callback(null, addresses.map((candidate) => ({ address: candidate.address, family: candidate.family })));
        return callback(null, address.address, address.family);
      },
      servername: hostnameWithoutBrackets(url.hostname)
    }, (response) => {
      const declaredLength = Number.parseInt(headerValue(response.headers, 'content-length'), 10);
      if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
        response.resume();
        complete(reject, new Error('网页响应超过大小限制。'));
        return;
      }
      const chunks = [];
      let length = 0;
      response.on('data', (chunk) => {
        length += chunk.length;
        if (length > maxBytes) {
          response.destroy();
          complete(reject, new Error('网页响应超过大小限制。'));
          return;
        }
        chunks.push(chunk);
      });
      response.once('error', (error) => complete(reject, error));
      response.once('end', () => complete(resolve, {
        status: response.statusCode || 0,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8')
      }));
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error('网页请求超时。')));
    request.once('error', (error) => complete(reject, error.message === '网页请求超时。' ? error : new Error(`网页请求失败：${error.code || '连接失败'}。`)));
    request.end();
  });
}

function runWithinCaptureDeadline(work, timeoutMs) {
  const controller = new AbortController();
  let timeout;
  const expired = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new Error('网页请求超时。'));
    }, timeoutMs);
  });
  return Promise.race([work(controller.signal), expired]).finally(() => clearTimeout(timeout));
}

function createPublicWebCapture({ hostnameResolver = (hostname) => dns.promises.lookup(hostname, { all: true, verbatim: true }), webFetcher = defaultWebFetcher, now = () => new Date(), timeoutMs = DEFAULT_TIMEOUT_MS, maxRedirects = DEFAULT_MAX_REDIRECTS, maxBytes = DEFAULT_MAX_BYTES } = {}) {
  return async function capturePublicWebPage(value) {
    return runWithinCaptureDeadline(async (signal) => {
      let currentUrl = parsePublicUrl(value);
      for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
        const addresses = await resolvePublicAddresses(currentUrl, hostnameResolver);
        const response = await webFetcher(currentUrl, { addresses, timeoutMs, maxBytes, signal });
        const status = Number(response?.status);
        if (REDIRECT_STATUSES.has(status)) {
          if (redirects === maxRedirects) throw new Error('网页重定向次数超过限制。');
          const location = headerValue(response.headers, 'location');
          if (!location) throw new Error('网页重定向缺少目标地址。');
          currentUrl = parsePublicUrl(new URL(location, currentUrl));
          continue;
        }
        if (!Number.isInteger(status) || status < 200 || status >= 300) throw new Error(`网页返回 HTTP ${status || '未知'}。`);
        const mediaType = String(headerValue(response.headers, 'content-type') || '').toLowerCase().split(';', 1)[0].trim();
        if (!['text/html', 'application/xhtml+xml'].includes(mediaType)) throw new Error('目标地址未返回 HTML 页面。');
        const body = Buffer.isBuffer(response.body) ? response.body.toString('utf8') : String(response.body || '');
        if (Buffer.byteLength(body) > maxBytes) throw new Error('网页响应超过大小限制。');
        const metadata = extractMetadata(body, currentUrl.toString());
        return {
          finalUrl: currentUrl.toString(),
          fetchedAt: new Date(now()).toISOString(),
          ...metadata,
          missingFields: [
            !metadata.title && '标题',
            !metadata.summary && '摘要',
            !metadata.author && '作者',
            !metadata.imageUrl && '来源图片'
          ].filter(Boolean)
        };
      }
      throw new Error('网页重定向次数超过限制。');
    }, timeoutMs);
  };
}

module.exports = { createPublicWebCapture };
