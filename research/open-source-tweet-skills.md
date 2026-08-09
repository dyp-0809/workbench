# 开源 X/Twitter 写作 Skill 调研

调研日期：2026-08-09

## 范围、方法与本项目基线

本报告只采用候选仓库自身的 `README`、`LICENSE` 与实际 `SKILL.md` 作为候选事实来源；没有把博客或 GitHub 聚合页当作证据。链接均指向调研时读取的默认分支文件，后续引入前应固定到具体 commit 并复核许可证。

本项目已有的不可退让基线来自 [`h5/idea-engine.js:191–210`](../h5/idea-engine.js#L191-L210)：

- 用户的新增判断、经验、分析、背景或创意表达必须是主要价值，不能仅摘要或改写参考素材；
- 不得虚构用户经历、身份、数据、来源、地点或现场细节；信息不足时必须显式指出缺什么；
- 生成只是草稿，不能自动发布；禁止索取点赞、回复、收藏、关注或转发，也不能承诺流量或收益；
- 原创短帖必须服从用户字数上限（默认 100，界面允许 20–2000）；开头直接进入具体观察、反差或判断，避免 AI 套话；高风险事实需提示人工核验。

README 还确认项目把热点带入原创创作、支持人工确认后才发布，并不读取 X Cookie/Token 或自动发布：[README.md:7–23](../README.md#L7-L23)。以下“匹配”均以这组基线衡量。

## Agent Skills 生态的可复用边界

[Agent Skills Specification](https://agentskills.io/specification) 定义了一个最小可移植单元：目录内至少有带 YAML frontmatter 的 `SKILL.md`，其中 `name`、`description` 必填，`license` 可选；脚本和参考资料可按需加载。该规范还建议主 `SKILL.md` 少于 500 行、复杂材料拆至引用文件。这是**已验证的格式事实**，不是对任何候选质量的背书。

因此，本项目不应“安装一个仓库然后让它接管写作”。更安全的复用粒度是：抽取经过审查的、纯提示词层规则，保留本项目 JSON 输出、用户新增价值输入、字符截断与人工确认的既有执行链。

## 候选一：`x-twitter-growth`（Alireza Rezvani / claude-skills）

- 仓库与关键文件：[`alirezarezvani/claude-skills`](https://github.com/alirezarezvani/claude-skills)，[`README.md`](https://github.com/alirezarezvani/claude-skills/blob/main/README.md)，[`LICENSE`](https://github.com/alirezarezvani/claude-skills/blob/main/LICENSE)，[`marketing-skill/skills/x-twitter-growth/SKILL.md`](https://github.com/alirezarezvani/claude-skills/blob/main/marketing-skill/skills/x-twitter-growth/SKILL.md)。
- 许可证 / 可复用性（**已验证**）：根目录 `LICENSE` 是 MIT（copyright 2025 Alireza Rezvani）；目标 `SKILL.md` frontmatter 也标注 `license: MIT`。MIT 允许复制、修改和分发，但复制实质内容时必须保留版权和许可声明。
- 形态（**已验证**）：Skill 的触发范围包括写 tweet/thread、X 增长、竞品研究、内容策略和互动优化。输入是账号、话题、受众、竞品账号等，正文指导调用 `profile_auditor.py`、`competitor_analyzer.py`、`tweet_composer.py` 与 `content_planner.py`；输出包含短帖/Thread 草稿、竞品模式和内容日历，而非本项目所需的固定 JSON 契约。
- 与闭环的匹配（**推断**）：它覆盖“热点/竞品研究 → 写作”前段，且 atomic tweet 的“一帖一个观点”与本项目短帖目标相符；但没有要求用户给出新增价值、没有人工确认 gate，也未把用户自定义字符上限作为硬约束。只能借鉴规则，不能整包引入。
- 可直接借鉴（**已验证为其 Skill 中的规则；采用与否是本项目决策**）：
  1. quote tweet 必须补充原帖遗漏的数据、反例、细微差别或真实个人经验，不能只写 `This` / `So true`；这可改写为本项目的“参考素材必须被用户新增价值超越”。
  2. atomic tweet 坚持一个想法，且正文不应成为文字墙；适合追加为短帖的可读性检查，而非替代现有字符硬上限。
  3. Thread 中每条应可独立成立、按钩子—上下文—逐点展开—总结组织；可用在本项目 thread 草稿的结构检查。
  4. 竞品研究明确先提取 hook、主题、格式和互动模式，再生成内容；可转为“热点候选显示来源与观察，用户确认并补充自己的角度后才写作”。
- 明显风险（**已验证事实 + 推断**）：该文件把“回复/互动权重”“链接会被惩罚”“每日发帖数”等表述为算法机制，却未在 Skill 内给出 X 官方证据；这些属于**不可直接当成平台事实的推断**。其“问题帖驱动回复”“CTA”“首条回复放链接”“一天多帖”等增长导向，也与本项目禁止互动诱导、强调原创和人工确认的边界冲突。
- 结论：**推荐选择性吸收，不推荐引入整个 Skill 或其脚本。** 仅采纳“单一观点”“引用必须有独立增量”“结构递进”三类写作检查；明确排除算法权重、强制 CTA、发帖频率、互动指标和自动化流程。

## 候选二：`voice-builder` 与 `niche-research`（Charlie Hills / social-media-skills）

- 仓库与关键文件：[`charlie947/social-media-skills`](https://github.com/charlie947/social-media-skills)，[`README.md`](https://github.com/charlie947/social-media-skills/blob/main/README.md)，[`LICENSE`](https://github.com/charlie947/social-media-skills/blob/main/LICENSE)，[`skills/voice-builder/SKILL.md`](https://github.com/charlie947/social-media-skills/blob/main/skills/voice-builder/SKILL.md)，[`skills/niche-research/SKILL.md`](https://github.com/charlie947/social-media-skills/blob/main/skills/niche-research/SKILL.md)。
- 许可证 / 可复用性（**已验证**）：根目录 `LICENSE` 是 MIT（copyright 2026 Charlie Hills）。README 说明各 Skill 是 Markdown 工作流，可插件、复制目录或 Git submodule 方式安装；它也要求先运行 `voice-builder`，其他 Skill 再读取共享声音文件。
- 输入输出形态（**已验证**）：
  - `voice-builder` 先采访账号定位、受众、主题、不同观点、品牌承诺与禁区，再要求至少 3 篇样本；输出根目录 `about-me.md`（小于 300 词）和 `voice.md`（小于 500 词）。它要求从多样本共同模式提取句长、节奏、开头、结尾、用词及“从未出现”的缺失信号，样本矛盾必须写明，不能用通用填充词或臆造模式。
  - `niche-research` 输入一个 niche 或从 `about-me.md` 读取 niche；优先用浏览器扫描 Reddit、X、Google，逐项验证发布日期，严格排除超过 7 天的条目；输出固定列的 Markdown 表（主题、平台、来源、链接、注意力信号、事实/争议、影响、可分享角度）。无法真正浏览时要求说明缺什么，不允许伪造扫描结果。
- 与闭环的匹配（**推断**）：这是三个候选中与“热点 → 用户增量 → 原创短帖”最互补的一组：`niche-research` 可给热点候选提供日期与链接，`voice-builder` 的样本分析可支撑真人口吻；但它主要面向 Claude Cowork / LinkedIn，输出文件和英语写作规则不能直接塞进本项目的即时浏览器扩展流程。它同样没有本项目的新增价值输入、`originalityLevel`、字符上限或“人工确认后发布”契约。
- 可直接借鉴（**已验证为其 Skill 中的规则；采用与否是本项目决策**）：
  1. 热点候选必须逐项验证可见发布日期，日期不清或超出 7 天即排除；每项带代表链接。这个规则可直接改善热点候选的可追溯性。
  2. 不足 20 个合格主题时宁可少给，不能用弱项填满；可直接作为热点发现的质量下限。
  3. 口吻应从至少 3 篇用户样本中的共同模式和明确的缺失模式归纳，不能凭空预设“人味”；可将结果存为用户可编辑的本地 profile，而不是复制作者的声音。
  4. 样本相互矛盾时应保留矛盾而非抹平；这比单一“人味等级”更能避免假真人口吻。
- 明显风险（**已验证事实 + 推断**）：`niche-research` 明确需要可控制的实时浏览，README 还披露部分其他技能依赖 `APIFY_API_TOKEN` / `GOOGLE_AI_API_KEY`；这与本项目不读取 X Cookie/Token 的隐私边界不自动兼容。`voice-builder` 的指令规定英式英语、禁用 em dash，并写入项目根目录；这些是作者工作流偏好，不能覆盖本项目多语言、用户字符上限或既有目录。文档还允许用户给“欣赏的作者”样本，若直接照搬会有模仿他人风格的伦理与版权风险。
- 结论：**推荐拆分吸收两项规则，不推荐 vendor 整个仓库。** 采用“可验证日期/链接、不过量填充”的热点筛选和“多样本、含缺失信号、用户可编辑”的本地口吻档案；保持本项目人工确认、原创增量和 20–2000 字符限制优先，禁止默认抓取或上传敏感凭据。

## 候选三：`xurl`（Nous Research / hermes-agent）

- 仓库与关键文件：[`NousResearch/hermes-agent`](https://github.com/NousResearch/hermes-agent)，[`README.md`](https://github.com/NousResearch/hermes-agent/blob/main/README.md)，[`LICENSE`](https://github.com/NousResearch/hermes-agent/blob/main/LICENSE)，[`skills/social-media/xurl/SKILL.md`](https://github.com/NousResearch/hermes-agent/blob/main/skills/social-media/xurl/SKILL.md)。Skill 的 frontmatter 还指向其上游 [`xdevplatform/xurl`](https://github.com/xdevplatform/xurl)。
- 许可证 / 可复用性（**已验证**）：Hermes 根目录 `LICENSE` 是 MIT（copyright 2025 Nous Research），`xurl/SKILL.md` frontmatter 写明 `license: MIT`。README 明确称 Hermes 兼容 [agentskills.io](https://agentskills.io) 开放标准，故其文件结构可作为跨 Agent Skill 的技术参考。
- 输入输出形态（**已验证**）：Skill 依赖本地 `xurl` CLI 和用户自行配置的 OAuth；输入是搜索查询、post ID、文字或媒体，命令输出 JSON。它能搜索、读取、发布、回复、引用、点赞、转发、关注、私信和上传媒体。其安全段落明确禁止 Agent 读取、打印、上传或要求用户粘贴 `~/.xurl`，禁止带内联密钥的命令与 verbose 模式，并要求用户在 Agent 会话外完成认证。
- 与闭环的匹配（**推断**）：`xurl search` 的原始帖子 JSON 可作为可核查热点素材，因此只在“受用户授权的热点读取”阶段有潜在价值；但它完全不解决原创增量、真人口吻或短帖创作，且提供直接发帖与社交动作，和本项目的“仅复制草稿、人工确认、绝不自动发布”相反。
- 可直接借鉴（**已验证为其 Skill 中的规则；采用与否是本项目决策**）：
  1. 凭据不进入模型上下文，认证由用户在会话外手工完成；只用无敏感输出的状态检查。
  2. 搜索结果保留原始帖子 ID、作者和全文，再把它们当作可追溯参考，而非让模型凭记忆概括热点。
  3. 若未来接入任何 X API，Skill 的“工具只返回 JSON”边界值得保留，便于将获取、筛选、创作和人工发布分层。
- 明显风险（**已验证事实 + 推断**）：它的能力含 `post`、`reply`、`like`、`repost`、`follow` 和 DM；若完整引入，会直接违反本项目不自动填写/发布/互动的产品边界，并增加 OAuth 权限、速率限制、X API 付费与合规风险。Skill 内的密钥安全规则虽好，不能消除“Agent 被赋予发帖能力”本身的风险。
- 结论：**不推荐引入 Skill 或 CLI 作为产品依赖。** 可借鉴其秘密隔离和 JSON 数据边界；若以后在用户明确授权下增加热点检索，也只能设计成只读、最小权限、结果可见、不可由 Agent 触发发布的独立适配层。

## 最终建议：可落地的最小规则集

以下是从候选中筛出的规则，不复制任何仓库的完整 prompt，也不改变当前产品行为：

1. **热点证据卡**：热点候选必须保留来源链接、作者/帖子标识和可验证日期；日期缺失或不在配置时间窗的候选不进入推荐。来源模式：`niche-research`。
2. **先增量、后成文**：将热点只作为参考，先要求用户选定或改写新增判断、反例、实践启示或待验证问题；没有新增价值时返回“不建议写”。来源模式：`x-twitter-growth` 的 quote tweet 增量原则，与本项目现有原创规则一致。
3. **一条一个可独立成立的判断**：短帖围绕一个主张，不用文字墙；Thread 再使用递进且单段可独立理解的结构。来源模式：`x-twitter-growth`。
4. **口吻以用户证据为准**：收集至少 3 篇用户授权样本，提取共同的正向模式和缺失模式；不把缺失模式臆造成事实，矛盾必须展示给用户并允许修改。来源模式：`voice-builder`。
5. **仍由本项目规则兜底**：所有草稿继续受用户字符上限、非虚构、风险事实人工核验、禁止互动诱导与人工确认发布约束；不采用“算法权重”“每日发帖量”“默认 CTA/首评放链接”等未被候选引用官方证据的增长断言。
6. **不授予发布能力**：即使未来添加只读热点数据源，也不读取 Cookie/Token、不把凭据放进模型上下文、不暴露发帖/互动工具；保留复制草稿后由用户自行发布的 cutover。来源模式：`xurl` 的密钥隔离规则与本项目 README 的现有边界。

## 明确的不引入项

- 不 vendor 任一完整仓库、脚本或 CLI：它们的运行时、输出格式、平台假设与本项目浏览器扩展不一致，且会扩大供应链与维护面。
- 不将候选中的互动增长配方写成 X 平台事实；候选 Skill 没有为这些算法权重、频率或链接处理结论提供 X 官方来源。
- 不复制第三方作者声音，不以“真人口吻”为由编造经历，也不绕过用户确认直接发帖或互动。
