# X Assistant

X Assistant 是一个面向 X 用户的内容辅助工具，帮助发现可复用话题、形成原创内容、优化推文，并在适合时生成回复草稿。项目包含本地工作台（React）、Chrome 浏览器扩展、GitHub Pages H5 页面和 iOS 快捷指令。

## 功能

- 以「原创创作」为默认入口，可读取当前 X 帖子、带入当前页热门候选，或在 H5 从粘贴板带入热门话题；素材来源会明确显示且可随时清空；
- 可先根据参考素材生成三份不同的新增价值候选，再由用户选择、修改或补充自己的判断、经验、分析、反例或背景；
- 支持原创短帖、Thread 和 Article 三种内容形态，并给出原创增量判断与补充建议；
- 原创内容默认不超过 100 个字符，用户可在 20–2000 个字符之间调整上限；
- 读取当前 X 帖子和当前页面已加载的可见评论；
- 热门候选会保留作者、链接、读取时间和互动快照，再一键带入原创创作作为可追溯参考素材；
- Chrome 扩展提供「灵感集合」标签：以接入的大模型为主要来源，按用户定义一次生成 10 条讨论灵感，支持手动刷新和复制；模型可能不具备实时联网能力，时效事实需要人工核验；
- Chrome 扩展提供「发布计划」标签：可从灵感集合、原创草稿、推荐草稿和优化文案加入本地待发布队列，保存本地计划时间，复制并打开 X 撰写页后由用户使用原生日历确认；不会自动填写、定时或发布；
- 本地工作台提供待办事项、到期与提醒（支持单次、周期自动滚动、周期手动确认三种模式，Bark 手机推送）等模块；
- 生成回复判断、风险提示、切入角度和多条回复草稿；
- 回复决策会在直接回复、原创短帖、扩展长帖和暂不发布之间给出动作建议；
- 回复草稿支持 1–5 档人味程度，默认使用中间档“平衡”；
- 原创短帖和回复草稿默认使用自然口语，正常生成时不以终止标点收尾；原创内容按字数上限截断时保留省略号提示；
- 支持全部、代码、股票、心情、人生、职场、AI、生活、读书感悟、旅行、风景等内容类型；
- 支持中文、English、Tiếng Việt、日本語和한국어；
- 非中文内容可同时返回中文翻译；
- DeepSeek 模型列表自动获取和连接状态检测；
- H5 与 Chrome 扩展共用内容判断和生成模块；
- 支持复制草稿，人工确认后发布。

项目不会自动发布回复，不会自动点赞、转发、关注，也不会读取 X Cookie、密码或 Token。原创增量判断是写作辅助，不代表 X 官方原创资格或收益保证。

## 目录

Monorepo（npm workspaces）：前端按「壳子 + 模块」拆分，共享能力收在 `core`；后端保持单进程共享 SQLite。

```text
packages/
  core/                 共享能力（api 客户端、小组件、图表、常量）
  shell/                工作台大壳子（菜单、首页、设置）
  module-tasks/         待办事项模块
  module-expiring/      到期与提醒模块
  module-x/             X 内容模块（概览、内容库、素材库、回复、风格、统计）
  h5/                   GitHub Pages H5 页面（零构建静态，含共享的 idea-engine）
local-hub/              本地后端（单进程 + SQLite + Bark 推送）
  src/                  后端源码（content-hub、bark、recurrence 等）
  bin/                  开发与安装脚本
tests/                  node:test 测试套件
background.js           Chrome 扩展后台脚本
content.js              X 页面内容提取脚本
manifest.json           Chrome Manifest V3 配置
options.html/js         扩展设置页面
sidepanel.html/js       扩展侧栏
ios-shortcuts/          iOS 快捷指令和说明
```

架构说明：

- `core` 是唯一的共享层：`api`（本地后端客户端）、共享小组件（`SectionCard`、`Metric`、`LoadingButton` 等）、`Chart`/`donutOption` 图表、状态标签常量。禁止各模块重复实现复制、通知、人味等能力。
- `shell` 只负责菜单/路由/主题/布局，以及「首页」和「设置」两个壳子自带页面；它通过模块契约引入 `module-tasks`、`module-expiring`、`module-x`。
- 每个业务模块导出 `Page`（页面组件）与 `Module`（模块契约：id、名称、图标、路径），支持独立构建与独立运行，也作为壳子菜单项。
- 数据共享统一走后端 `/v1` API（`core/api`），前端不存权威数据；后端是唯一数据源。
- `h5` 与 `sidepanel` 共享 `packages/h5/idea-engine.js`（内容判断与生成模块）。

