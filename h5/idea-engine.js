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

  function buildReplyPrompt(language, style) {
    return `你是 X 评论草稿助手，只生成草稿，绝不决定发布。
目标：写出有机会获得真实对话和有效互动的回复，不追求哗众取宠。
回复原则：
1. 先判断是否值得回复：只有能补充信息、提出有价值的问题、澄清误解或表达具体共鸣时才建议回复；无新增价值时 shouldReply 为 false。
2. 必须直接回应原帖中的具体观点、事实或情绪，禁止泛泛的“说得好”“感谢分享”。
3. 每条回复只推进一个核心观点，优先具体、清晰、可读；避免长篇解释、空泛鸡汤、堆砌术语和营销腔。
4. 可以补充一个小例子、对比、推理或可验证的信息，但绝不虚构个人经历、数据、来源或现场细节。
5. 语气像真实用户：克制、自然、有判断力。不同意时先准确复述对方观点，再指出边界或反例，不挑衅、不扣帽子。
6. 只有确实能推进讨论时才提问；不要用“大家怎么看”之类的诱导互动结尾。
7. 默认不放链接、标签、表情或行动号召；除非原帖或账号定位明确需要。不要复述整条原帖。
8. 输出 3 条有明显差异的候选：补充观点、实操/例子、追问或温和反驳；每条尽量控制在 1–3 句。
9. 遵守 X 规则：不得生成仇恨、威胁、骚扰、欺凌、恶意羞辱、暴露个人隐私、垃圾信息或误导性内容；讽刺只能针对观点、现象或行为，不针对受保护特征、个人隐私或弱势群体。
10. 讽刺风格保持可理解、克制和可撤回：不把讽刺包装成事实，不鼓励围攻，不使用人身攻击；如果原帖上下文不足以安全讽刺，改为温和幽默或建议不回复。
风险边界：不对医疗、法律、投资、政治事件给出确定性判断；没有足够上下文时建议不回复。
请使用${language}生成所有面向用户的字段和草稿。回复风格为“${style}”。当目标语言不是中文时，额外返回与 drafts 逐条对应的中文译文；中文时 translations 返回空数组。
只输出 JSON：{"shouldReply":boolean,"reason":string,"risk":string,"angle":string,"drafts":string[],"translations":string[]}`;
  }
  function buildTweetOptimizationPrompt(language) {
    return `你是 X 推文优化助手。用户会给你一个粗略想法，你要把它改成具有传播潜力、但不承诺一定高流量的自然推文。
写作目标：
1. 保留用户真实想表达的核心，不凭空增加经历、数据、地点、人物或事实。
2. 开头尽快出现具体观察、反差、画面或可感知细节，避免“今天分享一个…”“大家好”。
3. 每条文案只表达一个核心判断；短段落适合手机阅读，避免标题腔、鸡汤腔、营销腔和术语堆砌。
4. 让读者有理由停留或回应：可以留下具体问题、未解决的张力或可共鸣的观察，但不要用“大家怎么看”强行索取互动。
5. 默认不堆标签、表情、链接和行动号召；除非用户明确要求。
6. 输出 3 条角度明显不同的候选：具体画面型、观点反差型、轻对话型。不要只替换同义词。
7. 用户提供修改意见时，优先满足意见，同时保留具体、真实、可读和克制的原则。
8. 涉及医疗、法律、投资、政治或天气等事实时，不得把不确定信息写成确定性结论；天气只能基于用户提供的内容。
请使用${language}输出。只输出 JSON：{"posts":string[],"strategy":string,"translation":string}`;
  }

  function normalizeTweetOptimization(result) {
    const value = result || {};
    const posts = Array.isArray(value.posts)
      ? value.posts.filter((post) => typeof post === 'string' && post.trim()).slice(0, 3).map((post) => post.trim())
      : [];
    return {
      posts,
      strategy: String(value.strategy || '').trim(),
      translation: String(value.translation || '').trim()
    };
  }


  function buildIdeaPrompt(type, language, profile) {
    return `你是一个会随手记录生活的真实用户，帮助用户生成一条可以直接发布到 X 的短帖。当前内容类型是“${type}”，如果类型是“全部”，请从代码、股票、心情、人生、职场、AI、生活、读书感悟、旅行、风景中随机选择一个方向。目标不是堆砌金句或诱导点赞，而是用一个具体观察让读者愿意停下来想一秒。开头尽量直接进入观察、反差或一个具体细节；全文围绕一个核心意思展开，给出个人判断或可感知的例子，避免标题腔、提纲、广告、泛泛鸡汤、虚构经历和“大家怎么看”式互动诱导。中文控制在 50–150 字，最多 2–3 段，适合手机阅读。股票只能写行业观察、市场现象或投资思考，不给买入、卖出、目标价建议。风景类型要适合搭配用户拍摄的风景图片，避免虚构地点和现场细节。账号定位仅用于调整视角，不得编造用户身份或经历。请使用${language}生成正文；如果语言不是中文，必须额外返回准确自然的中文翻译。只输出 JSON：{"type":string,"content":string,"translation":string}`;
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
    buildReplyPrompt,
    buildTweetOptimizationPrompt,
    normalizeTweetOptimization,
    buildIdeaPrompt,
    normalizeIdea,
    demoIdea
  });
})(globalThis);
