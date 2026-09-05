# 实现交接

## 状态

`implementation-in-progress`

## 关联文件

- PRD：`./PRD.md`
- 当前阶段：`./CURRENT.md`
- 视觉规格：`./UI-SPEC.md`
- 交互规格：`./UX-SPEC.md`

## 实现范围

### 已完成

- 首页移除旧 `dashboard-hero` 和“今天，先处理重要的事”，刷新/生成明日内容保留在工作台顶栏。
- 首页按二次设计重排：1440 为提示横向主卡 + 紧凑日历/右侧待办、到期、股票 4 列；创作收件箱和趋势移除；1024 以下改为上下段；375 严格单列。
- 375 侧栏隐藏视觉文字，仅保留图标；导航链接和分组触发器保留 `aria-label`、`title`，避免中文逐字竖排。
- 顶栏首页使用本地动态问候和日期，例如“早上好，9月5日 · 周六”。
- `dashboardViewModel` 消费 `calendar.days/events`、`stockHistory` 和个性化提示契约；不在前端猜算农历或生成股票点位。
- Calendar 仅作紧凑纯展示；选中日期保留真实 `lunarLabel` 摘要，日历不展示农历、不承担纵向时间线。
- “即将到期”按 `Asia/Shanghai` 日期键和时间升序排列。
- 趋势区已按本轮范围移除，保留真实持仓市值/盈亏摘要；未保留股票趋势空图占位。
- 右侧“现在要处理”空态改为内容驱动，并提供真实“去待办”入口，避免被日历网格拉伸成大块空白。
- 本轮三次设计：日历收敛为 `Calendar size="sm"` 紧凑纯展示组件（1440/1024 约 360×339，375 约 233×248），移除股票趋势和创作收件箱；股票保留持仓盈亏摘要；新增经期预测安全空态；提示卡兼容后端多提示数组并提供上一条/下一条切换与 reduced-motion 动效。
- 清理旧首页 CSS 定位：移除 `dashboard-hero`、`dashboard-stock-chart`、`dashboard-summary-grid` 等废弃规则；桌面固定为提示单行→行动/经期→股票/日历，1024/375 固定为提示→待办/到期→经期→股票→日历，所有卡片内容驱动高度。
- 按最新布局交接调整为顶部三栏：智能提示、真实股票盈亏、紧凑 shadcn/ui 日历同一首行；待办/到期/经期预测下方平铺。1024/375 顺序为提示→股票→日历→待办/到期→经期预测；页面滚动保留但隐藏滚动条视觉，避免误判为 Card 内嵌滚动。
- 375 顶栏操作调整为生成明日内容独占一行，刷新数据与备份同排，保留键盘焦点和按钮语义。
- 修复顶部三栏同 Grid 行的默认 `stretch`：提示卡改为 `align-self: start`，不再被紧凑日历高度撑高；页面级滚动容器保留滚动能力并隐藏滚动条视觉，避免产生嵌套页面错觉。
- 日历进一步收紧：移除选中日期大摘要并设置 `showOutsideDays={false}`，当前 HMR 实测日历内容高度约为 1440/1024：296px、375：248px（5 周日期格）；页面级滚动可继续访问完整内容。
- 最终日历卡收口：压缩 shadcn/ui Card Header 的默认 padding/gap，Header 实测 31px；卡片实测 1440：362px、375：315px，未设置统一 min-height。375 已保存 top/middle/bottom 分段滚动截图，底部可见到期列表和经期预测。
- 核对 shadcn/ui `CalendarProps` 后确认公开 API 不支持“当前周 7 天”安全模式；为避免月视图撑高或 CSS 裁剪，本轮改用 shadcn/ui `Button` + 后端真实 `calendar.days` 的 7 日纯展示条，保留日期、星期、事件点、选中态和键盘操作。
- r8 证据：1440/1024 顶部截图及浅/深色 375 滚动截图保存于 `.artifacts/dashboard-qa/dashboard-r8-*`；1440 日历条高度约 147px，375 日历条 y=847、高度约 147px，行动区 y=1093，经期区 y=1766。
- r9 证据纠正：`.artifacts/dashboard-qa/dashboard-r9-light-375-scroll-0.png` 明确记录 `scrollTop=0`，首屏可见智能提示与股票盈亏；`dashboard-r9-light-375-calendar.png` 为 `scrollTop=650`，可见本周日期条和行动区；`dashboard-r9-light-375-actions.png` 为 `scrollTop=1000`，可见待办/到期与经期预测；`dashboard-r9-light-375-period.png` 实际最大 `scrollTop=1071`，可见完整底部模块。当前周 7 个星期标签真实渲染，当前周无真实事件点时不显示点位。
- 首页组件选型补充：智能提示标题使用 Appica `TextAnimate` 的一次性 `rise`/word 动效，仅在提示内容节点切换时触发，并受 `prefers-reduced-motion` 降级；标题区增加真实本地时分秒时钟，并仅在后端当天字段存在时显示 `lunarLabel`。Appica `Countdown` 语义为距离 `targetDate` 的剩余时间，本轮不用于反推当前时钟或农历，后续只可用于真实到期事项倒计时。
- 数字滚动动效：在 `@personal-workbench/core` 新增并导出共享 `NumberRoller`，`Metric` 和首页共同复用；覆盖首页真实时分秒、7 日条日期、智能提示计数、股票市值/盈亏/比例，以及其他页面的数值型 Metric。视觉机制改为 Countdown-like 逐位 slot：每个变化数字位从旧字符上下滚到新字符，货币符号、分隔符和冒号保持稳定；首次进入或真实值变化时执行一次 450ms 过渡，静止值不循环。该组件不承担 Countdown 的目标时间计算，不用来推算当前时间或农历。视觉数字隐藏于屏幕阅读器，最终格式化值保留为可读文本；`prefers-reduced-motion: reduce` 下直接显示最终值。
- 股票模块迁移：`StockStatsPage`、`StockPositionsPage`、`StockEntryPlansPage` 的金额、数量、盈亏比例、仓位比例、PE 和通用 Metric 已复用 `NumberRoller`；仓位管理桌面 HMR 实测 82 个滚动节点、220 个逐位轨道、横向溢出 0。375 移动端仍存在原有宽表溢出 231px，数字组件未造成该溢出，需另立响应式表格修复。
- 智能提示候选轮换：前端仅消费后端 `personalizedPrompts[]`，多候选时读取并保存 `localStorage.dashboard-prompt-index`，打开首页优先切换到下一条以避免连续重复；单候选保持单条。优先级、经期隐私、股票异常和节气/节日是否可用均由后端决定，前端不生成候选或兜底事实。后端现已返回 6 条真实候选（当前来源为 `tasks` + `expiring`），HMR 实测连续两次打开由 `3 / 6` 切换到 `4 / 6`，标题不同；普通 React 重渲染未触发索引推进。
- 7 日条交互边界：当本地今日不在后端 `calendar.days` 窗口内时，默认安全选中窗口首日；当前 HMR 375 实测 7 个按钮、`aria-pressed=true` 与选中 class 各 1 个、横向溢出 0。
- 本轮回归测试新增数组候选顺序测试，视图模型测试为 9/9；构建成功。
- r10 最新 HMR 证据已保存：`.artifacts/dashboard-qa/dashboard-r10-light-1440.png`、`dashboard-r10-light-375.png`、`dashboard-r10-dark-1440.png`、`dashboard-r10-dark-375.png`，四张均从 `scrollTop=0` 采集；另有切换后 `.artifacts/dashboard-qa/dashboard-r10-dark-375-rotated.png`。真实页面状态从 `2 / 6`（家用 GPT 续费提醒）切换为 `3 / 6`（VPN 续费），两次横向溢出均为 0。截图顶部出现的 `375px × 812px` 为浏览器设备模拟工具浮层，不属于页面 DOM；视觉复核应以页面内容区域为准。
- r11 数字动效 served-surface 证据：`.artifacts/dashboard-qa/dashboard-r11-number-roll-1440.png`、`dashboard-r11-number-roll-375.png`。1440/375 均真实渲染 15 个 `NumberRoller`、7 个日期按钮且横向溢出为 0；375 点击下一条提示由“下一步处理：2026 黄山旅行”切换为“提前看一眼：家用 GPT 续费提醒”，切换后观察到 1 个数字动效节点；点击第三个日期后 `aria-pressed` 和选中态各为 1 个。开启 `prefers-reduced-motion` 后动画节点为 0，最终可视值与屏幕阅读器文本一致。r11 的 375 PNG 带浏览器设备浮层，不能作为最终顶部视觉证据。
- r12 顶部证据已纠正：`.artifacts/dashboard-qa/dashboard-r12-light-375-top-nosurface.png` 与 `.artifacts/dashboard-qa/dashboard-r12-light-375-top-surface.png` 均在同一 HMR tab、375 视口、`scrollTop=0` 采集，问候和 `9月5日 · 周六` 完整可见，横向溢出为 0，且不含设备模拟浮层；r12 替代 r11 作为移动顶部视觉证据。
- r13 Countdown-like 逐位滚动证据：`.artifacts/dashboard-qa/dashboard-r13-number-slot-375-top.png`，375 视口、`scrollTop=0`，实际视觉确认时钟、计数和股票金额均为单字符位滚动，无旧值/新值叠加、无横向溢出。
- r14/r15 发现并修复提示标题中间帧裁切：时钟每秒更新曾触发容器入场动画重复，且 Appica `TextAnimate` 自动时钟在 HMR surface 未稳定推进；现改为 `memo` 标题子组件 + 受控 `progress` 0→1，并在 500ms 确定性收尾，移除重复容器动画。最终 r16 复验中标题 opacity=1、内部 transform 归零。
- 修复后端 `dashboardDateKey` 日期正则的双重转义问题，使 `lunar-javascript` 能稳定生成农历标签。