## 使用 H5

1. 在 GitHub 仓库 `Settings → Pages` 中将 Source 设置为 `GitHub Actions`；
2. 推送 `master` 分支后，Pages workflow 会自动部署 `packages/h5/`；
3. 打开部署后的 HTTPS 地址；
4. 在页面右上角设置中填写 DeepSeek API Key；
5. 点击「检测连接」获取当前 Key 可用的模型；
6. 在「原创创作」中读取或粘贴参考素材，调整字数上限，补充自己的新增价值并选择内容形态；也可以切换到「回复建议」「推文优化」。

API Key 只保存在当前浏览器的本地存储中。不要把 API Key 写入代码、提交记录或 GitHub Actions 配置。H5 直接从浏览器请求模型接口，请根据自己的 API 账户和服务条款使用。

## 安装 Chrome 扩展

1. 打开 Chrome 的 `chrome://extensions/`；
2. 开启右上角「开发者模式」；
3. 点击「加载已解压的扩展程序」；
4. 选择本仓库根目录；
5. 打开 X 页面并点击扩展图标；
6. 打开扩展设置填写模型 API Key；「灵感集合」复用同一模型配置；
7. 返回侧栏顶部选择服务商和模型，点击“检测模型”或“获取模型列表”。

修改扩展代码后，在 `chrome://extensions/` 对 X Assistant 点击「重新加载」。GitHub Pages 部署不会自动更新本地开发版扩展。

## 本地工作台（开发）

本地工作台是 `packages/shell` 入口，通过本地后端 `local-hub` 提供数据。

```bash
# 同时启动本地后端（4318）与工作台前端（5173）
npm run dev

# 仅启动工作台前端（Vite）
npm run dev:web

# 仅启动本地后端
npm run dev:hub

# 构建工作台（产物 packages/shell/dist，由后端静态托管）
npm run build:hub

# 安装本地 launch agent（让后端常驻）
npm run install:hub
```

## 测试

```bash
npm test
```

测试覆盖后端内容 hub（待办、到期提醒、Bark 推送、归档、备份等）与共享的 idea-engine（语言检测、原创内容等）。

## 模型接口

默认支持：

- DeepSeek 官方 API：`https://api.deepseek.com`；
- OpenAI-compatible Chat Completions 接口。

DeepSeek 模型列表通过官方 `/models` 接口获取，生成请求使用 `/chat/completions`。

## 自动部署

`.github/workflows/pages.yml` 只在以下内容变化时部署：

- `packages/h5/**`；
- `.github/workflows/pages.yml`。

部署任务需要以下 GitHub Actions 权限：

```yaml
contents: read
pages: write
id-token: write
```

## 协作与提交约定

- Git 提交信息统一使用简体中文，简洁说明本次变更的实际内容；
- 提交前检查当前分支、工作区差异和待提交文件，避免混入无关改动；
- 未经明确要求不执行提交或推送；推送前确认目标分支和远程仓库；
- 不在提交记录、代码或 GitHub Actions 配置中写入 API Key、Token 和其他敏感信息。

## 隐私与安全边界

- 不读取 X Cookie、密码和 X Token；
- 不自动填写回复框或点击发布；
- 「发布计划」仅保存本地候选与用户计划；“已在 X 定时”只能由用户手动确认标记，扩展不会读取或操作 X 的定时日历；
- API Key 由用户在本地配置，不应提交到仓库；
- 发送给模型的帖子内容可能由对应模型服务商处理；
- 使用前请确认模型服务商的隐私政策和数据处理条款；
- 请人工复核模型生成的内容，不要将模型输出视为事实或投资、医疗、法律建议。

## 当前边界

本项目是人工确认辅助工具，不提供自动发布、批量后台抓取、自动点赞、自动转发或自动关注功能。

## License

当前仓库尚未声明开源许可证。如需允许他人正式使用、修改和再分发，请补充明确的 LICENSE 文件。
