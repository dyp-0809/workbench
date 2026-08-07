const test = require('node:test');
const assert = require('node:assert/strict');

require('../h5/idea-engine.js');

const { detectReplyLanguage } = globalThis.XReplyCopilotIdeaEngine;

test('明确的非拉丁文字不会被 X 页面英语噪声覆盖', () => {
  const englishNoise = '@news_account\nTranslate post';

  assert.equal(detectReplyLanguage(`${englishNoise}\nこれは日本語の投稿です`), 'ja');
  assert.equal(detectReplyLanguage(`${englishNoise}\n한국어 게시물입니다`), 'ko');
  assert.equal(detectReplyLanguage(`${englishNoise}\nĐây là bài viết tiếng Việt`), 'vi');
});

test('无音调越南语使用常见词组合保守识别', () => {
  assert.equal(detectReplyLanguage('Xin chao moi nguoi, day la bai viet cua toi'), 'vi');
});

test('中英文仍按有效字符占比识别', () => {
  assert.equal(detectReplyLanguage('这是以中文为主的内容，讨论实际使用体验 with AI'), 'zh');
  assert.equal(detectReplyLanguage('English words are clearly dominant 中文'), 'en');
});