### 未完成

- 设计侧/架构侧最终 PASS 尚未完成；本轮股票趋势已按 ADR 移出范围，不再等待股票历史点位。

### 明确未实现

- 未在前端添加农历算法或第三方 API；日期格逐格农历因 shadcn/ui `CalendarProps` 排除 `components/classNames` 且内部 `DayButton` 固定，当前未实现。
- 未使用静态/模拟股票历史点位；本轮已移除股票趋势，不渲染空图占位。
- 未处理 shadcn/ui 图标包动态导入无效和约 4MB 主 bundle 的独立性能债务。

## 修改文件

| 文件 | 修改内容 | 风险 |
|---|---|---|
| `packages/shell/src/App.jsx` | 首页网格、动态顶栏、紧凑日历、股票盈亏、经期安全空态和窄屏导航可访问名称 | 依赖后端字段；经期详情仅在隐私开启且真实字段存在时显示 |
| `packages/shell/src/dashboardViewModel.js` | 上海时区日期键、事件/到期排序、农历/股票契约适配 | 对后端字段缺失采用明确空态 |
| `packages/shell/src/styles.css` | 8/4 响应式布局、Calendar 内容区宽度、日历节奏、375 侧栏文字隐藏 | 使用局部 `!important` 覆盖 Tailwind 同名网格规则 |
| `local-hub/src/content-hub.js` | 修复 `dashboardDateKey` 日期正则，生成农历标签 | 依赖 `lunar-javascript@1.7.7` |
| `tests/dashboard-view-model.test.js` | 日期、提示、事件排序、股票空态回归测试 | 仅覆盖纯视图模型 |
| `tests/local-hub.test.js` | dashboard 农历天数、非空标签、时区断言 | 测试文件存在其他既有失败用例 |

