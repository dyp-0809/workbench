(function (root) {
  const languageNames = Object.freeze({ zh: '中文', en: 'English', vi: 'Tiếng Việt' });
  const ideaTypeNames = Object.freeze({
    all: '全部',
    code: '代码',
    stock: '股票',
    mood: '心情',
    life: '人生',
    work: '职场',
    ai: 'AI',
    daily: '生活',
    reading: '读书感悟',
    travel: '旅行',
    scenery: '风景'
  });

  function buildIdeaPrompt(type, language, profile) {
    return `你是一个会随手记录生活的真实用户，帮助用户生成一条可以直接发布到 X 的短帖。当前内容类型是“${type}”，如果类型是“全部”，请从代码、股票、心情、人生、职场、AI、生活、读书感悟、旅行、风景中随机选择一个方向。内容要像人的碎碎念，有具体感和个人观察，不要像标题、提纲、广告或泛泛鸡汤。中文控制在 50–150 字，最多 2–3 段。股票只能写行业观察、市场现象或投资思考，不给买入、卖出、目标价建议。风景类型要适合搭配用户拍摄的风景图片，避免虚构地点和现场细节。请使用${language}生成正文；如果语言不是中文，必须额外返回准确自然的中文翻译。只输出 JSON：{"type":string,"content":string,"translation":string}`;
  }

  function normalizeIdea(result, fallbackType) {
    const value = result || {};
    return {
      type: String(value.type || fallbackType || ideaTypeNames.all),
      content: String(value.content || '').trim(),
      translation: String((value.translation ?? value.chineseTranslation ?? (Array.isArray(value.translations) ? value.translations[0] : '')) || '').trim()
    };
  }

  function demoIdea(type, language) {
    const demos = {
      zh: {
        content: `${type}这个主题，真正让我记住的不是结论，而是它让我重新看了一遍自己习以为常的判断。`,
        translation: ''
      },
      en: {
        content: `The most interesting part of ${type} is not the conclusion, but the way it makes me question an assumption I take for granted.`,
        translation: `${type}最有意思的地方，不是结论，而是它让我重新审视一个习以为常的假设。`
      },
      vi: {
        content: `Điều thú vị nhất về ${type} không phải là kết luận, mà là cách nó khiến tôi xem lại một giả định quen thuộc.`,
        translation: `关于${type}最有意思的地方，不是结论，而是它让我重新审视一个习以为常的假设。`
      }
    };
    return normalizeIdea({ type, ...(demos[language] || demos.zh) }, type);
  }

  root.XReplyCopilotIdeaEngine = Object.freeze({
    languageNames,
    ideaTypeNames,
    buildIdeaPrompt,
    normalizeIdea,
    demoIdea
  });
})(globalThis);
