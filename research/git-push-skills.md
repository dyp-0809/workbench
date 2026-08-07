# Git push 相关 Agent Skill 与工作流调研

> 调研日期：2026-08-07  
> 范围：Claude Code、OpenAI/Codex、MCP/插件生态、Git 原生 hooks、GitHub CLI/Actions 与分支治理。本文只把官方文档、官方仓库和规范作为事实依据；“常见”表示典型使用场景，不表示可量化的市场份额。

## 1. 先定义术语：不要把“能运行 git push”都叫 Skill

| 术语 | 本文中的含义 | 能否成为强制安全边界 |
|---|---|---|
| **Agent Skill** | 供 Agent 按需加载的目录，通常至少含 `SKILL.md`（元数据 + 指令），可带脚本、参考资料和资源。Agent Skills 开放规范要求 `name`、`description`，并采用渐进式披露。 | 通常不能单独成为服务端强制边界；它是可复用的 Agent 工作流说明，脚本是否执行还取决于宿主权限。来源：[Agent Skills specification](https://agentskills.io/specification)。 |
| **Claude Code Skill / bundled skill** | Claude Code 的 Skill 兼容 Agent Skills，并扩展 `disable-model-invocation`、`allowed-tools`、`context: fork` 等字段。内置 `/code-review`、`/verify` 等属于 prompt-based bundled skill。 | `allowed-tools` 和调用策略可减少误操作，但 GitHub 分支保护仍是最终服务端约束。来源：[Claude Skills](https://code.claude.com/docs/en/skills)、[Commands](https://code.claude.com/docs/en/commands)。 |
| **命令（command）** | 用户显式输入的 `/name` 操作或 CLI 命令，如 `/code-review`、`gh pr create`。Claude Code 的自定义 `commands/` 已与 Skill 合并为同一调用入口，但内置命令有些是固定逻辑。 | 依赖用户/Agent 是否调用；普通命令不等于审批或分支策略。 |
| **Hook** | Git 的 `pre-commit`/`pre-push`，或 Claude Code 生命周期 Hook。前者是 Git 本地执行点，后者可在 `PreToolUse` 前拦截 Agent 工具调用。 | 本地 Hook 可被 `--no-verify` 绕过，也可能未安装；Claude Hook 只约束对应宿主。服务端规则仍必须配置。来源：[Git githooks](https://git-scm.com/docs/githooks)、[Claude Hooks](https://code.claude.com/docs/en/hooks)。 |
| **GitHub Action / workflow** | 仓库 `.github/workflows/*.yml` 中由事件触发的 CI/CD 自动化；不是 Agent Skill。可在 push/PR 后检查、部署或创建通知。 | 由 GitHub 执行，适合做共享、可审计的门禁；仍需限制 token、第三方 Action 和不可信 PR。来源：[Actions quickstart](https://docs.github.com/en/actions/get-started/quickstart)。 |
| **MCP Server / 插件** | MCP Server 通过标准协议向 Agent 暴露 GitHub 等工具；插件是分发 Skill、MCP 连接、脚本和元数据的包。MCP 工具可执行写操作，但不自动获得超出 GitHub 身份的权限。 | 权限依赖 OAuth/GitHub App/PAT、宿主审批和 GitHub 服务端规则；应按最小权限配置。来源：[GitHub MCP Server](https://github.com/github/github-mcp-server)、[治理说明](https://github.com/github/github-mcp-server/blob/main/docs/policies-and-governance.md)。 |
| **普通提示词** | 一次性要求“请提交并推送”，没有可复用的 Skill 文件、Hook 或服务器门禁。 | 最弱：模型可能漏检查、推错分支或把秘密放进提交；不能替代后端控制。 |

## 2. 代表性方案（按控制面拆分）

### 方案 A：Claude Code 的显式发布 Skill + 内置审查 Skill

**类型**：Agent Skill / 命令；不是 Hook、Action。

Claude Code Skill 由 `SKILL.md` 驱动，正文只在 Skill 被选中时加载；Skill 可以通过 `disable-model-invocation: true` 变成仅允许用户显式调用的任务型流程，也可以用 `allowed-tools` 预批准本轮可用工具、用 `context: fork` 放到子 Agent 中执行。[Claude 官方文档](https://code.claude.com/docs/en/skills)还明确建议把部署类任务写成手动触发的 Skill，而不是让模型自动触发。

可组合的内置命令包括：

- `/diff`：先查看工作树变更；
- `/code-review`（bundled **Skill**）：审查当前 diff/分支/PR，可选择 `--fix` 或 `--comment`；
- `/security-review`：检查 diff 的安全风险；
- `/autofix-pr`：监视当前分支 PR，在 CI 失败或出现 review comment 时推动修复；官方说明它会使用 `gh` 并向 PR 分支推送修复，默认尝试修复所有 CI 失败和 review comment。[Commands reference](https://code.claude.com/docs/en/commands)。

**适合**：开发者希望“先审查、再由人确认、最后推送”的可重复本地流程；也适合将 `git status`、diff、分支名、测试/静态检查结果和发布说明固定成清单。

**能力边界与风险**：

- Skill 是模型指令，不是 GitHub 的强制规则；`git push` 是否获准仍受 Claude Code 权限设置、Git 凭据和 GitHub 分支保护影响。
- `allowed-tools` 不能替代服务端最小权限；若把 `Bash` 或网络操作过度预批准，可能放大误推/数据外传风险。
- `/autofix-pr` 明确包含“自动推送修复”，应只对受保护的非生产分支启用，禁止默认让它触碰 `master` 或带发布凭据的环境。
- `/code-review` 是审查辅助，不是通过即安全的证明；它不能替代必需的 CI、CODEOWNERS、分支保护。

### 方案 B：Claude Code `PreToolUse` Hook 拦截危险 Git 命令

**类型**：Claude Code Hook；不是 GitHub Action，也不是 Skill 本身。

Claude Code 的 `PreToolUse` 会在工具调用执行前触发，Hook 可按工具名和命令模式匹配，并返回 `permissionDecision: "deny"` 阻止调用。官方示例使用它拦截 `rm -rf`；同一机制可收窄到 `Bash` 的 `git push`、`git push --force`、直接推送 `master`、把 token 拼入 URL 等模式。[Hooks reference](https://code.claude.com/docs/en/hooks)。

**适合**：把本地 Agent 的高风险动作变成显式确认，例如：

1. `git push --force`/`--force-with-lease` 一律拒绝；
2. 当前分支为 `master` 时拒绝直接 push，只允许 `gh pr create`；
3. 检测暂存区中的疑似密钥并阻止 `git commit`；
4. 允许推送到 `feature/*`，但对远端和分支做精确 allowlist。

**能力边界与风险**：

- Hook 的 matcher/脚本解析不应只做脆弱字符串匹配；Shell 引号、别名、脚本间接调用、`git -C` 等情况需要谨慎处理。
- Hook 可在项目、个人或插件级配置，企业还可以用 managed settings 限制 Hook 来源；但云端/其他宿主不一定读取本机 `~/.claude/settings.json`。[Hooks locations](https://code.claude.com/docs/en/hooks)。
- Hook 的“静默退出”只表示不作决定，不等于显式批准；官方示例说明无决定时仍进入正常权限流程。
- 它无法阻止用户直接在另一个终端执行 Git，也不能替代 GitHub branch protection。

### 方案 C：Codex Skill / plugin 的提交发布流程

**类型**：Agent Skill + plugin 分发；不是 Git Hook。

OpenAI 的官方文档说明，Codex/ChatGPT Skill 是带 `SKILL.md` 的目录，可按 `$skill-name` 显式调用，也可由 `description` 隐式匹配；可放在仓库 `.agents/skills`、用户、管理员或系统目录。需要跨项目分发时，官方建议把一个或多个 Skill 打包为 plugin；`agents/openai.yaml` 可配置是否允许隐式调用以及 MCP 依赖。[Build skills](https://learn.chatgpt.com/docs/build-skills)、[OpenAI plugins](https://github.com/openai/plugins)。

OpenAI 官方 `skills` 仓库曾提供 `gh-fix-ci` 等示例，但仓库 README 当前标注 **deprecated**，并建议改用 OpenAI Plugins；因此它适合参考 Skill 结构，不能把该仓库当成持续维护的 Git push 产品或安全认证来源。[openai/skills README](https://github.com/openai/skills)、[gh-fix-ci](https://github.com/openai/skills/tree/main/skills/.curated/gh-fix-ci)。

**适合**：团队在 Codex 与 Claude 间共享“检查 diff → 运行项目已有检查 → 创建 PR → 等待 CI → 人工批准”的意图层流程；将平台差异放进插件元数据或参考文件，而不是把令牌写在 Skill 中。

**风险**：

- 隐式 Skill 可能在不应发布时被自动选中；发布、部署、推送类 Skill 应设置为显式调用或至少要求明确用户确认。
- `SKILL.md` 仍是指令，不是权限系统；任何脚本/MCP 工具都要单独审查。
- 安装第三方 Skill/plugin 等于引入可执行脚本和新工具连接；必须审核来源、版本、权限和网络目的地。Agent Skills 规范中 `allowed-tools` 还是实验字段，跨宿主支持可能不同。[规范](https://agentskills.io/specification)。

### 方案 D：Codex 沙箱 + 审批策略作为 Agent 运行时安全层

**类型**：Agent 运行时安全配置；不是 Skill/Hook/Action。

Codex 官方安全文档把控制拆成两层：sandbox mode 决定技术能力（可写目录、网络），approval policy 决定何时必须询问。CLI/IDE 默认网络关闭、写权限限于当前 workspace；`workspace-write + on-request` 是典型 Auto 预设，访问网络或 workspace 外部操作需审批；`read-only` 适合只审查。`--yolo`/`danger-full-access` 会关闭沙箱和审批，官方标为不推荐。[Agent approvals & security](https://learn.chatgpt.com/docs/agent-approvals-security)。

对于 Git push，推荐：

- 本地准备阶段：`read-only` 或 `workspace-write + on-request`；
- Agent 只提交到 feature 分支，推送前要求用户审批；
- CI 中用 `codex exec` 做只读 review，禁止给它 Git 写凭据；
- 不使用 `--yolo` 作为默认发布方式。

**边界**：沙箱只能限制 Agent 进程对本机和网络的能力，不能改变 GitHub 对仓库的权限；有写权限的 Git 凭据一旦被 Agent/脚本看到，仍可能被误用。网络打开后还要使用域名 allowlist；OpenAI 文档提醒外部网页和提示注入内容应按不可信数据处理。

### 方案 E：Git 原生 `pre-commit` / `commit-msg` / `pre-push` Hook

**类型**：Git Hook；不是 Agent Skill。

Git 官方定义：`pre-commit` 可在提交前检查并以非零状态拒绝提交，`commit-msg` 可检查提交消息；`pre-push` 在 `git push` 调用时执行，可以阻止本次 push，并从标准输入获得将要推送的 ref/object 信息。[Git hooks documentation](https://git-scm.com/docs/githooks)。

**典型工作流**：

1. `pre-commit`：格式、语法、敏感文件/密钥扫描；
2. `commit-msg`：提交消息格式、关联 issue；
3. `pre-push`：根据远端和目标 ref 拒绝直接推保护分支，执行轻量 smoke check；
4. GitHub Actions 再做可信的共享检查。

**能力边界与风险**：

- `pre-commit` 与 `commit-msg` 可由 `--no-verify` 绕过；本地 Hook 也可能因 clone、权限或 `core.hooksPath` 未配置而缺失。
- 不宜在 `pre-push` 放耗时且不稳定的全量构建，否则开发者会倾向于绕过；关键检查要移到 Actions/branch protection。
- Hook 不应把 API Key 或 PAT 写进日志；脚本应避免将秘密拼接到命令行参数。

### 方案 F：GitHub CLI `gh pr create` 作为“推送到分支 + 开 PR”命令

**类型**：命令/CLI 工作流；不是 Skill 或 Action。

`gh pr create` 会创建 PR 并输出 URL；如果当前分支尚未推到远端，CLI 会询问推送位置/是否创建 fork。`--head`、`--base`、`--draft`、`--reviewer`、`--no-maintainer-edit`、`--dry-run` 等参数分别控制来源、目标、草稿、审阅者、维护者改动权限和预览。[GitHub CLI manual](https://cli.github.com/manual/gh_pr_create)。

**适合**：Agent 完成检查后只操作 feature 分支，用显式参数创建草稿 PR；让人工审查和 GitHub 门禁负责合并，不让 Agent 直接更新生产分支。

**风险/注意**：

- `--dry-run` “可能仍会 push git changes”，不能把它当成绝对无副作用的演练；文档明确提醒了这一点。
- 若不写 `--base`，CLI 会使用分支配置的 `gh-merge-base` 或仓库默认分支；Agent 应先读取当前分支和目标，禁止凭猜测推送 `main/master`。
- 默认允许 base 仓库有写权限的维护者修改 PR head 分支；需要严格控制时使用 `--no-maintainer-edit`。
- CLI 只负责 API 操作，不能绕过分支保护和必需状态检查。

### 方案 G：GitHub Actions 的 push/PR 检查与 Pages/发布工作流

**类型**：GitHub Action/workflow；不是 Agent Skill。

GitHub Actions 可在 push 时运行 CI，也可在 PR 合并后部署；工作流文件放在 `.github/workflows`。官方 quickstart 还提供 CI、deployment、automation、code scanning 等 starter workflows。[Actions quickstart](https://docs.github.com/en/actions/get-started/quickstart)。

**常见组合**：

- `pull_request`：语法/测试/密钥扫描和变更审查；
- `push` 到默认分支：发布/Pages 部署；
- `workflow_dispatch`：人工重试/回滚；
- 环境 required reviewers：部署到生产前批准；
- `concurrency`：取消旧部署，避免并发发布覆盖。

**安全事实**：GitHub 建议 `GITHUB_TOKEN` 默认只读、按 job 提升最小权限；敏感数据放 secrets，不要明文写 workflow；第三方 Action 最安全是固定到完整 commit SHA，并审核其源码。`pull_request_target`/`workflow_run` 具备更高权限，不应 checkout 不可信 PR 代码；自托管 runner 运行不可信代码时可能持久化受害，公开仓库几乎不应使用普通 self-hosted runner。[Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use)。

**适合**：把“所有人都必须遵守”的检查和部署放在仓库服务端；Agent 只负责准备提交/PR，不把本地模型判断当成发布门禁。

### 方案 H：GitHub branch protection / ruleset 作为最终回滚与推送防护

**类型**：GitHub 服务端治理；不是 Skill/Hook/Action。

保护分支默认禁止 force push 和删除，可要求 PR review、状态检查、conversation resolution、签名提交、线性历史、merge queue、部署成功、限制谁能 push，并可禁止管理员绕过。要求 review 后，更新受保护分支必须经过达到数量的批准 PR；要求 status checks 后，检查必须成功/跳过/中立才能合并。[About protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)。

**对 push/回滚的价值**：

- 禁止直接 push 生产分支，强制 PR + CI；
- 默认拒绝 force push，避免已被他人引用的提交从历史消失；GitHub 文档明确说明 force push 可能造成冲突、损坏 PR，甚至把未批准提交指向分支；
- 启用线性历史后，revert 更易审计；回滚也应通过受保护 PR，而不是 Agent 私自重写历史；
- 若需要部署门禁，可要求指定 environment 部署成功后才允许合并。

**边界**：规则配置错误、状态检查名称重复或管理员 bypass 仍可能造成门禁失效；规则只覆盖 GitHub 仓库，不能控制本地工作树是否泄漏秘密。

### 方案 I：官方 GitHub MCP Server / MCP + GitHub App、OAuth 或 PAT

**类型**：MCP Server + 工具调用；不是 Skill。可与 Claude、Codex 等宿主组合。

GitHub 官方 MCP Server 能读仓库/提交，创建和管理 issue/PR，查看 Actions 运行与发布等；远程服务地址为 `https://api.githubcopilot.com/mcp/`，也提供本地模式。官方治理文档说明所有操作都需要认证，权限仍受 GitHub 原生 API 模型限制；支持 GitHub App installation token、OAuth authorization code 和 PAT 等方式。[GitHub MCP Server](https://github.com/github/github-mcp-server)、[Policies & Governance](https://github.com/github/github-mcp-server/blob/main/docs/policies-and-governance.md)。

**适合**：让 Agent 查询 PR/CI 状态、创建草稿 PR、读取失败日志，再把实际合并和生产部署交给 GitHub 门禁。对跨平台 Agent，MCP 比每个宿主分别实现 GitHub API 更统一。

**风险/边界**：

- PAT 是用户范围凭据；官方治理文档推荐细粒度 PAT、仓库级限制和定期轮换，且不建议把用户 PAT 用于生产自动化。OAuth/App 也需要组织批准、仓库选择和权限审核。
- MCP 有写工具并不表示安全批准；宿主审批、GitHub App 权限、branch protection 三层都应存在。
- 当前 GitHub MCP 的 MCP 专用审计仍以普通 API/audit log 为主，并没有完整的“哪个 MCP 工具做了什么”专用实时面板；需要保留 GitHub 审计和 workflow 日志。
- 第三方 MCP server 或插件的脚本、网络请求和 token 传递必须审查；优先官方 Server，限制 toolset 和仓库范围。

## 3. 能力、风险、适用场景横向对比

| 方案 | 能力 | 主要风险/盲点 | 适用场景 | 是否应作为最终门禁 |
|---|---|---|---|---|
| Claude 显式 Skill + `/code-review` | 可复用检查清单、diff 审查、PR 评论、人工触发 | 模型可能漏步骤；Skill 本身不强制 GitHub 规则 | 本地开发与 PR 准备 | 否 |
| Claude `PreToolUse` | Agent 执行 `git push` 前拒绝危险命令/分支 | 仅限 Claude 宿主；匹配器/脚本有误判，其他终端可绕过 | 防止误推和 force push | 否，作为本地第二道门 |
| Codex Skill/plugin | 跨仓库复用指令、脚本、MCP 依赖 | 第三方 Skill 供应链；隐式调用和脚本权限 | Codex/Claude 统一流程 | 否 |
| Codex sandbox/approval | 限制 workspace、网络和高风险命令需审批 | 凭据一旦放入 Agent 环境仍可被滥用；`--yolo` 风险高 | Agent 执行前运行时防护 | 否 |
| Git `pre-commit`/`pre-push` | 本地提交前/推送前检查并可拒绝 | 可 `--no-verify`；未安装或跨机器不一致 | 快速反馈、阻止常见误操作 | 否 |
| `gh pr create` | 标准化创建 draft PR、审阅者、base/head | dry-run 仍可能 push；目标分支默认值可能误导 | feature 分支交付 PR | 否 |
| GitHub Actions | 共享 CI、发布、环境审批、部署记录 | token/Action/不可信 PR 注入；runner 风险 | CI/CD 和自动发布 | 可做状态门禁 |
| Branch protection/ruleset | 禁止直接 push/force push，强制 review、CI、签名、部署 | 配置/管理员 bypass/检查名冲突 | 生产分支治理、回滚审计 | **是** |
| 官方 GitHub MCP | Agent 查询/创建 PR、观察 Actions、自动化 GitHub API | PAT/OAuth/App 范围、写工具和提示注入 | 多宿主 GitHub 协作自动化 | 否，必须叠加 GitHub 规则 |

## 4. 对当前 X Assistant 项目的建议组合

### 已知项目边界（来自仓库现状）

项目是 Chrome 扩展 + 静态 H5 + iOS 快捷指令；README 明确写着“人工确认后发布”，不会自动发布 X 回复，也不读取 X Cookie、密码或 Token。[项目 README](../README.md)。当前 Pages workflow 仅监听 `master` 上 `h5/**` 或自身 workflow 变化，并声明 `contents: read`、`pages: write`、`id-token: write`，配置了 `concurrency`，部署到 GitHub Pages；Bark 通知从 Actions secrets 读取。[Pages workflow](../.github/workflows/pages.yml)。

### 推荐的最小充分组合

1. **分支服务端门禁（必须）**
   - 对 `master` 配置 branch protection/ruleset：禁止 force push 和删除；要求 PR、至少一名审查者、CI 状态成功；可要求最近一次变更由非推送者批准。
   - 允许 Agent 只推 `feature/*`，不允许其直接推 `master`。回滚使用新的 revert PR，不使用 force push 改写 `master` 历史。
   - 若仓库有管理员 bypass 权限，启用“Do not allow bypassing”或至少审计 bypass。

2. **Agent 本地流程（推荐）**
   - 在 Claude Code 或 Codex 中建立显式 `prepare-pr` Skill：读取当前分支与远端、`git diff`、运行 README 中的 `node --check`/JSON 检查，扫描待提交文件是否包含 API Key，再输出摘要；未获明确确认不执行 `git commit`/`git push`。
   - Claude 使用 `/code-review` + `/security-review`；Codex 使用只读 review 或 `codex exec`。发布/推送类 Skill 设置显式调用，避免隐式触发。
   - 添加 Claude `PreToolUse` 或 Git `pre-push` 规则，至少阻止 `git push --force*` 和向 `master` 直接 push；注意两者都是辅助门禁，不能替代 GitHub 规则。

3. **PR 交付（推荐）**
   - Agent 先执行 `gh pr create --draft --base master --head <feature>`，使用显式 `--base`，创建后等待 CI 和人工审阅。
   - 需要严格控制维护者修改权限时使用 `--no-maintainer-edit`；不要把 `--dry-run` 当成零副作用测试。
   - 暂不建议在本项目启用 Claude `/autofix-pr` 的自动推送模式；若启用，应限定 feature 分支、无生产部署凭据，并保留人工合并。

4. **Actions/Pages（继续使用，但强化供应链）**
   - 保持 workflow 级 `permissions` 最小化，Pages 所需的 `contents: read`、`pages: write`、`id-token: write` 不要扩大到 `contents: write`。
   - 将第三方 Actions 从可变 tag 逐步固定到完整 commit SHA，并由 Dependabot/人工审查更新；检查 workflow 的 shell 输入，尤其不要把 PR 标题、提交消息直接插入未引用的 shell 代码。
   - `BARK_KEY` 等 secrets 继续只放 GitHub secrets；不要把 H5 用户的 DeepSeek API Key 放到 Actions。通知步骤只处理已部署 URL 和短 SHA，避免日志输出 secret 或未脱敏错误。
   - `master` 保护 + Pages workflow 的 `push` 发布形成“PR 检查后合并、合并后发布”；不需要 Agent 获得 Pages 写权限。

5. **MCP（可选、只读优先）**
   - 若日后要让 Agent 查询 Actions/PR，优先官方 GitHub MCP Server 的只读 toolset；写操作仅用于创建 draft PR，不授予删除、force push 或生产发布所需的额外权限。
   - 认证优先 OAuth 或仓库范围的细粒度 PAT/GitHub App；严禁把 PAT 写入 Skill、prompt、仓库或 workflow 日志。组织应设置 PAT 过期/轮换和 SSO/应用批准策略。

### 不推荐的组合

- “一句普通提示词 + `git push origin master`”：没有可审计清单和服务器门禁。
- Agent 运行在 Codex `--yolo` 或 Claude 全自动宽权限下，并暴露个人 PAT、Pages 写权限或部署 secrets。
- 用 `pull_request_target` checkout 外部 fork 的不可信代码后再把 secrets/GITHUB_TOKEN 交给它。
- 依赖一个第三方 Git push Skill/MCP plugin 就视为安全；所有外部 Skill、插件、Action、MCP server 都必须审核源代码、版本固定、工具范围和网络目的地。

## 5. 结论

Git push 的可靠方案不是单个 Skill，而是分层组合：

> **Agent Skill/命令负责流程与可读性 → 本地 Hook/沙箱负责尽早拒绝误操作 → `gh pr create` 负责标准化交付 → GitHub Actions 负责共享检查和部署 → branch protection/ruleset 负责不可绕过的生产门禁 → MCP 仅在最小权限和明确审批下扩展 Agent 的 GitHub 读写能力。**

对于当前项目，最合适的是“feature 分支 + 显式 PR Skill + `/code-review`/只读 Codex review + 本地防 force-push Hook + GitHub branch protection + Pages Actions 自动部署”。项目已有“人工确认发布”和 Pages 最小权限方向，建议保持；Agent 不应直接取得 X 发布能力、DeepSeek 用户 Key、Bark secret 或生产分支写权限。
