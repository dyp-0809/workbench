# 当前任务

## 任务

工作台首页二次设计与视觉验收

## 当前阶段

- 状态：`ready-for-review / data-blocked`
- 负责人：@product-strategist → @ui-ux-pro-max-designer/@ux-prototyper → @frontend-engineer → @software-architect → @user

## 最新文件

- `docs/agent-handoffs/PRD.md`：产品目标、当前源码缺口、不可越过的真实数据边界、响应式验收标准和阶段交接。

## 已确认事实

- 1440/1024/375 的布局方向已确认：1440 为 8/4，1024 为上下两段，375 为单列。
- 375 侧栏竖排和顶栏动态问候已修复；最新实现交接记录已证明智能提示、日历、时间线在当前 HMR 页面可见，视觉最终结论仍待设计复核。
- 后端已用 `lunar-javascript` 生成 `lunarLabel`；当前前端按 ADR 在选中日期信息区展示真实农历，未渲染到每个 shadcn/ui Calendar 日期格。
- 股票趋势已从首页范围移除；保留股票盈亏摘要，不再验收首页趋势图表。 
- 当前接口实测 42/42 个日历日期有 `lunarLabel`，示例 `2026-09-19` 为“农历八月初九”。
- shadcn/ui `Calendar` 公开 API 排除 `components/classNames`，内部 `DayButton` 固定；前端未修改 `node_modules`，未实现平行日历。
- 右侧“现在要处理”空态已改为内容驱动，并提供真实“去待办”入口；趋势 JSX、图表配置和空图占位已移除。
- `npm run build:hub` 成功，视图模型测试 8/8 通过；实现证据已写入 `docs/agent-handoffs/IMPLEMENTATION.md`。
- 已接受安全降级：选中日期区展示真实 `lunarLabel`；每日日期格农历另立 shadcn/ui 上游扩展/fork 任务。
- 本轮新增范围：日历缩小为展示组件、创作收件箱移除、股票趋势图移除但保留盈亏可视化、增加经期预测、多条智能提示与克制动效。      
- UI/前端实现已写入 `UI-SPEC.md`、`UX-SPEC.md`、`IMPLEMENTATION.md`：紧凑日历、真实盈亏比例条、多提示单卡流、经期安全空态均已落地。
- 当前 HMR 已生成浅深色 1440/1024/375 截图；构建成功，视图模型测试 8/8 通过，无横向溢出。                                          
- 首页组件边界已确认：`TextAnimate` 仅用于智能提示一次性进入/切换；`Countdown` 仅用于真实到期事项剩余时间，不表达当前时钟或农历；当前时分秒和农历继续消费真实后端字段。
- 本轮优先复用 `TextAnimate`、`Meter/Progress`、`Chip/Badge`、`Skeleton`、`Tooltip`；`Carousel/Popover/DatePicker` 暂不为装饰性增强引入。
- 后续页面复核沿用当前 `5173` HMR 标签页，不新开 tab。

## 下一步

1. @frontend-engineer 按 `API-CONTRACT.md` 验证真实 `personalizedPrompts[]` 和经期安全空态，更新 `IMPLEMENTATION.md`。                
2. @backend-engineer 后续仅在隐私设置接入且有真实周期预测时提供 `menstrualPrediction` 详情，不填充模拟值。                       
3. @ui-ux-pro-max-designer / @software-architect 完成视觉与契约复核；@product-strategist 在数据证据齐备后更新 `REVIEW.md` / `TEST-REPORT.md`。

## 阻塞问题

- 每日日期格农历仍受 shadcn/ui 公开 API 限制，但不再阻塞本轮；日历改为紧凑展示。
- 后端暂只返回 1 条提示，尚无多提示切换的真实数据覆盖。
- 后端暂未提供真实 `menstrualPrediction`，经期卡当前只能验收安全空态。
- `API-CONTRACT.md` 已补齐 `personalizedPrompts[]`、`privacy.menstrualEnabled` 和 `menstrualPrediction` 的默认/隐私关闭/失败语义；当前实测为 1 条提示、隐私关闭、预测 `null`。
- 当前后端当天对应农历字段仍未在 HMR 响应中闭环；前端不得补算或伪造。
- 约 4MB 图标包构建警告仍是独立性能风险，不阻塞本轮功能验收但未解决。

## 最近更新

- 更新人/Profile：@product-strategist
- 变更：确认农历缺失原因为前端未逐格渲染；移除首页股票趋势范围；后续阶段交接统一写入 `docs/agent-handoffs/`。