## 真实接口响应

在当前 `5173` HMR 页面通过 `/v1/dashboard` 读取到：

- `calendar.days`: 42
- `calendar.events`: 6
- `calendar.days` 中非空 `lunarLabel`: 42/42
- 示例：`2026-08-22 → 农历七月初十`；接口中 `2026-09-19 → 农历八月初九`
- `calendar.timezone`: `Asia/Shanghai`
- `personalizedPrompt.title`: `下一步处理：2026 黄山旅行`
- `stockHistory`: `{ available: false, points: [] }`

后端已独立验证 `2026-01-01`、`2027-06-15`、`2028-12-31` 均能由 `lunar-javascript@1.7.7` 返回农历结果。

## 测试命令

```bash
# Node 22（仓库 .nvmrc：22.23.2）
node --test tests/dashboard-view-model.test.js
node --test tests/local-hub.test.js --test-name-pattern='工作台通过服务创建定位和素材'
npm run build:hub
```

## 实际结果

- `tests/dashboard-view-model.test.js`：8/8 通过。
- 后端目标 dashboard 用例通过，新增断言确认 42 天均有 `lunarLabel` 且时区为 `Asia/Shanghai`。
- `npm run build:hub`：成功。

## 本轮 HMR 截图证据

- 浅色：`.artifacts/dashboard-qa/dashboard-r3-light-1440.png`、`dashboard-r3-light-1024.png`、`dashboard-r3-light-375.png`
- 深色：`.artifacts/dashboard-qa/dashboard-r3-dark-1440.png`、`dashboard-r3-dark-1024.png`、`dashboard-r3-dark-375.png`
- 浏览器实测三视口 `scrollWidth - clientWidth = 0`；趋势和创作收件箱文本不存在；经期字段未由当前接口提供，页面展示安全空态。
- 后端测试命令仍执行同文件其他用例，其中既有“回复会话记录”用例失败：`0 !== 2`；该失败与农历修复无关，未修改其业务逻辑。

