chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id) {
    await chrome.sidePanel.open({ tabId: tab.id });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'open-panel') {
    if (sender.tab?.id) {
      chrome.sidePanel.open({ tabId: sender.tab.id })
        .then(() => sendResponse({ ok: true }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
    } else {
      sendResponse({ ok: false, error: '无法确定当前标签页。' });
    }
    return true;
  }

  if (message.type === 'extract-trending-posts') {
    extractTrendingFromActiveTab()
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type !== 'extract-current-post') return;

  extractFromActiveTab()
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});

async function extractFromActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id || !isXUrl(tab.url)) {
    throw new Error('请先在 x.com 打开一个帖子页面。');
  }

  try {
    return await chrome.tabs.sendMessage(tab.id, { type: 'extract-post' });
  } catch {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    return await chrome.tabs.sendMessage(tab.id, { type: 'extract-post' });
  }
}

async function extractTrendingFromActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id || !isXUrl(tab.url)) {
    throw new Error('请先在 x.com 打开 Explore、搜索结果或列表页面。');
  }

  try {
    return await chrome.tabs.sendMessage(tab.id, { type: 'extract-trending-posts' });
  } catch {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    return await chrome.tabs.sendMessage(tab.id, { type: 'extract-trending-posts' });
  }
}

function isXUrl(url) {
  return typeof url === 'string' && /^https:\/\/(x|twitter)\.com\//.test(url);
}
