# 当前任务

## 任务

工作台首页二次设计与视觉验收

## 当前阶段

- 状态：`implemented-observed / ready-for-review`
- 负责人：@frontend-engineer → @software-architect/@ui-ux-pro-max-designer → @product-strategist → @user

## 最新文件

- `docs/agent-handoffs/PRD.md`：产品目标、当前源码缺口、不可越过的真实数据边界、响应式验收标准和阶段交接。

## 已确认事实

- 1440/1024/375 的布局方向已确认：1440 为 8/4，1024 为上下两段，375 为单列。
- 375 侧栏竖排和顶栏动态问候已修复；最新浏览器验收已证明智能提示、日历、时间线在 1440/1024/375 页面可见且无横向溢出。
- 后端已用 `lunar-javascript` 生成 `lunarLabel`；当前前端按 ADR 在选中日期信息区展示真实农历，未渲染到每个 shadcn/ui Calendar 日期格。
- 股票趋势已从首页范围移除；保留股票盈亏摘要，不再验收首页趋势图表。 
- 当前接口实测 42/42 个日历日期有 `lunarLabel`，示例 `2026-09-19` 为“农历八月初九”。
- shadcn/ui `Calendar` 公开 API 排除 `components/classNames`，内部 `DayButton` 固定；前端未修改 `node_modules`，未实现平行日历。
- 右侧“现在要处理”空态已改为内容驱动，并提供真实“去待办”入口；趋势 JSX、图表配置和空图占位已移除。
- `npm run build:hub` 成功；智能提示候选测试 14/14、视图模型测试 10/10 通过；实现证据已写入 `docs/agent-handoffs/IMPLEMENTATION.md`。
- 已接受安全降级：选中日期区展示真实 `lunarLabel`；每日日期格农历另立 shadcn/ui 上游扩展/fork 任务。
- 本轮新增范围：规则驱动的最多 3 条智能提示、稳定 ID 游标与手动切换、日历行动、经期真实记录默认可见、股票异常与内容处理来源接入，以及跨来源实体去重。
- UI/前端实现已写入 `UI-SPEC.md`、`UX-SPEC.md`、`IMPLEMENTATION.md`：紧凑日历、真实盈亏比例条、多提示单卡流、经期真实字段缺失时的安全空态均已落地。
- 当前浏览器验收已覆盖浅深色 1440/1024/375 视口；构建成功，视图模型测试 10/10 通过，无横向溢出。
- 首页组件边界已确认：`TextAnimate` 仅用于智能提示一次性进入/切换；`Countdown` 仅用于真实到期事项剩余时间，不表达当前时钟或农历；当前时分秒和农历继续消费真实后端字段。
- 本轮优先复用 `TextAnimate`、`Meter/Progress`、`Chip/Badge`、`Skeleton`、`Tooltip`；`Carousel/Popover/DatePicker` 暂不为装饰性增强引入。
- 最终浏览器复核使用独立的 `5173` 标签页；不依赖用户当前可见标签页。

## 下一步

1. @software-architect / @ui-ux-pro-max-designer 完成实现后的标准与契约复核。
2. @product-strategist 根据已验证证据更新 `REVIEW.md` / `TEST-REPORT.md`（如需要）。
3. 提交前完成一次全量测试并记录既有失败，不扩大本轮范围。

## 阻塞问题

- 每日日期格农历仍受 shadcn/ui 公开 API 限制，但不再阻塞本轮；日历改为紧凑展示，选中日期信息区展示真实 `lunarLabel`。
- 智能提示生成器覆盖 tasks、expiring、calendar、menstrual、stocks、content、specialDays；各来源仅在存在真实可行动数据时出候选，最多 3 条，无数据时安全跳过。
- 经期来源默认开启并返回真实周期/情绪记录；当前没有后端提供的 canonical `menstrualPrediction` 字段，因此保持 `null`，不从周期记录推断健康结论。
- 股票与特殊日来源在未配置或源不可用时明确返回状态，不阻断任务、到期项和其他首页数据。
- 约 4MB 图标包构建警告仍是独立性能风险，不阻塞本轮功能验收但未解决。

## 最近更新

- 更新人/Profile：@frontend-engineer
- 变更：完成规则驱动首页智能提示及真实来源安全降级；补齐稳定动作导航、跨源去重、经期记录契约与浏览器/测试/构建证据。
