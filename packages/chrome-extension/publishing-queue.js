(function (root) {
  const MAX_PUBLISH_QUEUE_ITEMS = 50;
  const QUEUE_STATUS = Object.freeze({
    queued: 'queued',
    scheduledExternally: 'scheduledExternally'
  });

  function createQueuedPost(input, now) {
    const content = String(input?.content || '').trim();
    if (!content) throw new Error('待发布内容不能为空。');

    const createdAt = new Date(now ?? input?.createdAt ?? Date.now());
    if (!Number.isFinite(createdAt.getTime())) throw new Error('待发布时间无效。');

    return {
      id: String(input?.id || createQueueId(createdAt)).trim(),
      content,
      title: String(input?.title || '待发布内容').trim() || '待发布内容',
      kind: String(input?.kind || 'draft').trim() || 'draft',
      createdAt: createdAt.toISOString(),
      plannedAt: null,
      timeZone: null,
      status: QUEUE_STATUS.queued
    };
  }

  function normalizeQueuedPosts(value) {
    const posts = Array.isArray(value) ? value : [];
    const normalizedPosts = [];
    const ids = new Set();

    for (const post of posts) {
      try {
        const normalizedPost = createQueuedPost(post, post?.createdAt);
        if (ids.has(normalizedPost.id)) continue;
        ids.add(normalizedPost.id);
        const plannedAt = normalizePlannedAt(post?.plannedAt);
        normalizedPosts.push({
          ...normalizedPost,
          plannedAt,
          timeZone: plannedAt ? String(post?.timeZone || '').trim() || null : null,
          status: plannedAt && post?.status === QUEUE_STATUS.scheduledExternally
            ? QUEUE_STATUS.scheduledExternally
            : QUEUE_STATUS.queued
        });
      } catch {
        continue;
      }
      if (normalizedPosts.length === MAX_PUBLISH_QUEUE_ITEMS) break;
    }

    return normalizedPosts;
  }

  function planQueuedPost(post, plannedAt, timeZone, now = new Date()) {
    const normalizedPost = createQueuedPost(post, post?.createdAt);
    const plannedDate = new Date(plannedAt);
    const currentDate = new Date(now);
    if (!Number.isFinite(plannedDate.getTime()) || !Number.isFinite(currentDate.getTime()) || plannedDate <= currentDate) {
      throw new Error('计划发布时间必须晚于当前时间。');
    }

    return {
      ...normalizedPost,
      plannedAt: plannedDate.toISOString(),
      timeZone: String(timeZone || '').trim() || null,
      status: QUEUE_STATUS.queued
    };
  }

  function markQueuedPostScheduled(post) {
    const normalizedPost = createQueuedPost(post, post?.createdAt);
    const plannedAt = normalizePlannedAt(post?.plannedAt);
    if (!plannedAt) throw new Error('请先保存计划发布时间。');

    return {
      ...normalizedPost,
      plannedAt,
      timeZone: String(post?.timeZone || '').trim() || null,
      status: QUEUE_STATUS.scheduledExternally
    };
  }

  function restoreQueuedPost(post) {
    return {
      ...createQueuedPost(post, post?.createdAt),
      plannedAt: null,
      timeZone: null,
      status: QUEUE_STATUS.queued
    };
  }

  function normalizePlannedAt(value) {
    const plannedAt = new Date(value);
    return Number.isFinite(plannedAt.getTime()) ? plannedAt.toISOString() : null;
  }

  function createQueueId(createdAt) {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `queued-${createdAt.getTime()}-${Math.random().toString(36).slice(2)}`;
  }

  root.XPublishingQueue = Object.freeze({
    MAX_PUBLISH_QUEUE_ITEMS,
    QUEUE_STATUS,
    createQueuedPost,
    normalizeQueuedPosts,
    planQueuedPost,
    markQueuedPostScheduled,
    restoreQueuedPost
  });
})(globalThis);
