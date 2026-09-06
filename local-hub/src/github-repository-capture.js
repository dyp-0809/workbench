const GITHUB_HOSTS = new Set(['github.com', 'www.github.com']);
const GITHUB_RESERVED_OWNERS = new Set([
  'about', 'collections', 'contact', 'customer-stories', 'events', 'explore', 'features', 'issues', 'join',
  'login', 'marketplace', 'new', 'notifications', 'orgs', 'organizations', 'pricing', 'pulls', 'readme',
  'search', 'security', 'settings', 'site', 'sponsors', 'topics', 'trending'
]);
const DEFAULT_TIMEOUT_MS = 8_000;

function normalizeText(value, limit = 500) {
  return String(value || '').trim().normalize('NFKC').slice(0, limit);
}

function safeHttpUrl(value) {
  const source = normalizeText(value, 2_000);
  if (!source) return null;
  try {
    const url = new URL(source);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function decodeSegment(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function isGitHubName(value) {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(value);
}

function parseGitHubRepositoryUrl(value) {
  let url;
  try {
    url = value instanceof URL ? new URL(value.toString()) : new URL(value);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !GITHUB_HOSTS.has(url.hostname.toLowerCase())) return null;
  if (url.port) return null;
  const segments = url.pathname.split('/').filter(Boolean).map(decodeSegment);
  if (segments.length < 2 || segments.some((segment) => segment === null)) return null;
  const owner = segments[0];
  const repository = segments[1].replace(/\.git$/i, '');
  if (!isGitHubName(owner) || !isGitHubName(repository) || GITHUB_RESERVED_OWNERS.has(owner.toLowerCase())) return null;
  const normalizedOwner = owner.toLowerCase();
  const normalizedRepository = repository.toLowerCase();
  return {
    owner,
    repository,
    canonicalUrl: `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`,
    normalizedUrl: `https://github.com/${encodeURIComponent(normalizedOwner)}/${encodeURIComponent(normalizedRepository)}`
  };
}

function normalizeTopics(value) {
  const topics = [];
  const seen = new Set();
  for (const topic of Array.isArray(value) ? value : []) {
    const name = normalizeText(topic, 100);
    const normalizedName = name.toLocaleLowerCase();
    if (!name || seen.has(normalizedName)) continue;
    seen.add(normalizedName);
    topics.push(name);
  }
  return topics;
}

function githubApiFailure(response) {
  if (response.status === 429 || response.status === 403) return new Error('GitHub 公开 API 暂不可用。');
  return new Error(`GitHub 公开 API 请求失败（${response.status}）。`);
}

async function defaultGitHubRepositoryFetcher(repository, { signal, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const url = new URL(`https://api.github.com/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repository)}`);
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Personal Workbench',
      'X-GitHub-Api-Version': '2026-03-10'
    },
    signal: requestSignal
  });
  if (!response.ok) throw githubApiFailure(response);
  return response.json();
}

function mapGitHubRepository(payload) {
  if (!payload || typeof payload !== 'object' || payload.private === true || normalizeText(payload.visibility, 32).toLowerCase() === 'private') {
    throw new Error('GitHub 仓库资料不可用。');
  }
  const owner = normalizeText(payload.owner?.login, 100);
  const name = normalizeText(payload.name, 100);
  const canonicalRepository = parseGitHubRepositoryUrl(payload.html_url);
  const stars = payload.stargazers_count;
  const hasCompleteMetadata = Object.hasOwn(payload, 'description')
    && Object.hasOwn(payload, 'language')
    && Object.hasOwn(payload, 'license')
    && Object.hasOwn(payload, 'stargazers_count')
    && Object.hasOwn(payload, 'topics')
    && (payload.description === null || typeof payload.description === 'string')
    && (payload.language === null || typeof payload.language === 'string')
    && (payload.license === null || (typeof payload.license === 'object' && !Array.isArray(payload.license)))
    && Array.isArray(payload.topics)
    && typeof stars === 'number'
    && Number.isSafeInteger(stars)
    && stars >= 0;
  if (!owner || !name || !canonicalRepository || !hasCompleteMetadata
    || canonicalRepository.owner.toLocaleLowerCase() !== owner.toLocaleLowerCase()
    || canonicalRepository.repository.toLocaleLowerCase() !== name.toLocaleLowerCase()) {
    throw new Error('GitHub 仓库资料不完整。');
  }
  const github = {
    owner,
    repository: name,
    language: normalizeText(payload.language, 100),
    license: normalizeText(payload.license?.name || payload.license?.spdx_id, 200),
    stars,
    topics: normalizeTopics(payload.topics)
  };
  return {
    canonicalUrl: canonicalRepository.canonicalUrl,
    title: `${github.owner}/${github.repository}`,
    summary: normalizeText(payload.description, 4_000),
    author: github.owner,
    imageUrl: safeHttpUrl(payload.owner?.avatar_url),
    github
  };
}

function runWithinCaptureDeadline(callback, timeoutMs) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('GitHub 仓库资料获取超时。'));
    }, timeoutMs);
  });
  return Promise.race([Promise.resolve().then(() => callback(controller.signal)), timeout])
    .finally(() => clearTimeout(timer));
}

function createGitHubRepositoryCapture({ repositoryFetcher = defaultGitHubRepositoryFetcher, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return async function captureGitHubRepository(value) {
    const repository = parseGitHubRepositoryUrl(value);
    if (!repository) return null;
    const payload = await runWithinCaptureDeadline(
      (signal) => repositoryFetcher(repository, { signal, timeoutMs }),
      timeoutMs
    );
    return mapGitHubRepository(payload);
  };
}

module.exports = { createGitHubRepositoryCapture, parseGitHubRepositoryUrl };
