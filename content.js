const MAX_VISIBLE_COMMENTS = 8;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'extract-post') {
    sendResponse(extractPostContext());
  }
  if (message.type === 'extract-trending-posts') {
    sendResponse(extractTrendingPosts());
  }
});

function extractPostContext() {
  const visibleArticles = [...document.querySelectorAll('article')].filter(isVisible);
  const targetedArticle = document.querySelector('article[data-x-reply-target="true"]');
  const article = targetedArticle && isVisible(targetedArticle)
    ? targetedArticle
    : visibleArticles[0];

  if (!article) {
    return { ok: false, error: '没有识别到当前帖子，请打开 X 帖子页面后重试。' };
  }

  const text = article.innerText.trim();
  if (!text) {
    return { ok: false, error: '当前帖子没有可读取的文本。' };
  }
  const comments = isPostDetailPage()
    ? visibleArticles.filter((candidate) => candidate !== article)
      .slice(0, MAX_VISIBLE_COMMENTS)
      .map((comment) => comment.innerText.trim())
      .filter(Boolean)
    : [];
  const contextText = [
    `原帖：\n${text}`,
    comments.length
      ? `\n当前可见评论：\n${comments.map((comment, index) => `[评论 ${index + 1}]\n${comment}`).join('\n\n')}`
      : ''
  ].join('');

  return {
    ok: true,
    post: {
      text,
      comments,
      contextText,
      author: article.querySelector('a[href^="/" i][role="link"]')?.textContent?.trim() ?? '',
      url: window.location.href,
      capturedAt: new Date().toISOString(),
      isDetailPage: isPostDetailPage()
    }
  };
}

function extractTrendingPosts() {
  const posts = [...document.querySelectorAll('article')]
    .filter(isVisible)
    .map(parseVisiblePost)
    .filter((post) => post.url && post.text)
    .filter((post, index, all) => all.findIndex((candidate) => candidate.url === post.url) === index)
    .slice(0, 30);

  if (!posts.length) {
    return { ok: false, error: '当前页面没有识别到已加载的帖子。请滚动加载后重试。' };
  }

  return { ok: true, posts, capturedAt: new Date().toISOString(), pageUrl: window.location.href };
}

function parseVisiblePost(article) {
  const statusLink = [...article.querySelectorAll('a[href*="/status/"]')]
    .find((link) => /\/status\/\d+/.test(link.getAttribute('href') || ''));
  const labels = [...article.querySelectorAll('[aria-label], [title]')]
    .map((element) => element.getAttribute('aria-label') || element.getAttribute('title') || '');
  const metricText = labels.join(' ');
  return {
    text: article.innerText.trim(),
    url: statusLink ? new URL(statusLink.getAttribute('href'), window.location.origin).href : '',
    author: article.querySelector('a[href^="/" i][role="link"]')?.textContent?.trim() ?? '',
    metrics: {
      replies: parseMetric(metricText, ['repl', '回复']),
      reposts: parseMetric(metricText, ['repost', '转发', 'retweet']),
      likes: parseMetric(metricText, ['like', '喜欢']),
      views: parseMetric(metricText, ['view', '浏览'])
    }
  };
}

function parseMetric(text, keywords) {
  const keyword = keywords.find((candidate) => text.toLowerCase().includes(candidate));
  if (!keyword) return 0;
  const match = text.match(new RegExp(`${keyword}[^0-9]*([0-9][0-9,.]*\\s*[万千KkMm]?)`, 'i'));
  return match ? toNumber(match[1]) : 0;
}

function toNumber(value) {
  const normalized = value.replace(/,/g, '').replace(/\s/g, '').toLowerCase();
  const multiplier = normalized.endsWith('万') ? 10000
    : normalized.endsWith('千') ? 1000
    : normalized.endsWith('k') ? 1000
    : normalized.endsWith('m') ? 1000000
    : 1;
  return Number.parseFloat(normalized.replace(/[万千km]$/, '')) * multiplier || 0;
}

function isPostDetailPage() {
  return /\/status\/\d+/.test(window.location.pathname);
}

function isVisible(element) {
  const rect = element.getBoundingClientRect();
  return rect.top < window.innerHeight && rect.bottom > 0 && rect.height > 0;
}

function addDraftTriggers() {
  document.querySelectorAll('article').forEach((article) => {
    if (article.querySelector('.x-reply-copilot-trigger')) return;

    const likeButton = article.querySelector('[data-testid="like"]');
    const actionGroup = likeButton?.closest('[role="group"]') ?? likeButton?.parentElement;
    if (!likeButton || !actionGroup) return;

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'x-reply-copilot-trigger';
    trigger.setAttribute('aria-label', '用 X 助手生成草稿');
    trigger.title = '用 X 助手生成草稿';
    trigger.textContent = 'AI';
    trigger.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      document.querySelectorAll('article[data-x-reply-target="true"]').forEach((target) => {
        target.removeAttribute('data-x-reply-target');
      });
      article.setAttribute('data-x-reply-target', 'true');
      chrome.runtime.sendMessage({ type: 'open-panel' });
    });
    actionGroup.insertBefore(trigger, likeButton);
  });
}

addDraftTriggers();
new MutationObserver(addDraftTriggers).observe(document.body, { childList: true, subtree: true });
