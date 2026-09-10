const keytar = require('keytar');

const SERVICE = 'com.x-assistant.local-hub';
const ACCOUNT = 'github-stars-token';
const GITHUB_STARS_URL = 'https://api.github.com/user/starred';
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_TIMEOUT_MS = 15_000;

function normalizeToken(value) {
  return String(value || '').trim();
}

async function readGitHubStarsToken() {
  try {
    return normalizeToken(await keytar.getPassword(SERVICE, ACCOUNT)) || null;
  } catch {
    return null;
  }
}

async function getSafeGitHubStarsSettings() {
  return { configured: Boolean(await readGitHubStarsToken()) };
}

async function writeGitHubStarsToken(input = {}) {
  const token = normalizeToken(input.token);
  if (!token) throw new Error('GitHub Personal Access Token 不能为空。');
  await keytar.setPassword(SERVICE, ACCOUNT, token);
  return { configured: true };
}

async function clearGitHubStarsToken() {
  await keytar.deletePassword(SERVICE, ACCOUNT);
  return { configured: false };
}

function githubStarsApiFailure(response) {
  if ([401, 403, 429].includes(response.status)) return new Error('GitHub Stars API 暂不可用。');
  return new Error(`GitHub Stars API 请求失败（${response.status}）。`);
}

function hasNextPage(linkHeader) {
  return /<[^>]+>;\s*rel="next"/i.test(String(linkHeader || ''));
}

async function fetchGitHubStarredPage(token, { page = 1, perPage = DEFAULT_PAGE_SIZE, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const normalizedToken = normalizeToken(token);
  if (!normalizedToken) throw new Error('GitHub Personal Access Token 未配置。');
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
  const url = new URL(GITHUB_STARS_URL);
  url.searchParams.set('per_page', String(perPage));
  url.searchParams.set('page', String(page));
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${normalizedToken}`,
      'User-Agent': 'Personal Workbench',
      'X-GitHub-Api-Version': '2026-03-10'
    },
    signal: requestSignal
  });
  if (!response.ok) throw githubStarsApiFailure(response);
  const payload = await response.json();
  if (!Array.isArray(payload)) throw new Error('GitHub Stars API 返回格式无效。');
  return { repositories: payload, hasNext: hasNextPage(response.headers.get('link')) || payload.length >= perPage };
}

module.exports = {
  clearGitHubStarsToken,
  fetchGitHubStarredPage,
  getSafeGitHubStarsSettings,
  readGitHubStarsToken,
  writeGitHubStarsToken
};
