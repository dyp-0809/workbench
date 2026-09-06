# API 与数据契约

## 状态

`implemented-observed`; the dashboard now computes deterministic prompts from real source data and exposes the expanded queue, source statuses, timing metadata, and canonical menstrual details.

## 关联架构决策

- ADR：`./ADR.md`
- 首页实现交接：`./IMPLEMENTATION.md`

## 接口清单

| 方法 | 路径 | 用途 | 认证 | 状态 |
|---|---|---|---|---|
| GET | `/v1/dashboard` | 返回工作台首页聚合数据、日历事件、个性化提示与股票历史状态 | 本机扩展配对令牌 | 已实现并实测 |

## 响应契约

### 成功

```json
{
  "calendar": {
    "timezone": "Asia/Shanghai",
    "days": [
      { "date": "YYYY-MM-DD", "lunarLabel": "农历七月初十", "hasEvents": false }
    ],
    "events": [
      {
        "id": "task-<id>",
        "date": "YYYY-MM-DD",
        "time": null,
        "title": "待办标题",
        "type": "task",
        "status": "open",
        "action": { "label": "去处理", "page": "tasks", "entityId": "<id>" }
      }
    ]
  },
  "personalizedPrompt": {
    "id": "expiring:overdue",
    "kind": "expiring",
    "priority": 100,
    "title": "先处理已逾期事项：事项名称",
    "reason": "有一项到期提醒已经逾期",
    "source": { "key": "expiring", "label": "到期提醒" },
    "action": { "label": "去查看", "page": "expiring", "entityId": "<id>" },
    "timeContext": "early",
    "count": 2
  },
  "personalizedPrompts": [{ "id": "expiring:overdue", "kind": "expiring", "priority": 100, "title": "先处理已逾期事项：事项名称", "reason": "有一项到期提醒已经逾期", "source": { "key": "expiring", "label": "到期提醒" }, "action": { "label": "去查看", "page": "expiring", "entityId": "<id>" }, "timeContext": "early", "count": 2 }],
  "personalizedPromptGeneratedAt": "2026-08-13T00:00:00.000Z",
  "personalizedPromptTimeContext": "early",
  "privacy": { "menstrualEnabled": true },
  "menstrualCycles": [{ "id": "<id>", "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD", "flow": "medium", "symptoms": "", "notes": "" }],
  "menstrualMoodLogs": [{ "id": "<id>", "loggedOn": "YYYY-MM-DD", "mood": 3, "notes": "" }],
  "menstrualPrediction": null,
  "personalizedSources": {
    "tasks": { "configured": true, "available": true },
    "expiring": { "configured": true, "available": true },
    "calendar": { "configured": true, "available": true },
    "menstrual": { "configured": true, "available": false },
    "stocks": { "configured": true, "available": false, "status": "unconfigured" },
    "content": { "configured": true, "available": false },
    "specialDays": { "configured": false, "available": false }
  },
  "stockAlertResult": { "configured": false, "available": false, "status": "unconfigured", "triggered": [], "deliveryErrors": [], "updatedAt": null },
  "stockHistory": { "available": false, "points": [] }
}
```

### 字段规则

- `calendar.days` 返回当前日期前后 14 天共 42 天；`date` 是 `Asia/Shanghai` 的纯日期键。
- `lunarLabel` 使用本地 `lunar-javascript@1.7.7` 离线计算，MIT 许可；无法计算时为 `null`，前端显示“暂无农历信息”。
- `calendar.events` 当前由有日期的开放待办和到期项生成；`time: null` 的事件由前端统一排在有时间事件之后。提示生成器还接受带真实动作的独立日历事件。
- `personalizedPrompt` 保留为兼容字段，等于 `personalizedPrompts[0]`；`personalizedPrompts` 返回按优先级排列的真实候选，前端基于稳定 ID 游标手动切换，但不会随机伪造或因普通重渲染自动切换。
- 候选顺序为：逾期到期项 → 今日到期项 → 未来 24 小时内可执行日历事件 → 有截止时间的待办与最早未设日期待办 → 真实经期预测/阶段 → 已触发股票异常 → 已明确进入处理流程的内容 → 已配置特殊日子。每个来源不可用时跳过；没有合法候选时返回空数组，不生成励志或 AI 兜底。
- `privacy.menstrualEnabled` 默认 `true`；开启时 `menstrualCycles` 和 `menstrualMoodLogs` 返回真实本地记录；没有真实预测字段时 `menstrualPrediction` 为 `null`；明确关闭来源时详情数组为空且不生成经期预测。
- `stockHistory.points` 没有历史快照数据源时必须为空，不允许静态或模拟点位。

## 缺省与隐私规则

- 无农历数据：`lunarLabel: null`。
- 无股票历史：`stockHistory: { available: false, points: [] }`。
- 经期来源默认开启；开启时回传真实本地记录；只有真实预测字段可用时才回传预测，缺失或失败时保持 `menstrualPrediction: null`。用户明确关闭来源时不回传详情。
- 特殊日子暂无数据源，返回 `configured: false, available: false`，不推断节日或个人纪念日。

## 智能提示目标扩展

- 每条目标候选增加稳定 `id`、`source: { key, label }`、可选 `count` 和 `timeContext`；`action` 增加可选 `entityId`，失效时回退到所属模块。
- 目标响应在 `personalizedPrompts` 中返回最多 3 条已排序、已合并候选，并保留 `personalizedPrompt === personalizedPrompts[0]` 的兼容关系；无合法候选时返回空数组。
- 目标响应增加生成时间和 `Asia/Shanghai` 时间上下文；来源失败只影响对应来源状态，不阻断其他来源候选。

## 失败处理

| HTTP 状态 | 错误码 | 含义 | 客户端处理 |
|---:|---|---|---|
| 401 | - | 本机服务未配对或令牌失效 | 显示配对提示，不展示伪造数据 |
| 500 | - | 聚合数据读取或服务内部错误 | 保留页面结构，显示失败态并允许刷新 |

## 观测记录

- 当前运行中的 `http://127.0.0.1:4318/v1/dashboard` 实测包含 `calendar`、`personalizedPrompt`、`personalizedSources`、`stockHistory`。
- 实测 `calendar.days.length = 42`，农历非空数量为 `42/42`。
- 2026-01-01、2027-06-15、2028-12-31 已通过 `lunar-javascript` 独立边界验证。
- 股票历史当前仍为空态；真实股票点位尚未接入。