## HMR 与浏览器证据

- 使用现有标签页：`http://127.0.0.1:5173/`，未重复打开新 tab。
- 1440/1024/375 均验证 `scrollWidth === clientWidth`。
- 1440：12 列 8/4；1024：单列上下段；375：单列，侧栏视觉文字隐藏且导航保留可访问名称。
- 点击日历真实事件日期 `2026-09-19` 后，接口返回并页面展示 `2026-09-19 / 农历八月初九`；时间线实测为 `00:00 到期 → 待安排待办`，操作按钮分别为“去查看/去处理”。
- 当前 HMR 页面验证股票趋势标题和图表空占位均不存在，股票盈亏摘要仍可见；滚动容器已归零后截图。
- 最新浅色截图：
  - `.artifacts/dashboard-qa/no-trend-light-1440.png`
  - `.artifacts/dashboard-qa/no-trend-light-1024.png`
  - `.artifacts/dashboard-qa/no-trend-light-375.png`
- 最新深色截图：
  - `.artifacts/dashboard-qa/no-trend-dark-1440.png`
  - `.artifacts/dashboard-qa/no-trend-dark-1024.png`
  - `.artifacts/dashboard-qa/no-trend-dark-375.png`
- 深色复核结束后已恢复用户原来的浅色主题。

## 未覆盖风险

- `stockHistory.points` 当前为空；本轮股票趋势已移出范围，仅保留真实股票盈亏摘要，因此不以趋势点位作为本轮验收项。
- 当前测试没有完成完整仓库无失败运行；已知无关的回复会话断言失败仍存在。
- 尚未由设计侧确认截图中的首屏视觉节奏，也尚未由架构侧复核最终 bundle/契约。
- 构建保留既有警告：shadcn/ui 图标包动态导入无效、主 bundle 超过 500 kB（约 4 MB）。

## 交接给 Reviewer/QA

- @ui-ux-pro-max-designer：复核六张浅/深色截图，重点检查动态顶栏、375 侧栏、1440 日历连续节奏及卡片信息层级。
- @software-architect：核对 `calendar.days/events`、`stockHistory` 真实字段、上海时区排序和构建警告边界。
- @backend-engineer：提供股票历史真实点位后，复验组合图有值态；继续保留农历边界回归测试。
- QA：在现有 `5173` HMR 标签页复测日历选中态、纵向排序、空态入口、浅/深色和 1440/1024/375 响应式，不以源码存在代替截图证据。
