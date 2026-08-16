(function (root) {
  const languageNames = Object.freeze({ zh: '中文', en: 'English', vi: 'Tiếng Việt', ja: '日本語', ko: '한국어' });
  const humanToneNames = Object.freeze({ 1: '克制', 2: '自然', 3: '平衡', 4: '鲜活', 5: '强人味' });
  const humanToneDescriptions = Object.freeze({
    1: '保持克制和清晰，允许少量口语，但整体偏稳重。',
    2: '使用自然口语和短句，减少书面连接词，不刻意制造个性。',
    3: '像认真读完原帖的人临场回复：有自然停顿、口语化转折和具体措辞，允许轻微不完美。',
    4: '表达更鲜活，有明显节奏和个人判断；可以使用自然的省略、反问或轻幽默，但不要表演感。',
    5: '个性最强，允许短促句式、俏皮表达和鲜明态度，但不堆网络黑话、不冒犯、不夸张表演。'
  });
  const unaccentedVietnameseWords = new Set([
    'anh', 'bai', 'ban', 'chao', 'cho', 'cua', 'day', 'den', 'duoc', 'em',
    'khi', 'khong', 'lam', 'moi', 'mot', 'muon', 'nguoi', 'nhu', 'nhung',
    'rat', 'tieng', 'toi', 'trong', 'viet', 'voi', 'xin'
  ]);
  const ideaTypeNames = Object.freeze({
    all: '全部',
    code: '代码',
    tools: '实用工具',
    ai: 'AI',
    photography: '摄影技巧',
    stock: '美股',
    mood: '心情',
    life: '人生感悟',
    work: '职场',
    daily: '生活',
    reading: '读书感悟',
    travel: '旅行',
    scenery: '风景',
    zhihu: '知乎热议'
  });
  const contentFormatNames = Object.freeze({ post: '原创短帖', thread: 'Thread', article: 'Article' });
  const replyActionNames = Object.freeze({ reply: '直接回复', original: '原创短帖', thread: '扩展长帖', skip: '暂不发布' });
  const originalityLevelNames = Object.freeze({ weak: '原创增量较弱', adequate: '原创增量足够', strong: '原创增量明显' });
  const DEFAULT_CONTENT_LENGTH_LIMIT = 100;
  const MIN_CONTENT_LENGTH_LIMIT = 20;
  const MAX_CONTENT_LENGTH_LIMIT = 2000;
  const DEFAULT_TWEET_LENGTH_LIMIT = 80;
  function normalizeTweetLengthLimit(value) {
    if (value === undefined || value === null || value === '') return DEFAULT_TWEET_LENGTH_LIMIT;
    return normalizeContentLengthLimit(value);
  }
  function normalizeContentLengthLimit(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return DEFAULT_CONTENT_LENGTH_LIMIT;
    return Math.min(MAX_CONTENT_LENGTH_LIMIT, Math.max(MIN_CONTENT_LENGTH_LIMIT, Math.floor(parsed)));
  }

  const INSPIRATION_COLLECTION_SIZE = 10;

  function buildInspirationCollectionPrompt(definition) {
    const contentDefinition = String(definition || '').trim().slice(0, 200);
    if (!contentDefinition) throw new Error('请先填写内容定义。');

    return `你是内容研究助手。根据用户的内容定义，生成恰好 ${INSPIRATION_COLLECTION_SIZE} 条可用于创作的讨论灵感。
内容定义：“${contentDefinition}”。
输出规则：
1. 优先依据你已有的知识和用户定义判断值得关注的讨论方向；不要声称你已经读取实时热榜、新闻、社交媒体或具体互动数据。
2. 每条灵感聚焦一个具体、可讨论的问题或变化，避免泛泛主题、标题党和无意义对立。
3. 涉及时效事件、数据、人物、投资、医疗、法律或政治时，只能表述为待核验的讨论线索，不得编造来源、数据、发布时间或热度。
4. title 是简洁的讨论标题；summary 说明正在讨论的核心分歧或问题；reason 说明为什么它可能值得在近期关注，必须使用“可能”“待核验”等审慎表述；angle 给出一个不复述现有观点的原创切入角度。
5. 所有字段使用中文，不要自动发布或要求用户互动。
只输出 JSON：{"ideas":[{"title":string,"summary":string,"reason":string,"angle":string}]}`;
  }

  function normalizeInspirationCollection(result) {
    const ideas = Array.isArray(result?.ideas) ? result.ideas : [];
    const normalizedIdeas = [];
    const titles = new Set();

    for (const idea of ideas) {
      const title = String(idea?.title || '').trim();
      const summary = String(idea?.summary || '').trim();
      if (!title || !summary || titles.has(title)) continue;

      titles.add(title);
      normalizedIdeas.push({
        title,
        summary,
        reason: String(idea?.reason || '请先核验这条讨论线索的时效性和事实基础。').trim(),
        angle: String(idea?.angle || '补充你的真实判断、经验、案例或反例。').trim()
      });
      if (normalizedIdeas.length === INSPIRATION_COLLECTION_SIZE) break;
    }

    return normalizedIdeas;
  }


  function constrainOriginalContent(content, limit) {
    const characters = [...String(content || '').trim()];
    if (characters.length <= limit) {
      return { content: characters.join(''), contentLength: characters.length, wasTruncated: false };
    }
    const constrained = `${characters.slice(0, limit - 1).join('').trimEnd()}…`;
    return { content: constrained, contentLength: [...constrained].length, wasTruncated: true };
  }
  function formatTweetParagraphs(content) {
    const sentences = String(content || '').match(/[^。！？!?]+[。！？!?]+|[^。！？!?]+$/gu) ?? [];
    const normalizedSentences = sentences.map((sentence) => sentence.trim()).filter(Boolean);
    if (normalizedSentences.length < 3) return normalizedSentences.join('');
    const paragraphs = [];
    for (let index = 0; index < normalizedSentences.length; index += 2) {
      paragraphs.push(normalizedSentences.slice(index, index + 2).join(''));
    }
    return paragraphs.join('\n\n');
  }
  function removeTerminalPunctuation(content) {
    return String(content || '').trim().replace(/[。！？.!?；;：:,，…]+$/gu, '').trimEnd();
  }

  function detectReplyLanguage(text) {
    const japaneseCount = (text.match(/[\u3040-\u30ff\uff66-\uff9d]/gu) ?? []).length;
    const koreanCount = (text.match(/[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/gu) ?? []).length;
    const vietnameseCount = (text.match(/[\u0102-\u0103\u0110-\u0111\u0128-\u0129\u0168-\u0169\u01a0-\u01b0\u1ea0-\u1ef9]/gu) ?? []).length;

    // X 的用户名和操作文案常带大量英文；明确的文字特征比页面噪声更能代表帖子语言。
    if (japaneseCount || koreanCount || vietnameseCount) {
      if (japaneseCount >= koreanCount && japaneseCount >= vietnameseCount) return 'ja';
      if (koreanCount >= vietnameseCount) return 'ko';
      return 'vi';
    }

    const latinWords = text.toLocaleLowerCase('vi').match(/\p{Script=Latin}+/gu) ?? [];
    const vietnameseSignals = new Set(latinWords.filter((word) => unaccentedVietnameseWords.has(word)));
    if (vietnameseSignals.size >= 3) return 'vi';

    const chineseCount = (text.match(/[\u3400-\u9fff]/gu) ?? []).length;
    const englishCount = latinWords.reduce((total, word) => total + word.length, 0);
    return chineseCount > englishCount ? 'zh' : 'en';
  }
  function normalizeReplyResult(result) {
    const value = result || {};
    const drafts = Array.isArray(value.drafts)
      ? value.drafts
        .filter((draft) => typeof draft === 'string' && draft.trim())
        .map((draft) => removeTerminalPunctuation(draft))
        .filter(Boolean)
        .slice(0, 3)
      : [];
    const translations = Array.isArray(value.translations)
      ? value.translations.filter((translation) => typeof translation === 'string' && translation.trim()).slice(0, drafts.length)
      : [];
    const fallbackAction = value.shouldReply ? 'reply' : 'skip';
    const recommendedAction = replyActionNames[value.recommendedAction] ? value.recommendedAction : fallbackAction;

    return {
      shouldReply: Boolean(value.shouldReply),
      recommendedAction,
      actionReason: String(value.actionReason || value.reason || '请根据内容价值和风险人工判断。'),
      reason: String(value.reason || '未提供判断理由。'),
      risk: String(value.risk || '请人工复核语境。'),
      angle: String(value.angle || '未提供建议角度。'),
      drafts,
      translations
    };
  }


  function buildReplyPrompt(language, style, humanTone = 3) {
    const normalizedHumanTone = humanToneNames[humanTone] ? humanTone : 3;
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
人味程度为 ${normalizedHumanTone}/5（${humanToneNames[normalizedHumanTone]}）：${humanToneDescriptions[normalizedHumanTone]}
所有等级都要避免公文腔、客服腔、总结腔和 AI 套话，尤其避免“确实”“值得关注”“从某种意义上”“这提醒我们”等模板开场；不要为了显得有人味而虚构经历、身份、情绪或事实。
11. drafts 要像真人当下说的话：可以有自然停顿、短句或克制的口语，但不故意错字、不套金句、不写总结段；每条结尾不使用句号、问号或感叹号。
先判断最合适的内容动作：reply 表示直接回复；original 表示观点可以脱离原帖写成原创短帖；thread 表示值得展开成长帖；skip 表示没有足够新增价值或风险过高。回复曝光不等于原创内容价值，不要默认选择 reply。
请使用${language}生成所有面向用户的字段和草稿。回复风格为“${style}”。当目标语言不是中文时，额外返回与 drafts 逐条对应的中文译文；中文时 translations 返回空数组。
只输出 JSON：{"shouldReply":boolean,"recommendedAction":"reply|original|thread|skip","actionReason":string,"reason":string,"risk":string,"angle":string,"drafts":string[],"translations":string[]}`;
  }
  function buildTweetOptimizationPrompt(language, contentLengthLimit = DEFAULT_TWEET_LENGTH_LIMIT) {
    const limit = normalizeTweetLengthLimit(contentLengthLimit);
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
9. 默认自然口语，避免公文腔、客服腔、总结腔、AI 套话和金句腔；不用错别字伪造人味，未被系统截断时结尾不使用句号、问号或感叹号。
10. 每条候选不超过 ${limit} 个字符；超出时保留核心表达并自行收紧。
11. 每两句话组成一个段落，段落之间空一行；不足两句时保持自然完整，不要为了凑句数补写内容。
请使用${language}输出。只输出 JSON：{"posts":string[],"strategy":string,"translation":string}`;
  }

  function normalizeTweetOptimization(result, options = {}) {
    const value = result || {};
    const contentLengthLimit = normalizeTweetLengthLimit(options.contentLengthLimit);
    const posts = Array.isArray(value.posts)
      ? value.posts
        .filter((post) => typeof post === 'string' && post.trim())
        .map((post) => constrainOriginalContent(formatTweetParagraphs(removeTerminalPunctuation(post)), contentLengthLimit).content)
        .filter(Boolean)
        .slice(0, 3)
      : [];
    return {
      posts,
      strategy: String(value.strategy || '').trim(),
      translation: String(value.translation || '').trim(),
      contentLengthLimit
    };
  }

  function buildContributionSuggestionsPrompt(options = {}) {
    const type = options.type || ideaTypeNames.all;
    const profile = options.profile || '未提供账号定位';
    return `你是 X 原创内容切入点助手。用户会提供参考素材或话题，你要给出恰好 3 个可编辑的“新增价值”候选，供用户选择或继续修改。
当前主题为“${type}”，账号定位为“${profile}”。
要求：
1. 三份候选必须明显不同：独立判断、适用边界或反例、实践启示或待验证问题。
2. contribution 要能直接放入“你的新增价值”输入框，具体、简洁，不得只是复述或总结素材。
3. 不得虚构用户经历、身份、数据、来源或现场细节；需要个人事实时写入 needsUserInput，提示用户补充。
4. 不替用户宣称未经确认的立场，不承诺流量、收益或 X 官方原创资格。
5. 不要求点赞、回复、收藏、关注或转发。
只输出 JSON：{"suggestions":[{"angle":string,"contribution":string,"needsUserInput":string}]}`;
  }

  function normalizeContributionSuggestions(result) {
    const suggestions = Array.isArray(result?.suggestions) ? result.suggestions : [];
    return suggestions
      .map((suggestion) => ({
        angle: String(suggestion?.angle || '新增角度').trim(),
        contribution: String(suggestion?.contribution || '').trim(),
        needsUserInput: String(suggestion?.needsUserInput || '').trim()
      }))
      .filter((suggestion) => suggestion.contribution)
      .slice(0, 3);
  }

  function demoContributionSuggestions() {
    return normalizeContributionSuggestions({
      suggestions: [
        {
          angle: '独立判断',
          contribution: '我更关注的不是素材给出的结论，而是这个结论成立所依赖的条件。',
          needsUserInput: '请结合素材指出一个你认为最关键的成立条件。'
        },
        {
          angle: '边界反例',
          contribution: '这个观点可能忽略了不同规模、阶段或资源约束下的反例。',
          needsUserInput: '请补充一个你确实了解的场景或反例。'
        },
        {
          angle: '实践启示',
          contribution: '如果要把这个观点变成可执行建议，还需要说明由谁负责、如何验证以及失败边界。',
          needsUserInput: '请按你的实际情况补充责任人或验证方式。'
        }
      ]
    });
  }


  function buildOriginalContentPrompt(options = {}) {
    const type = options.type || ideaTypeNames.all;
    const format = contentFormatNames[options.format] ? options.format : 'post';
    const language = options.language || languageNames.zh;
    const profile = options.profile || '未提供账号定位';
    const contentLengthLimit = normalizeContentLengthLimit(options.contentLengthLimit);
    return `你是 X 原创内容助手，帮助用户把自己的判断、经验、观察或专业知识写成原创内容草稿，不自动发布。
当前主题为“${type}”，内容形态为“${contentFormatNames[format]}”，账号定位为“${profile}”。
原创规则：
1. 内容的主要价值必须来自用户新增的观点、分析、经验、背景或创意表达。
2. 可以参考已有帖子或事件，但不得只做摘要、同义改写、换序表达或增加空泛评价。
3. 不得虚构用户经历、身份、数据、来源、地点或现场细节；用户信息不足时，在 missingValue 中明确还缺什么。
4. originalityLevel 只能是 weak、adequate 或 strong；根据用户新增价值判断，不代表 X 官方资格或收益保证。
5. post 写成一条可独立成立的短帖；thread 写成 3–6 段有递进关系的长帖；article 写成标题、核心判断和结构化提纲。
6. 开头直接进入具体观察、反差或判断，避免标题腔、客服腔、AI 套话、泛泛鸡汤和营销腔。
7. 不要要求点赞、回复、收藏、关注或转发，不承诺流量或收益。
8. 涉及股票、医疗、法律、政治或其他高风险事实时，保持不确定性并提醒人工核验。
9. content 必须不超过 ${contentLengthLimit} 个字符，标点和换行也计入；这是最高优先级，必要时减少段落或提纲数量。
请使用${language}生成；非中文内容必须额外返回自然准确的中文翻译。
10. post 默认使用自然口语，不写“值得关注”等模板化开头；内容未被系统截断时，结尾不使用句号、问号或感叹号。
只输出 JSON：{"type":string,"format":"post|thread|article","originalityLevel":"weak|adequate|strong","originalityReason":string,"missingValue":string,"content":string,"translation":string}`;
  }

  function normalizeOriginalContent(result, fallback = {}) {
    const value = result || {};
    const format = contentFormatNames[value.format] ? value.format : (contentFormatNames[fallback.format] ? fallback.format : 'post');
    const originalityLevel = originalityLevelNames[value.originalityLevel]
      ? value.originalityLevel
      : 'weak';
    const contentLengthLimit = normalizeContentLengthLimit(fallback.contentLengthLimit);
    const constrainedContent = constrainOriginalContent(value.content, contentLengthLimit);
    const content = format === 'post' && !constrainedContent.wasTruncated
      ? removeTerminalPunctuation(constrainedContent.content)
      : constrainedContent.content;
    return {
      type: String(value.type || fallback.type || ideaTypeNames.all),
      format,
      originalityLevel,
      originalityReason: String(value.originalityReason || '尚未提供原创价值判断。').trim(),
      missingValue: String(value.missingValue || '').trim(),
      content,
      translation: String((value.translation ?? value.chineseTranslation ?? '') || '').trim(),
      contentLengthLimit,
      contentLength: [...content].length,
      wasTruncated: constrainedContent.wasTruncated
    };
  }

  function demoOriginalContent(input) {
    const type = input.type || ideaTypeNames.all;
    const format = contentFormatNames[input.format] ? input.format : 'post';
    const contribution = String(input.contribution || '').trim();
    return normalizeOriginalContent({
      type,
      format,
      originalityLevel: contribution ? 'adequate' : 'weak',
      originalityReason: contribution ? '已经包含用户自己的判断，可继续补充具体事实或案例。' : '尚未提供用户自己的判断。',
      missingValue: contribution ? '建议补充一个可核验的事实、真实案例或适用边界。' : '请补充你的判断、经验、观察或专业分析。',
      content: contribution ? `关于${type}，我更关注的是：${contribution}` : '',
      translation: ''
    }, { type, format, contentLengthLimit: input.contentLengthLimit });
  }

  function buildTweetRecommendationsPrompt(options = {}) {
    const sourceMode = options.sourceMode === 'trending' ? 'trending' : 'profile';
    const profile = String(options.profile || '未提供账号定位').trim();
    const topic = ideaTypeNames[options.topic] || ideaTypeNames.all;
    const language = options.language || languageNames.zh;
    const contentLengthLimit = normalizeContentLengthLimit(options.contentLengthLimit);
    const sourceRule = sourceMode === 'trending'
      ? '热点素材仅作可追溯参考；所有时效事实必须来自用户提供的素材，不得补造背景、数据或趋势。'
      : '只生成常青观点、观察或待验证问题；不得把近期事件、行情、新闻或平台热点写成已知事实。';
    const discussionRule = options.topic === 'zhihu'
      ? '围绕知乎长期高讨论度的话题生成：选择存在真实观点分歧、利益权衡或方法论争议的议题；不声称掌握实时热榜、具体热度或平台数据。'
      : '围绕所选主题中长期有广泛讨论且存在真实观点分歧、方案权衡或待验证问题的议题生成；不把无意义对立、煽动或情绪宣泄伪装成讨论。';
    return `你是 X 推荐推文助手。你只生成“推荐草稿”，不声称内容来自用户本人，不自动发布。
账号定位为“${profile}”。当前主题为“${topic}”。
推荐规则：
1. 输出恰好 3 条推荐草稿，每条只有一个可独立成立的观点，三条切入明显不同。
2. ${sourceRule}
3. 只围绕所选主题生成；当主题为“全部”时，选择最贴合账号定位的一个长期主题。
4. ${discussionRule}
5. 使用自然口语、具体观察和克制判断；避免标题腔、客服腔、总结腔、AI 套话、金句和营销腔。
6. 不得虚构用户经历、身份、数据、来源、地点或现场细节；不要求点赞、回复、收藏、关注或转发。
7. 美股、医疗、法律、政治等高风险主题只写观察与待验证问题；不得生成买卖建议、收益承诺或确定性结论。
8. 每条内容必须不超过 ${contentLengthLimit} 个字符，标点和换行也计入；每两句话组成一个段落，段落之间空一行；不足两句时保持自然完整。未被系统截断时结尾不使用句号、问号或感叹号。
请使用${language}输出。只输出 JSON：{"recommendations":string[],"rationale":string}`;
  }

  function normalizeTweetRecommendations(result, fallback = {}) {
    const contentLengthLimit = normalizeContentLengthLimit(fallback.contentLengthLimit);
    const recommendations = Array.isArray(result?.recommendations)
      ? result.recommendations
        .filter((recommendation) => typeof recommendation === 'string' && recommendation.trim())
        .map((recommendation) => {
          const constrained = constrainOriginalContent(
            formatTweetParagraphs(removeTerminalPunctuation(recommendation)),
            contentLengthLimit
          );
          return constrained.wasTruncated ? constrained.content : removeTerminalPunctuation(constrained.content);
        })
        .filter(Boolean)
        .slice(0, 3)
      : [];
    return {
      recommendations,
      rationale: String(result?.rationale || '').trim(),
      contentLengthLimit
    };
  }

  function demoTweetRecommendations(input = {}) {
    const sourceMode = input.sourceMode === 'trending' ? 'trending' : 'profile';
    const source = String(input.source || '').trim();
    const profile = String(input.profile || '这个账号').trim();
    const topic = source ? source.split('\n').filter(Boolean).at(-1) : profile;
    return normalizeTweetRecommendations({
      recommendations: [
        `比起追逐最新工具，我更在意${topic}背后那个长期没人维护的环节`,
        `真正值得反复验证的，不是${topic}有没有用，而是它在什么条件下会失效`,
        `把${topic}拆成一个具体问题，往往比急着给答案更接近有价值的讨论`
      ],
      rationale: sourceMode === 'trending' ? '基于用户选中的热门素材生成，建议核验其中事实。' : '基于账号定位生成常青观察，不包含近期事实判断。'
    }, input);
  }

  root.XReplyCopilotIdeaEngine = Object.freeze({
    languageNames,
    humanToneNames,
    humanToneDescriptions,
    detectReplyLanguage,
    ideaTypeNames,
    contentFormatNames,
    replyActionNames,
    buildInspirationCollectionPrompt,
    normalizeInspirationCollection,
    originalityLevelNames,
    normalizeContentLengthLimit,
    normalizeTweetLengthLimit,
    buildReplyPrompt,
    normalizeReplyResult,
    buildTweetOptimizationPrompt,
    normalizeTweetOptimization,
    buildContributionSuggestionsPrompt,
    normalizeContributionSuggestions,
    demoContributionSuggestions,
    buildOriginalContentPrompt,
    normalizeOriginalContent,
    demoOriginalContent,
    buildTweetRecommendationsPrompt,
    normalizeTweetRecommendations,
    demoTweetRecommendations
  });
})(globalThis);
