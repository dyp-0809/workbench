# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

个人使用者，主要在自己的本地工作环境中管理日常工作与个人事务。

## Product Purpose

工作台把个人任务、内容生产、AI 能力、资料记录和其他日常工作集中到一个连续的工作流中，减少在多个工具之间切换。成功意味着用户能在本机快速找到上下文、完成下一步操作，并保留可继续编辑的中间产物。

## Positioning

个人工作流中枢：不是单一的任务清单或内容编辑器，而是把任务、内容、AI 辅助和个人记录串成一套可持续使用的本地工作流程。

## Operating Context

用户在本地桌面浏览器中使用工作台，处理待办事项、到期提醒、内容与素材、X 内容生产、AI 提示词与本地 Skills，以及个人记录。数据和配置由本地应用与 SQLite 支撑。

## Capabilities and Constraints

- 当前产品是 React 19、Vite、Tailwind CSS v4、Appica UI 与 Node.js/SQLite 组成的 Web 应用。
- 现有模块包括任务、提醒、X 内容、AI、股票、Kindle、健康、编程记录和设置。
- X 内容工作流包含每日推文、内容库、素材库、回复历史、个人风格和数据统计。
- AI 工作流包含本地提示词管理、Skills 索引和模型配置。
- 当前没有额外记录的用户指定硬约束；后续工作应优先保持现有技术体系和已有业务行为。

## Brand Commitments

产品当前以“工作台”作为用户界面名称，使用中文为主的直接、功能导向表达。

## Evidence on Hand

- 产品入口与模块路由：`packages/shell/src/App.jsx`
- 每日推文页面：`packages/module-x/src/DailyTweetsPage.jsx`
- AI 页面：`packages/module-ai/src/`
- 全局样式与语义令牌：`packages/shell/src/styles.css`
- 本地 API 与数据层：`local-hub/`

## Product Principles

- 让用户从当前上下文直接完成下一步操作。
- 保留可编辑、可复用的中间产物，而不是只提供一次性结果。
- 将跨模块工作串成连续流程，减少重复搬运。
- 保持本地工作环境中的可见性、可控性和可恢复性。
