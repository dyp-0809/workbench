# Personal Workbench

个人工作台（Personal Workbench）是一个本机优先的个人事务总览工具：在同一台 Mac 上查看并管理待办、信用卡还款与 VPN 续费等到期事项、X 创作行动，以及本机数据状态。X 内容创作作为子模块（X Assistant）保留，Chrome 浏览器扩展、GitHub Pages H5 页面和 iOS 快捷指令继续提供服务。

## 功能

工作台一级导航为「首页、待办事项、到期与提醒、X Assistant、设置」，X Assistant 提供 X 概览及既有内容相关页面。

### 个人事务

- 首页按逾期、当天、未来、无日期和已完成状态汇总待办，并展示已到提醒阈值的到期项与未来 7 天预览；
- 待办事项支持标题、备注、分类、可选截止日期，可完成、重新打开或删除，完成记录保留但默认不显示；
- 到期与提醒支持通用到期项（信用卡还款、VPN 续费、会员到期等），每个到期项配置一个提前提醒天数，到期后手动更新日期或停用，支持 Bark 手机推送；
- 首页可直接新增待办或到期项，完整编辑与历史筛选位于各自模块；
- 设置页展示 SQLite 数据文件路径与大小、Keychain 配置状态、下一次 X 生成时间与只读保留策略，支持 Finder 定位与复制路径；
- 数据保留策略：X 内容与回复可编辑 180 天、只读 30 天后清理；定位与素材保存至主动删除；待办与到期项保存至主动处理、停用、归档或删除；
- 支持手动创建密码加密的完整数据备份与受控恢复，备份排除 Keychain API Key。

### X Assistant

- 以「原创创作」为默认入口，可读取当前 X 帖子、带入当前页热门候选，或在 H5 从粘贴板带入热门话题；素材来源会明确显示且可随时清空；
- 可先根据参考素材生成三份不同的新增价值候选，再由用户选择、修改或补充自己的判断、经验、分析、反例或背景；
- 支持原创短帖、Thread 和 Article 三种内容形态，并给出原创增量判断与补充建议；
- 读取当前 X 帖子和当前页面已加载的可见评论；
- 热门候选会保留作者、链接、读取时间和互动快照，再一键带入原创创作作为可追溯参考素材；
- 生成回复判断、风险提示、切入角度和多条回复草稿，支持 1–5 档人味程度；
- 「灵感集合」以接入的大模型为主要来源，按用户定义一次生成 10 条讨论灵感；
- 「发布计划」可从灵感集合、原创草稿、推荐草稿和优化文案加入本地待发布队列，保存本地计划时间后由用户使用 X 原生日历确认；不会自动填写、定时或发布；
- 支持全部、代码、股票、心情、人生、职场、AI、生活、读书感悟、旅行、风景等内容类型，以及中文、English、Tiếng Việt、日本語和한국어；
- DeepSeek 模型列表自动获取和连接状态检测；
- H5 与 Chrome 扩展共用内容判断和生成模块。

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
  module-stock/         股票模块（统计、仓位管理）
  h5/                   GitHub Pages H5 页面（零构建静态，含 idea-engine）
  chrome-extension/     Chrome 浏览器扩展（Manifest V3）
local-hub/              本地后端（单进程 + SQLite + Bark 推送）
  src/                  后端源码（content-hub、bark、recurrence 等）
  bin/                  开发与安装脚本
tests/                  node:test 测试套件
ios-shortcuts/          iOS 快捷指令和说明
```

架构说明：

- `core` 是唯一的共享层：`api`（本地后端客户端）、共享小组件（`SectionCard`、`Metric`、`LoadingButton` 等）、`Chart`/`donutOption` 图表、状态标签常量。禁止各模块重复实现复制、通知、人味等能力。
- `shell` 只负责菜单/路由/主题/布局，以及「首页」和「设置」两个壳子自带页面；它通过模块契约引入 `module-tasks`、`module-expiring`、`module-x`。
- 每个业务模块导出 `Page`（页面组件）与 `Module`（模块契约：id、名称、图标、路径），支持独立构建与独立运行，也作为壳子菜单项。
- 数据共享统一走后端 `/v1` API（`core/api`），前端不存权威数据；后端是唯一数据源。
- `idea-engine.js` 唯一源在 `packages/h5/`；`packages/chrome-extension/` 的副本由 `npm run dev` 启动时自动同步（Chrome 扩展不能引用扩展目录外的文件），也可手动执行 `npm run sync:extension`。

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
4. 选择 `packages/chrome-extension` 目录；
5. 打开 X 页面并点击扩展图标；
6. 打开扩展设置填写模型 API Key；「灵感集合」复用同一模型配置；
7. 返回侧栏顶部选择服务商和模型，点击“检测模型”或“获取模型列表”。

修改扩展代码后，在 `chrome://extensions/` 对扩展点击「重新加载」。GitHub Pages 部署不会自动更新本地开发版扩展。

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
- API Key 由用户在本地配置，模型 Key 只保存于 macOS Keychain，不应提交到仓库；
- 发送给模型的帖子内容可能由对应模型服务商处理；
- 使用前请确认模型服务商的隐私政策和数据处理条款；
- 请人工复核模型生成的内容，不要将模型输出视为事实或投资、医疗、法律建议。

## 当前边界

本项目是人工确认辅助工具，不提供自动发布、批量后台抓取、自动点赞、自动转发或自动关注功能。

## License

当前仓库尚未声明开源许可证。如需允许他人正式使用、修改和再分发，请补充明确的 LICENSE 文件。
